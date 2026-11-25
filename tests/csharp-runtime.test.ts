// @vitest-environment node
import { expect, it } from 'vitest';
import { csharpAsset, type CSharpBatchMetrics } from '../src/csharp/protocol';
import type { BatchEvent, BatchRequest } from '../src/testing/sandbox-client';
import { createRuntimeFixture } from './helpers/runtime-fixture';

it('compiles C# once, keeps case state isolated, and continues after case failures', async () => {
  const runtime = createRuntimeFixture<BatchRequest, CSharpBatchMetrics>('csharp', [csharpAsset]);
  const results = (events: BatchEvent[]) => events.flatMap(event => event.type === 'result' ? [event.result] : []);
  const source = `
    using System.Numerics;
    namespace WelcomeBaek;
    static class Program {
      static int count;
      static int Main() {
        string input = Console.ReadLine()!;
        if (input == "loop") while (true) {}
        if (input == "exit") return 9;
        if (input == "throw") throw new InvalidOperationException("case failed");
        var sum = input.Split().Select(BigInteger.Parse).Aggregate(BigInteger.Add);
        Console.WriteLine($"{sum} {++count}");
        return 0;
      }
    }
  `;
  try {
    const inputs = ['loop', '10000000000000000000000 3', 'exit', 'throw', '7 8'];
    const first = await runtime.run({ source, inputs });
    expect(first.events.map(event => [event.type, event.index]), JSON.stringify(first.events)).toEqual(
      inputs.flatMap((_input, index) => [['start', index], ['result', index]])
    );
    expect(results(first.events)).toEqual([
      { output: '', error: expect.stringContaining('시간 초과 (5초)') },
      { output: '10000000000000000000003 1\n' },
      { output: '', error: expect.stringContaining('종료') },
      { output: '', error: expect.stringContaining('case failed') },
      { output: '15 1\n' },
    ]);
    expect(runtime.actions.filter(action => action === 'compile')).toHaveLength(1);

    const warm = await runtime.run({ source, inputs: ['4 2'] });
    expect(warm.metrics.cached).toBe(true);
    expect(results(warm.events)).toEqual([{ output: '6 1\n' }]);
    expect(runtime.actions.filter(action => action === 'prepare')).toHaveLength(1);
    expect(runtime.actions.filter(action => action === 'compile')).toHaveLength(1);

    const syntax = await runtime.run({ source: 'Console.WriteLine(3)', inputs: ['1', '2'] });
    expect(results(syntax.events)).toEqual([
      { output: '', error: expect.stringContaining('CS1002') },
      { output: '', error: expect.stringContaining('CS1002') },
    ]);

    const stream = await runtime.run({
      source: `using var input = new StreamReader(Console.OpenStandardInput());
      Console.Write(input.ReadToEnd());`,
      inputs: ['한글 🌱\n', ''],
    });
    expect(results(stream.events)).toEqual([{ output: '한글 🌱\n' }, { output: '' }]);
  } finally {
    await runtime.close();
  }
}, 60_000);
