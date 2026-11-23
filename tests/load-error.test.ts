import { describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { codeKey } from '../src/storage/storage';

const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe('initial loading failures', () => {
  it('locks after preference/code read failures and retries without overwriting stored code', async () => {
    const readCodeAndPreferences = vi.fn()
      .mockRejectedValueOnce(new Error('preferences unavailable'))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('code unavailable'))
      .mockResolvedValueOnce({ [codeKey('1000', 'java')]: { code: 'precious Java' } });
    const get = vi.fn((keys: string[]) => keys[0]?.includes(':cases:')
      ? Promise.resolve({}) : readCodeAndPreferences());
    const set = vi.fn(async () => {});
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    document.body.innerHTML = '<div class="container content"><h1>1000번</h1></div>';
    await import('../src/content/problem');
    await ticks();
    const view = () => EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
    const retry = () => document.querySelector<HTMLButtonElement>('#welcome-baek-retry')!.click();
    expect(view().state.readOnly).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#welcome-baek-language')!.disabled).toBe(true);
    expect(document.querySelector('#welcome-baek-save-status')!.textContent).toContain('불러오기 실패');
    retry();
    await ticks();
    expect(view().state.readOnly).toBe(true);
    expect(view().state.doc.toString()).toBe('');
    expect(set).not.toHaveBeenCalled();
    retry();
    await ticks();
    expect(view().state.readOnly).toBe(false);
    expect(view().state.doc.toString()).toBe('precious Java');
    expect(set).not.toHaveBeenCalled();
  });
});
