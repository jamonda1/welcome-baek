import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { codeKey, preferenceKey } from '../src/storage/storage';

const ticks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const select = async (id: string, value: string) => {
  const element = document.querySelector<HTMLSelectElement>(id)!;
  element.value = value;
  element.dispatchEvent(new Event('change'));
  await ticks();
};

describe('problem page integration', () => {
  const data: Record<string, unknown> = {
    [codeKey('1000', 'java')]: { code: 'saved Java' },
    [codeKey('1000', 'python')]: { code: 'saved Python' },
    [preferenceKey('theme')]: 'dracula',
    [preferenceKey('problemRatio')]: 37,
    [preferenceKey('reversed')]: true
  };
  let resolveCpp!: (data: Record<string, unknown>) => void;
  let failNextWrite = false;
  const get = vi.fn((keys: string[]) => keys.includes(codeKey('1000', 'cpp'))
    ? new Promise<Record<string, unknown>>(resolve => { resolveCpp = resolve; })
    : Promise.resolve({ ...data }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    if (failNextWrite) { failNextWrite = false; throw new Error('QUOTA_BYTES quota exceeded'); }
    Object.assign(data, items);
  });
  const view = () => EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
  const status = () => document.querySelector('#welcome-baek-save-status')!.textContent!;
  const saveShortcut = () => {
    view().focus();
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    view().contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  beforeAll(async () => {
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    document.body.innerHTML = '<div class="container content"><h1>1000번</h1></div>';
    await import('../src/content/problem');
    await ticks();
  });

  it('restores code, theme and layout without saving a template', () => {
    expect(view().state.doc.toString()).toBe('saved Java');
    expect(document.querySelector<HTMLSelectElement>('#welcome-baek-theme')!.value).toBe('dracula');
    expect(document.querySelector<HTMLElement>('.welcome-baek-problem')!.style.flexGrow).toBe('37');
    expect(document.querySelector('#welcome-baek-layout')!.firstElementChild!.id).toBe('welcome-baek-panel');
    expect(set).not.toHaveBeenCalled();
    expect(document.querySelector('#welcome-baek-save')).toBeNull();
    expect(document.querySelector('#welcome-baek-header #welcome-baek-save-status')).not.toBeNull();
    expect(document.querySelector('#welcome-baek-save-hint')!.textContent).toContain('Ctrl+S');
  });
  it('ignores a stale slow language response while immediately saving outgoing code', async () => {
    view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: 'latest Java' } });
    await select('#welcome-baek-language', 'cpp');
    expect(view().state.readOnly).toBe(true);
    await select('#welcome-baek-language', 'python');
    expect(view().state.doc.toString()).toBe('saved Python');
    resolveCpp({ [codeKey('1000', 'cpp')]: { code: 'late C++' } });
    await ticks();
    expect(view().state.doc.toString()).toBe('saved Python');
    expect(data[codeKey('1000', 'java')]).toMatchObject({ code: 'latest Java' });
    await select('#welcome-baek-language', 'cpp');
    expect(view().state.doc.toString()).toBe('late C++');
  });
  it('flushes before navigation, warns while dirty, then stops warning after save', async () => {
    view().dispatch({ changes: { from: 0, insert: 'pending ' } });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await ticks();
    expect(data[codeKey('1000', 'cpp')]).toMatchObject({ code: 'pending late C++' });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
  it('shows failed save, retains text and retries successfully', async () => {
    failNextWrite = true;
    view().dispatch({ changes: { from: 0, insert: 'retain ' } });
    saveShortcut();
    await ticks();
    expect(status()).toContain('저장 실패');
    expect(status()).toContain('공간');
    expect(view().state.doc.toString()).toBe('retain pending late C++');
    document.querySelector<HTMLButtonElement>('#welcome-baek-retry')!.click();
    await ticks();
    expect(status()).toBe('✓ 저장되었습니다');
    expect(data[codeKey('1000', 'cpp')]).toMatchObject({ code: 'retain pending late C++' });
  });
  it('compacts successful feedback after 2.5 seconds without dismissing a new failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      saveShortcut();
      await ticks();
      expect(status()).toBe('✓ 저장되었습니다');
      await vi.advanceTimersByTimeAsync(2499);
      expect(status()).toBe('✓ 저장되었습니다');
      await vi.advanceTimersByTimeAsync(1);
      expect(status()).toBe('✓ 저장됨');
      saveShortcut();
      await ticks();
      expect(status()).toBe('✓ 저장되었습니다');
      view().dispatch({ changes: { from: 0, insert: '// autosave\n' } });
      expect(status()).toBe('변경 사항 있음');
      await vi.advanceTimersByTimeAsync(500);
      expect(status()).toBe('✓ 저장되었습니다');
      failNextWrite = true;
      saveShortcut();
      await ticks();
      expect(status()).toContain('저장 실패');
      await vi.advanceTimersByTimeAsync(3000);
      expect(status()).toContain('저장 실패');
      expect(document.querySelector<HTMLButtonElement>('#welcome-baek-retry')!.hidden).toBe(false);
      document.querySelector<HTMLButtonElement>('#welcome-baek-retry')!.click();
      await ticks();
      expect(status()).toBe('✓ 저장되었습니다');
      // Keep the subsequent layout regression cases' expected document unchanged.
      view().dispatch({ changes: { from: 0, to: '// autosave\n'.length, insert: '' } });
      saveShortcut();
      await ticks();
    } finally {
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    }
  });
  it('drags the reversed divider and persists the problem area ratio', async () => {
    const divider = document.querySelector<HTMLElement>('#welcome-baek-divider')!;
    const layout = document.querySelector<HTMLElement>('#welcome-baek-layout')!;
    divider.setPointerCapture = vi.fn();
    Object.defineProperty(divider, 'offsetWidth', { value: 4 });
    vi.spyOn(layout, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1004 } as DOMRect);
    const down = new Event('pointerdown');
    Object.assign(down, { button: 0, pointerId: 1 });
    divider.dispatchEvent(down);
    const move = new Event('pointermove');
    Object.assign(move, { clientX: 302 });
    divider.dispatchEvent(move);
    divider.dispatchEvent(new Event('pointerup'));
    await ticks();
    expect(document.querySelector<HTMLElement>('.welcome-baek-problem')!.style.flexGrow).toBe('70');
    expect(data[preferenceKey('problemRatio')]).toBe(70);
    expect(document.body.style.userSelect).toBe('');
  });
  it('preserves code through themes and saves swapped layout and theme', async () => {
    await select('#welcome-baek-theme', 'one-dark');
    document.querySelector<HTMLButtonElement>('#welcome-baek-swap')!.click();
    window.dispatchEvent(new Event('pagehide'));
    await ticks();
    expect(view().state.doc.toString()).toBe('retain pending late C++');
    expect(data[preferenceKey('theme')]).toBe('one-dark');
    expect(data[preferenceKey('reversed')]).toBe(false);
    expect(document.querySelector('#welcome-baek-layout')!.firstElementChild!.classList.contains('welcome-baek-problem')).toBe(true);
  });
});
