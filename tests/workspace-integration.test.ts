import { expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { codeKey } from '../src/storage/storage';
import { caseKey } from '../src/testing/cases';

const ticks = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

it('keeps code editable after a case read failure and includes cases in retry/save/unload handling', async () => {
  const data: Record<string, unknown> = { [codeKey('1000', 'java')]: { code: 'precious code' } };
  let readFailure = true;
  let writeFailure = false;
  const set = vi.fn(async (items: Record<string, unknown>) => {
    if (writeFailure && caseKey('1000') in items) throw new Error('QUOTA_BYTES exceeded');
    Object.assign(data, items);
  });
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (keys: string[]) => {
      if (readFailure && keys.includes(caseKey('1000'))) throw new Error('cases unavailable');
      return { ...data };
    }, set
  } } });
  document.body.innerHTML = '<main class="container content"><pre id="sample-input-1">1 2</pre>' +
    '<pre id="sample-output-1">3</pre></main>';
  await import('../src/content/problem');
  await ticks();
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
  const status = () => document.querySelector('#welcome-baek-save-status')!.textContent!;
  const retry = () => document.querySelector<HTMLButtonElement>('#welcome-baek-retry')!.click();
  expect(view.state.readOnly).toBe(false);
  expect(view.state.doc.toString()).toBe('precious code');
  expect(status()).toContain('테스트 케이스 불러오기 실패');
  expect(set).not.toHaveBeenCalled();
  readFailure = false;
  retry();
  await ticks();
  const input = document.querySelector<HTMLTextAreaElement>('#welcome-baek-case-input')!;
  expect(input.disabled).toBe(false);
  input.value = 'changed test';
  input.dispatchEvent(new Event('input'));
  writeFailure = true;
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await ticks();
  expect(status()).toContain('저장 실패');
  expect(input.value).toBe('changed test');
  writeFailure = false;
  retry();
  await ticks();
  expect(data[caseKey('1000')]).toEqual([{ id: 'sample-1', input: 'changed test', expected: '3' }]);
  expect(view.state.doc.toString()).toBe('precious code');
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});
