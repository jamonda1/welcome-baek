import { afterEach, describe, expect, it, vi } from 'vitest';
import { Repository } from '../src/storage/storage';
import { caseKey, readSamples, TestCases } from '../src/testing/cases';
import { WorkspaceDrawer, type RunResult } from '../src/testing/drawer';

const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const sample = { id: 'sample-1', input: '1 2\n', expected: '3\n' };
function storage(seed: Record<string, unknown> = {}) {
  const data = structuredClone(seed);
  const area = { get: vi.fn(async (_keys: string[]) => ({ ...data })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, structuredClone(items)); }) };
  return { data, area, repository: new Repository(area) };
}
afterEach(() => vi.useRealTimers());

describe('problem test cases', () => {
  it('pairs numbered examples, skips missing outputs and preserves whitespace', () => {
    const root = document.createElement('div');
    root.innerHTML = '<pre id="sample-input-2"> 2\n</pre><pre id="sample-output-2"> 4\n</pre>' +
      '<pre id="sample-input-3">unpaired</pre><div id="sample-input-bad">ignore</div>';
    expect(readSamples(root)).toEqual([{ id: 'sample-2', input: ' 2\n', expected: ' 4\n' }]);
  });
  it('uses samples only when absent, without writing them on load', async () => {
    const { repository, area } = storage();
    const cases = new TestCases(repository, '1000', () => [sample], vi.fn());
    await cases.load();
    expect(cases.writer!.value).toEqual([sample]);
    expect(area.set).not.toHaveBeenCalled();
  });
  it('restores an intentionally empty list and separates problems', async () => {
    const { repository } = storage({ [caseKey('1000')]: [] });
    const a = new TestCases(repository, '1000', () => [sample], vi.fn());
    const b = new TestCases(repository, '1001', () => [sample], vi.fn());
    await Promise.all([a.load(), b.load()]);
    expect(a.writer!.value).toEqual([]);
    expect(b.writer!.value).toEqual([sample]);
  });
  it.each([null, { input: 'wrong' }, [{ ...sample, input: 42 }], [sample, sample]])(
    'refuses malformed saved cases and never writes over them: %j', async value => {
      const { repository, area } = storage({ [caseKey('1000')]: value });
      const cases = new TestCases(repository, '1000', () => [sample], vi.fn());
      await cases.load();
      expect(cases.error).toBeInstanceOf(Error);
      expect(cases.writer).toBeUndefined();
      expect(area.set).not.toHaveBeenCalled();
    });
  it('locks through a slow failed read, then retries the saved cases', async () => {
    const { repository, area } = storage({ [caseKey('1000')]: [sample] });
    let reject!: (reason: Error) => void;
    area.get.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const cases = new TestCases(repository, '1000', () => [], vi.fn());
    const first = cases.load();
    expect(cases.load()).toBe(first);
    expect(cases.writer).toBeUndefined();
    reject(new Error('read unavailable'));
    await first;
    expect(cases.writer).toBeUndefined();
    expect(area.set).not.toHaveBeenCalled();
    await cases.load();
    expect(cases.error).toBeUndefined();
    expect(cases.writer!.value).toEqual([sample]);
  });
  it('debounces edits and retains them after quota failure until retry', async () => {
    vi.useFakeTimers();
    const { repository, area, data } = storage();
    const cases = new TestCases(repository, '1000', () => [sample], vi.fn());
    await cases.load();
    area.set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));
    cases.writer!.update([{ ...sample, input: '9 9' }]);
    await vi.advanceTimersByTimeAsync(499);
    expect(area.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(cases.writer!.state).toBe('error');
    expect(cases.writer!.value[0].input).toBe('9 9');
    await cases.writer!.flush();
    expect(data[caseKey('1000')]).toEqual([{ ...sample, input: '9 9' }]);
  });
});

async function fixture() {
  document.body.innerHTML = '<aside id="welcome-baek-panel"><div id="welcome-baek-header"></div>' +
    '<div id="welcome-baek-editor"></div><div id="welcome-baek-footer"></div></aside>' +
    '<main><pre id="sample-input-1">1 2\n</pre><pre id="sample-output-1">3\n</pre></main>';
  const panel = document.querySelector<HTMLElement>('aside')!;
  const footer = document.querySelector<HTMLElement>('#welcome-baek-footer')!;
  Object.defineProperty(panel, 'clientHeight', { value: 700 });
  const stored = storage();
  const drawer = new WorkspaceDrawer(panel, document.querySelector('main')!, stored.repository, '1000', vi.fn());
  footer.before(drawer.root);
  footer.append(drawer.casesButton, drawer.resultsButton, drawer.runButton);
  await drawer.cases.load();
  const input = panel.querySelector<HTMLTextAreaElement>('#welcome-baek-case-input')!;
  const handle = panel.querySelector<HTMLElement>('#welcome-baek-drawer-handle')!;
  handle.setPointerCapture = vi.fn();
  const pointer = (type: string, clientY: number, pointerId = 1) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, clientY, pointerId });
    handle.dispatchEvent(event);
  };
  return { ...stored, drawer, input, handle, pointer, panel };
}

