import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Worker } from 'node:worker_threads';
import type { BatchEvent, BatchRequest } from '../../src/testing/sandbox-client';

export function createRuntimeFixture<Request extends BatchRequest, Metrics>(
  name: string, assetNames: readonly string[]
) {
  type Message = BatchEvent | { type: 'done'; metrics: Metrics };
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
    globalThis.fetch = () => { throw new Error('Unexpected network access from sandbox worker'); };
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

  runInNewContext(readFileSync('dist/' + name + '-sandbox.js', 'utf8'), {
    ArrayBuffer, Uint8Array, WebAssembly, parent, setTimeout, clearTimeout,
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

  const assets = Object.fromEntries(assetNames.map(asset => [
    asset, new Uint8Array(readFileSync('dist/' + name + '/' + asset)).buffer
  ]));
  let sendAssets = true;
  const run = (request: Request) => new Promise<{
    events: BatchEvent[]; metrics: Metrics
  }>(resolve => {
    const events: BatchEvent[] = [];
    receive({
      source: parent,
      data: { type: 'welcome-baek-' + name + '-batch', request, ...(sendAssets ? { assets } : {}) },
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

