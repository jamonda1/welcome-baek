// @vitest-environment node
import { expect, it } from 'vitest';
import { javascriptAssets, type JavaScriptMetrics } from '../src/javascript/protocol';
import type { BatchEvent, BatchRequest } from '../src/testing/sandbox-client';
import { createRuntimeFixture } from './helpers/runtime-fixture';

it('reuses compiled code, isolates cases, and supports local Node.js-style standard streams', async () => {
  const runtime = createRuntimeFixture<BatchRequest, JavaScriptMetrics>('javascript', javascriptAssets);
  const results = (events: BatchEvent[]) => events.flatMap(event => event.type === 'result' ? [event.result] : []);

  try {
    const source = `
      const fs = require('node:fs');
      const input = fs.readFileSync(0);
      if (!Buffer.isBuffer(input)) throw new Error('stdin should be a Buffer');
      if (typeof fetch !== 'undefined' || typeof document !== 'undefined') throw new Error('Unexpected browser API');
      if (input.toString() === 'loop') while (true) {}
      if (input.toString() === 'exit') process.exit(9);
      if (input.toString() === 'throw') throw new Error('case error');
      const text = Buffer.from(input.toString('utf8').toUpperCase());
      process.stdout.write(text.subarray(0, 1));
      process.stdout.write(text.subarray(1));
      console.log(' %d', globalThis.count = (globalThis.count || 0) + 1);
    `;
    const inputs = ['loop', '하이🌱', 'exit', 'throw', 'last'];
    const first = await runtime.run({ source, inputs });
    expect(first.events.map(event => [event.type, event.index])).toEqual(
      inputs.flatMap((_input, index) => [['start', index], ['result', index]])
    );
    expect(results(first.events)).toEqual([
      { output: '', error: expect.stringContaining('시간 초과 (5초)') },
      { output: '하이🌱 1\n' },
      { output: '', error: expect.stringContaining('종료 코드 9') },
      { output: '', error: expect.stringContaining('case error') },
      { output: 'LAST 1\n' },
    ]);
    expect(runtime.actions.filter(action => action === 'compile')).toHaveLength(1);

    const again = await runtime.run({ source, inputs: ['again'] });
    expect(again.metrics.cached).toBe(true);
    expect(results(again.events)).toEqual([{ output: 'AGAIN 1\n' }]);
    expect(runtime.actions.filter(action => action === 'compile')).toHaveLength(1);

    const readline = await runtime.run({
      source: `
        const rl = require('readline').createInterface({ input: process.stdin });
        (async () => {
          for await (const line of rl) console.log(line);
        })();
      `,
      inputs: ['alpha\r\nbeta\n', 'gamma'],
    });
    expect(results(readline.events)).toEqual([{ output: 'alpha\nbeta\n' }, { output: 'gamma\n' }]);

    const data = await runtime.run({
      source: `
        process.stdin.setEncoding('utf8').on('data', chunk => process.stdout.write(chunk));
        process.stdin.once('end', () => process.stdout.write('!'));
      `,
      inputs: ['input'],
    });
    expect(results(data.events)).toEqual([{ output: 'input!' }]);

    const errors = await runtime.run({ source: 'console.log(', inputs: ['1', '2'] });
    expect(results(errors.events)).toEqual([
      { output: '', error: expect.stringContaining('SyntaxError') },
      { output: '', error: expect.stringContaining('SyntaxError') },
    ]);

    const rejected = await runtime.run({
      source: "Promise.resolve().then(() => { throw new Error('async failure'); });",
      inputs: [''],
    });
    expect(results(rejected.events)).toEqual([{ output: '', error: 'UnhandledPromiseRejection: async failure' }]);

    const exitsEarly = await runtime.run({
      source: "console.log('before'); process.exit(0); console.log('after');",
      inputs: [''],
    });
    expect(results(exitsEarly.events)).toEqual([{ output: 'before\n' }]);
  } finally {
    await runtime.close();
  }
}, 30_000);
