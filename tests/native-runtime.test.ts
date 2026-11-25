// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Worker } from 'node:worker_threads';
import { expect, it } from 'vitest';
import { nativeAssets, type NativeBatchMetrics, type NativeBatchRequest } from '../src/native/protocol';
import type { BatchEvent } from '../src/testing/sandbox-client';

type Message = BatchEvent | { type: 'done'; metrics: NativeBatchMetrics };

function sandbox() {
  const parent = {};
  const scripts = new Map<string, string>();
  const active = new Set<Worker>();
  const actions: string[] = [];
  let receive!: (event: unknown) => void;
  let nextUrl = 0;

  const bootstrap = `
    const { parentPort, workerData } = require('node:worker_threads');
    const vm = require('node:vm');
    globalThis.self = globalThis;
    globalThis.location = new URL('blob:null/welcome-baek');
    globalThis.WorkerGlobalScope = class {};
    globalThis.process = undefined;
    globalThis.fetch = () => { throw new Error('Unexpected network access from C/C++ worker'); };
    globalThis.postMessage = value => parentPort.postMessage(value);
    globalThis.addEventListener = (_type, listener) => parentPort.on('message', data => listener({ data }));
    vm.runInThisContext(workerData);
  `;
  class BrowserWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (error: unknown) => void;
    private worker: Worker;

    constructor(url: string) {
      this.worker = new Worker(bootstrap, { eval: true, workerData: scripts.get(url) });
      active.add(this.worker);
      this.worker.on('message', data => this.onmessage?.({ data }));
      this.worker.on('error', error => this.onerror?.(error));
    }

    postMessage(task: { action: string }) {
      actions.push(task.action);
      this.worker.postMessage(task);
    }

    terminate() {
      active.delete(this.worker);
      void this.worker.terminate();
    }
  }

  runInNewContext(readFileSync('dist/native-sandbox.js', 'utf8'), {
    ArrayBuffer, parent, setTimeout, clearTimeout,
    window: { addEventListener(_type: string, listener: typeof receive) { receive = listener; } },
    Worker: BrowserWorker,
    Blob: class { constructor(readonly parts: string[]) {} },
    URL: {
      createObjectURL(blob: { parts: string[] }) {
        const url = String(nextUrl++);
        scripts.set(url, blob.parts.join(''));
        return url;
      },
      revokeObjectURL(url: string) { scripts.delete(url); }
    },
  });

  const assets = Object.fromEntries(nativeAssets.map(name => [
    name, new Uint8Array(readFileSync('dist/native/' + name)).buffer
  ]));
  let sendAssets = true;
  const run = (request: NativeBatchRequest) => new Promise<{
    events: BatchEvent[]; metrics: NativeBatchMetrics
  }>(resolve => {
    const events: BatchEvent[] = [];
    receive({
      source: parent,
      data: { type: 'welcome-baek-native-batch', request, ...(sendAssets ? { assets } : {}) },
      ports: [{
        postMessage(message: Message) {
          if (message.type !== 'done') events.push(message);
          else resolve({ events, metrics: message.metrics });
        },
        close() {}
      }],
    });
    sendAssets = false;
  });

  return { run, actions, close: () => Promise.all([...active].map(worker => worker.terminate())) };
}

it('compiles both languages locally, reuses the module and continues after case failures', async () => {
  const native = sandbox();
  const results = (events: BatchEvent[]) => events.flatMap(event => event.type === 'result' ? [event.result] : []);
  const c = `
    #include <stdio.h>
    static int calls;
    int main(void) {
      int value;
      if (scanf("%d", &value) != 1) return 2;
      if (value == 0) {
        volatile unsigned loop = 0;
        for (;;) ++loop;
      }
      printf("%d\\n", value + ++calls);
    }
  `;
  const cpp = `
    #include <bits/stdc++.h>
    static_assert(__cplusplus == 201703L);
    int main() {
      long long a, b;
      std::cin >> a >> b;
      std::vector<long long> numbers{a, b};
      std::sort(numbers.begin(), numbers.end());
      std::cout << numbers[0] << " " << numbers[1] << '\\n';
    }
  `;
  try {
    const first = await native.run({ language: 'c', source: c, inputs: ['0', '4', 'invalid', '6'] });
    expect(first.events.map(event => [event.type, event.index])).toEqual([
      ['start', 0], ['result', 0], ['start', 1], ['result', 1],
      ['start', 2], ['result', 2], ['start', 3], ['result', 3],
    ]);
    expect(results(first.events)).toEqual([
      { output: '', error: expect.stringContaining('시간 초과 (5초)') }, { output: '5\n' },
      { output: '', error: expect.stringContaining('종료 코드 2') }, { output: '7\n' }
    ]);
    expect(native.actions).toEqual(['compile', 'execute', 'execute', 'execute', 'execute']);

    const second = await native.run({
      language: 'cpp', source: cpp, inputs: ['4000000000 -3', '5 2', '-4 -9']
    });
    expect(results(second.events)).toEqual([
      { output: '-3 4000000000\n' }, { output: '2 5\n' }, { output: '-9 -4\n' }
    ]);
    expect(second.metrics.cached).toBe(false);

    const again = await native.run({ language: 'c', source: c, inputs: ['10'] });
    expect(results(again.events)).toEqual([{ output: '11\n' }]);
    expect(again.metrics.cached).toBe(true);

    const error = await native.run({ language: 'cpp', source: 'int main( {', inputs: ['a', 'b'] });
    expect(results(error.events)).toEqual([
      { output: '', error: expect.stringContaining('error:') },
      { output: '', error: expect.stringContaining('error:') }
    ]);
    expect(native.actions.filter(action => action === 'compile')).toHaveLength(3);
    expect(native.actions.filter(action => action === 'execute')).toHaveLength(8);
  } finally {
    await native.close();
  }
}, 30_000);