describe('shared bottom drawer', () => {
  it('starts collapsed, toggles tabs and restores height without losing input', async () => {
    const { drawer, input } = await fixture();
    expect(drawer.root.hasAttribute('inert')).toBe(true);
    drawer.casesButton.click();
    expect(drawer.root.getAttribute('aria-hidden')).toBe('false');
    expect(input.value).toBe('1 2\n');
    input.value = '8 9';
    input.dispatchEvent(new Event('input'));
    const height = drawer.root.style.height;
    drawer.resultsButton.click();
    expect(drawer.root.textContent).toContain('아직 실행 결과가 없습니다');
    drawer.resultsButton.click();
    expect(drawer.root.getAttribute('aria-hidden')).toBe('true');
    drawer.casesButton.click();
    expect(drawer.root.style.height).toBe(height);
    expect(input.value).toBe('8 9');
    expect(drawer.runButton.disabled).toBe(true);
    await drawer.cases.writer!.flush();
  });
  it('adds/removes cases, imports samples without duplicates and saves with Ctrl+S', async () => {
    const { drawer, input, data, panel } = await fixture();
    drawer.casesButton.click();
    panel.querySelector<HTMLButtonElement>('#welcome-baek-case-import')!.click();
    expect(drawer.cases.writer!.value).toHaveLength(1);
    panel.querySelector<HTMLButtonElement>('#welcome-baek-case-add')!.click();
    input.value = 'custom';
    input.dispatchEvent(new Event('input'));
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await ticks();
    expect(data[caseKey('1000')]).toHaveLength(2);
    panel.querySelector<HTMLButtonElement>('#welcome-baek-case-remove')!.click();
    expect(input.value).toBe(sample.input);
    await drawer.cases.writer!.flush();
  });
  it('keeps result snapshots after closing and marks changed code/language/cases as stale', async () => {
    const { drawer, input } = await fixture();
    drawer.setContext('java', 'code');
    const result: RunResult = { language: 'java', code: 'code', cases: [sample], results: [
      { label: '케이스 1', input: sample.input, expected: sample.expected,
        output: '<script>do not execute</script>', verdict: 'failed' }
    ] };
    drawer.setResult(result);
    result.results[0].output = 'mutated by caller';
    drawer.close();
    drawer.casesButton.click();
    drawer.resultsButton.click();
    expect(drawer.root.textContent).toContain('<script>do not execute</script>');
    expect(drawer.root.querySelector('script')).toBeNull();
    expect(drawer.root.textContent).toContain('마지막 실행 결과');
    drawer.setContext('java', 'changed');
    expect(drawer.root.textContent).toContain('이전 실행 결과');
    drawer.setContext('python', 'code');
    expect(drawer.root.textContent).toContain('이전 실행 결과');
    drawer.setContext('java', 'code');
    input.value = 'changed input';
    input.dispatchEvent(new Event('input'));
    expect(drawer.root.textContent).toContain('이전 실행 결과');
    await drawer.cases.writer!.flush();
  });
  it('resizes, caps height and snaps closed below 64px while remembering the previous height', async () => {
    const { drawer, pointer, handle } = await fixture();
    drawer.casesButton.click();
    pointer('pointerdown', 500);
    pointer('pointermove', 200);
    pointer('pointerup', 200);
    const height = drawer.root.style.height;
    expect(Number.parseFloat(height)).toBeLessThanOrEqual(455);
    pointer('pointerdown', 300);
    pointer('pointermove', 900);
    pointer('pointerup', 900);
    expect(drawer.root.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.style.userSelect).toBe('');
    drawer.casesButton.click();
    expect(drawer.root.style.height).toBe(height);
    expect(handle.getAttribute('aria-valuenow')).toBe(String(Number.parseFloat(height)));
  });
  it('ignores another pointer and restores the initial height on cancel', async () => {
    const { drawer, pointer, handle } = await fixture();
    drawer.casesButton.click();
    const initial = drawer.root.style.height;
    document.body.style.userSelect = 'text';
    pointer('pointerdown', 500, 7);
    pointer('pointermove', 400, 8);
    expect(drawer.root.style.height).toBe(initial);
    pointer('pointermove', 400, 7);
    handle.dispatchEvent(new Event('pointercancel'));
    expect(drawer.root.style.height).toBe(initial);
    expect(document.body.style.userSelect).toBe('text');
    document.body.style.userSelect = '';
  });
  it('supports keyboard resizing, close and focus return', async () => {
    const { drawer, handle, panel } = await fixture();
    drawer.casesButton.click();
    handle.focus();
    const key = (key: string) => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    key('Home');
    expect(drawer.root.style.height).toBe('455px');
    key('ArrowDown');
    expect(drawer.root.style.height).toBe('435px');
    key('End');
    expect(document.activeElement).toBe(drawer.casesButton);
    expect(drawer.root.hasAttribute('inert')).toBe(true);
    drawer.resultsButton.click();
    panel.querySelector<HTMLButtonElement>('#welcome-baek-drawer-close')!.click();
    expect(drawer.root.getAttribute('aria-hidden')).toBe('true');
  });
});
