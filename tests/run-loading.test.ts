import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { codeKey } from '../src/storage/storage';
import type { JavaResult } from '../src/java/protocol';

const { runJava } = vi.hoisted(() => ({ runJava: vi.fn() }));
vi.mock('../src/java/client', () => ({ javaRunnerAvailable: () => true,
  runJavaBatch: async (request: { source: string; inputs: string[] }, emit: (event: unknown) => void) => {
    emit({ type: 'start', index: 0 });
    emit({ type: 'result', index: 0, result: await runJava({ source: request.source, input: request.inputs[0] }) });
  }
}));
const ticks = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const source = 'public class Main { public static void main(String[] args) {} }';

beforeAll(async () => {
  const data: Record<string, unknown> = { [codeKey('1000', 'java')]: { code: source } };
  vi.stubGlobal('chrome', { storage: { local: {
    get: async () => ({ ...data }),
    set: async (items: Record<string, unknown>) => { Object.assign(data, items); }
  } } });
  document.body.innerHTML = '<main class="container content"><pre id="sample-input-1">1 2</pre>' +
    '<pre id="sample-output-1">3</pre></main>';
  await import('../src/content/problem');
  await ticks();
});
afterAll(() => vi.unstubAllGlobals());

const endings: { label: string; result?: JavaResult; rejection?: Error }[] = [
  { label: 'successful execution', result: { output: '3\n' } },
  { label: 'wrong output', result: { output: '4\n' } },
  { label: 'compile error', result: { output: '', error: 'Java 컴파일 오류' } },
  { label: 'runtime error', result: { output: '', error: 'ArithmeticException' } },
  { label: 'time limit', result: { output: '', error: 'Java 실행 시간 초과 (5초)' } },
  { label: 'runner startup rejection', rejection: new Error('실행 환경 로드 실패') }
];
it.each(endings)('shows busy state, blocks changes and unlocks after $label', async ending => {
  let resolve!: (result: JavaResult) => void;
  let reject!: (reason: Error) => void;
  runJava.mockImplementationOnce(() => new Promise<JavaResult>((done, fail) => { resolve = done; reject = fail; }));
  const button = document.querySelector<HTMLButtonElement>('#welcome-baek-run')!;
  const language = document.querySelector<HTMLSelectElement>('#welcome-baek-language')!;
  const container = document.querySelector<HTMLElement>('#welcome-baek-editor')!;
  const indicator = document.querySelector<HTMLElement>('#welcome-baek-execution-status')!;
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
  view.dispatch({ selection: { anchor: 12 } });
  const calls = runJava.mock.calls.length;
  expect(button.disabled).toBe(false);
  button.click();
  expect(runJava).toHaveBeenLastCalledWith({ source, input: '1 2' });
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.dataset.running).toBe('true');
  expect(button.textContent).toBe('Java 실행 중… (1/1)');
  expect(indicator.hidden).toBe(false);
  expect(container.dataset.running).toBe('true');
  expect(container.getAttribute('aria-busy')).toBe('true');
  expect(view.state.readOnly).toBe(true);
  expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
  expect(language.disabled).toBe(true);
  button.click();
  expect(runJava.mock.calls.length).toBe(calls + 1);
  // A queued/synthetic change must not replace the document while running.
  language.value = 'python';
  language.dispatchEvent(new Event('change'));
  expect(language.value).toBe('java');
  const theme = document.querySelector<HTMLSelectElement>('#welcome-baek-theme')!;
  theme.value = 'one-dark';
  theme.dispatchEvent(new Event('change'));
  await ticks();
  expect(view.state.readOnly).toBe(true);
  expect(view.state.doc.toString()).toBe(source);
  expect(view.state.selection.main.anchor).toBe(12);
  if (ending.rejection) reject(ending.rejection);
  else resolve(ending.result!);
  await ticks();
  expect(view.state.readOnly).toBe(false);
  expect(view.contentDOM.getAttribute('contenteditable')).toBe('true');
  expect(language.disabled).toBe(false);
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-busy')).toBe('false');
  expect(button.dataset.running).toBe('false');
  expect(button.textContent).toBe('▷ 코드 실행');
  expect(container.getAttribute('aria-busy')).toBe('false');
  expect(indicator.hidden).toBe(true);
  expect(view.state.doc.toString()).toBe(source);
  expect(view.state.selection.main.anchor).toBe(12);
  expect(document.querySelector('#welcome-baek-results')!.getAttribute('aria-expanded')).toBe('true');
  if (ending.rejection || ending.result?.error) {
    expect(document.querySelector('#welcome-baek-drawer')!.textContent).toContain(ending.rejection?.message ?? ending.result?.error);
  }
});
