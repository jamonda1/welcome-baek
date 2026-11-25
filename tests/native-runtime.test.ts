// @vitest-environment node
import { expect, it } from 'vitest';
import { nativeAssets, type NativeBatchMetrics, type NativeBatchRequest } from '../src/native/protocol';
import type { BatchEvent } from '../src/testing/sandbox-client';
import { createRuntimeFixture } from './helpers/runtime-fixture';

it('compiles both languages locally, reuses the module and continues after case failures', async () => {
  const native = createRuntimeFixture<NativeBatchRequest, NativeBatchMetrics>('native', nativeAssets);
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
