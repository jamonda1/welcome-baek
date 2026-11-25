import { expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { codeKey } from '../src/storage/storage';
import { caseKey, type TestCase } from '../src/testing/cases';
import type { JavaResult } from '../src/java/protocol';
import type { BatchEvent, BatchRequest } from '../src/testing/sandbox-client';

const { runJava, runPythonBatch, runC, runCpp } = vi.hoisted(() => ({
  runJava: vi.fn(), runPythonBatch: vi.fn(), runC: vi.fn(), runCpp: vi.fn()
}));
vi.mock('../src/native/client', () => ({ nativeRunnerAvailable: () => true, runC, runCpp }));
vi.mock('../src/python/client', () => ({ pythonRunnerAvailable: () => true, runPythonBatch }));
vi.mock('../src/java/client', () => ({ javaRunnerAvailable: () => true,
  runJavaBatch: async (request: { source: string; inputs: string[] }, emit: (event: unknown) => void) => {
    for (const [index, input] of request.inputs.entries()) {
      emit({ type: 'start', index });
      let result: JavaResult;
      try { result = await runJava({ source: request.source, input }); }
      catch (error) { result = { output: '', error: String(error) }; }
      emit({ type: 'result', index, result });
    }
  }
}));
const ticks = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

it('runs every snapshotted case sequentially, continues after errors and keeps the lock until all results are ready', async () => {
  const source = 'public class Main {}';
  const cases: TestCase[] = [
    { id: 'a', input: '1 2', expected: '3' },
    { id: 'b', input: '2 3', expected: '5' },
    { id: 'c', input: '3 4', expected: '7' },
    { id: 'd', input: '4 5', expected: '' }
  ];
  const data: Record<string, unknown> = {
    [codeKey('1000', 'java')]: { code: source }, [caseKey('1000')]: cases
  };
  vi.stubGlobal('chrome', { storage: { local: {
    get: async () => structuredClone(data),
    set: async (items: Record<string, unknown>) => { Object.assign(data, structuredClone(items)); }
  } } });
  const completions: { resolve: (value: JavaResult) => void; reject: (reason: Error) => void }[] = [];
  runJava.mockImplementation(() => new Promise<JavaResult>((resolve, reject) => { completions.push({ resolve, reject }); }));
  document.body.innerHTML = '<main class="container content"><h1>1000</h1></main>';
  await import('../src/content/problem');
  await ticks();
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
  const button = document.querySelector<HTMLButtonElement>('#welcome-baek-run')!;
  const language = document.querySelector<HTMLSelectElement>('#welcome-baek-language')!;
  const input = document.querySelector<HTMLTextAreaElement>('#welcome-baek-case-input')!;
  const results = document.querySelector<HTMLButtonElement>('#welcome-baek-results')!;
  document.querySelectorAll<HTMLButtonElement>('.wb-case-list button')[2].click();
  button.click();
  const busy = (index: number) => {
    expect(button.textContent).toContain(`(${index}/4)`);
    expect(button.disabled).toBe(true);
    expect(view.state.readOnly).toBe(true);
    expect(language.disabled).toBe(true);
    expect(runJava).toHaveBeenCalledTimes(index);
  };
  busy(1);
  const verdicts = () => Array.from(document.querySelectorAll<HTMLElement>('.wb-result-list > details'), card => card.dataset.verdict);
  expect(verdicts()).toEqual(['running', 'queued', 'queued', 'queued']);
  expect(results.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('.wb-result-notice')!.textContent).toContain('0/4 완료');
  // Selecting case 3 must not skip cases 1 and 2, or change the order.
  expect(runJava).toHaveBeenLastCalledWith({ source, input: '1 2' });
  button.click();
  expect(runJava).toHaveBeenCalledTimes(1);
  // Later case edits must not mutate the batch that has already started.
  input.value = 'changed during run';
  input.dispatchEvent(new Event('input'));
  completions[0].resolve({ output: '3\r\n' });
  await ticks();
  busy(2);
  expect(verdicts()).toEqual(['passed', 'running', 'queued', 'queued']);
  expect(document.querySelector('.wb-result-notice')!.textContent).toContain('1/4 완료');
  const firstCard = document.querySelector<HTMLDetailsElement>('.wb-result-list > details')!;
  firstCard.querySelector('summary')!.click();
  expect(firstCard.open).toBe(true);
  completions[1].reject(new Error('Java 실행 시간 초과 (5초)'));
  await ticks();
  busy(3);
  expect(verdicts()).toEqual(['passed', 'error', 'running', 'queued']);
  expect(document.querySelector('.wb-result-list > details')).toBe(firstCard);
  expect(firstCard.open).toBe(true);
  expect(runJava).toHaveBeenLastCalledWith({ source, input: '3 4' });
  completions[2].resolve({ output: 'wrong answer' });
  await ticks();
  busy(4);
  expect(verdicts()).toEqual(['passed', 'error', 'failed', 'running']);
  completions[3].resolve({ output: '9\n' });
  await ticks();
  expect(runJava.mock.calls.map(call => call[0].input)).toEqual(cases.map(item => item.input));
  expect(view.state.readOnly).toBe(false);
  expect(language.disabled).toBe(false);
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-busy')).toBe('false');
  expect(document.querySelector('.wb-result-notice')!.textContent).not.toContain('테스트 실행 중');
  expect(results.getAttribute('aria-expanded')).toBe('true');
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.wb-result-list > details'));
  expect(cards.map(card => card.dataset.verdict)).toEqual(['passed', 'error', 'failed', 'output']);
  expect(cards.map(card => card.querySelector('.wb-result-badge')!.textContent))
    .toEqual(['케이스 1', '케이스 2', '케이스 3', '케이스 4']);
  expect(cards[1].textContent).toContain('시간 초과');
  expect(document.querySelector('.wb-result-notice')!.textContent).toContain('이전 실행 결과');
  results.click();
  results.click();
  expect(document.querySelectorAll('.wb-result-list > details')).toHaveLength(4);
  expect(runJava).toHaveBeenCalledTimes(4);

  const pythonSource = 'print(input())';
  data[codeKey('1000', 'python')] = { code: pythonSource };
  const echoCases = async (request: BatchRequest, emit: (event: BatchEvent) => void) => {
    for (const [index, output] of request.inputs.entries()) {
      emit({ type: 'start', index });
      emit({ type: 'result', index, result: { output } });
    }
  };
  runPythonBatch.mockImplementation(echoCases);
  language.value = 'python';
  language.dispatchEvent(new Event('change'));
  await ticks();
  expect(button.disabled).toBe(false);
  expect(view.state.doc.toString()).toBe(pythonSource);
  button.click();
  await ticks();
  expect(runJava).toHaveBeenCalledTimes(4);
  expect(runPythonBatch).toHaveBeenCalledOnce();
  expect(runPythonBatch.mock.calls[0][0]).toEqual({
    source: pythonSource,
    inputs: ['1 2', '2 3', 'changed during run', '4 5']
  });
  expect(verdicts()).toEqual(['failed', 'failed', 'failed', 'output']);
  expect(button.disabled).toBe(false);
  for (const [selection, runner] of [['c', runC], ['cpp', runCpp]] as const) {
    const source = 'int main() { return 0; }';
    data[codeKey('1000', selection)] = { code: source };
    runner.mockImplementation(echoCases);
    language.value = selection;
    language.dispatchEvent(new Event('change'));
    await ticks();
    expect(button.disabled).toBe(false);
    button.click();
    await ticks();
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0][0]).toEqual({
      source, inputs: ['1 2', '2 3', 'changed during run', '4 5']
    });
    expect(verdicts()).toEqual(['failed', 'failed', 'failed', 'output']);
  }
  window.dispatchEvent(new Event('pagehide'));
  await ticks();
});
