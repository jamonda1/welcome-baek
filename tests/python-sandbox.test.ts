// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { pythonAssets, type PythonTask } from '../src/python/protocol';
import type { BatchEvent } from '../src/testing/sandbox-client';

const ticks = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

function fixture() {
  const workers: FakeWorker[] = [];
  const parent = {};
  type BatchMessage = BatchEvent | { type: 'done'; metrics: { cached: boolean } };
  let listener!: (event: unknown) => void;

  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    task?: PythonTask;
    terminate = vi.fn();
    constructor() { workers.push(this); }
    postMessage(message: { task: PythonTask }) { this.task = message.task; }
    reply(data: unknown) { this.onmessage?.({ data }); }
  }

  vm.runInNewContext(readFileSync('dist/python-sandbox.js', 'utf8'), {
    window: { addEventListener(_type: string, handler: typeof listener) { listener = handler; } }, parent,
    Worker: FakeWorker, Blob: class {}, URL: { createObjectURL: () => 'worker', revokeObjectURL: vi.fn() },
    ArrayBuffer, setTimeout, clearTimeout
  });

  function request(source: string, inputs: string[]) {
    const messages: BatchMessage[] = [];
    listener({
      source: parent,
      data: {
        type: 'welcome-baek-python-batch', request: { source, inputs },
        assets: Object.fromEntries(pythonAssets.map(name => [name, new ArrayBuffer(1)]))
      },
      ports: [{ postMessage: (value: BatchMessage) => messages.push(value), close: vi.fn() }]
    });
    return messages;
  }

  return { workers, request };
}

it('reuses one compilation across every case and across runs with unchanged source', async () => {
  const { workers, request } = fixture();
  const bytecode = new Uint8Array([1, 2]);
  const inputs = ['first', 'second', 'third'];
  const messages = request('source', inputs);

  expect(workers[0].task).toEqual({ action: 'compile', source: 'source' });
  workers[0].reply({ output: '', bytecode });
  await ticks();
  for (const [index, input] of inputs.entries()) {
    const worker = workers[index + 1];
    expect(worker.task).toEqual({ action: 'execute', input, bytecode });
    worker.reply({ output: input });
    await ticks();
    expect(worker.terminate).toHaveBeenCalledOnce();
  }
  expect(messages).toEqual([
    ...inputs.flatMap((output, index) => [
      { type: 'start', index }, { type: 'result', index, result: { output } }
    ]),
    { type: 'done', metrics: { cached: false } }
  ]);
  const warm = request('source', ['new input']);
  expect(workers[4].task).toEqual({ action: 'execute', input: 'new input', bytecode });
  workers[4].reply({ output: 'new input' });
  await ticks();
  expect(warm.at(-1)).toEqual({ type: 'done', metrics: { cached: true } });

  const changed = request('edited source', inputs);
  expect(workers[5].task).toEqual({ action: 'compile', source: 'edited source' });
  workers[5].reply({ output: '', error: 'SyntaxError' });
  await ticks();
  expect(workers).toHaveLength(6);
  expect(changed.filter(message => message.type === 'result')).toEqual(
    inputs.map((_input, index) => ({ type: 'result', index, result: { output: '', error: 'SyntaxError' } }))
  );
});

it('continues with the same bytecode after a case times out', async () => {
  vi.useFakeTimers();
  const { workers, request } = fixture();
  const bytecode = new Uint8Array([1, 2]);
  const messages = request('source', ['loop', 'next']);
  workers[0].reply({ output: '', bytecode });
  await ticks();

  workers[1].reply({ phase: 'running' });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(workers[1].terminate).toHaveBeenCalledOnce();
  expect(messages[1]).toMatchObject({ type: 'result', index: 0, result: { error: expect.stringContaining('시간 초과') } });
  expect(workers[2].task).toEqual({ action: 'execute', input: 'next', bytecode });
  workers[2].reply({ output: 'ok' });
  await ticks();
  expect(messages.slice(-2)).toEqual([
    { type: 'result', index: 1, result: { output: 'ok' } },
    { type: 'done', metrics: { cached: false } }
  ]);
});
