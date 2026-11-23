import { BufferedValue } from '../storage/persistence';
import { Repository } from '../storage/storage';

export interface TestCase { id: string; input: string; expected: string }
export const caseKey = (problemId: string) => `welcome-baek:v1:cases:${problemId}`;
export const MAX_CASES = 50;

export function readSamples(root: ParentNode): TestCase[] {
  const samples: TestCase[] = [];
  for (const input of root.querySelectorAll<HTMLElement>('[id^="sample-input-"]')) {
    const number = /^sample-input-(\d+)$/.exec(input.id)?.[1];
    if (!number) continue;
    const output = root.querySelector<HTMLElement>(`#sample-output-${number}`);
    if (output) samples.push({ id: `sample-${number}`, input: input.textContent ?? '', expected: output.textContent ?? '' });
    if (samples.length === MAX_CASES) break;
  }
  return samples;
}

export function validateCases(value: unknown): TestCase[] {
  if (!Array.isArray(value) || value.length > MAX_CASES || value.some(item =>
    !item || typeof item.id !== 'string' || !item.id || item.id.length > 100 ||
    typeof item.input !== 'string' || typeof item.expected !== 'string') ||
    new Set(value.map(item => item.id)).size !== value.length) {
    throw new Error('저장된 테스트 케이스 형식을 읽을 수 없습니다. 기존 데이터는 유지됩니다');
  }
  return value.map(({ id, input, expected }) => ({ id, input, expected }));
}

export class TestCases {
  writer?: BufferedValue<TestCase[]>;
  error: unknown;
  private pending?: Promise<void>;
  constructor(private repository: Repository, private problemId: string,
    private samples: () => TestCase[], private notify: () => void) {}

  load(): Promise<void> {
    if (this.writer) return Promise.resolve();
    if (this.pending) return this.pending;
    this.error = undefined;
    this.pending = this.repository.readValue(caseKey(this.problemId)).then(value => {
      // Missing data alone permits samples. Failed/malformed reads never become writes.
      const initial = value === undefined ? this.samples() : validateCases(value);
      this.writer = new BufferedValue(initial,
        cases => this.repository.writeValue(caseKey(this.problemId), cases), this.notify);
    }).catch(error => { this.error = error; }).finally(() => {
      this.pending = undefined;
      this.notify();
    });
    return this.pending;
  }
}
