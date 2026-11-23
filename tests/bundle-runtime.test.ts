import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

it('executes the production bundle as a classic content script and restores/saves code', async () => {
  const javaKey = 'welcome-baek:v1:code:1000:java';
  const pythonKey = 'welcome-baek:v1:code:1000:python';
  const records: Record<string, unknown> = {
    [javaKey]: { code: '// restored production Java' },
    [pythonKey]: { code: 'print("restored Python")' }
  };
  Reflect.set(window, 'chrome', { storage: { local: {
    get: async () => ({ ...records }),
    set: async (items: Record<string, unknown>) => { Object.assign(records, items); }
  } } });
  document.body.innerHTML = '<main class="container content"><h1>1000번</h1></main>';
  // Source imports run as strict modules in Vitest; Chrome injects the bundle as a classic script.
  window.eval(readFileSync('dist/problem.js', 'utf8'));
  await settle();
  const status = () => document.querySelector('#welcome-baek-save-status')!.textContent!;
  expect(status()).not.toContain('실패');
  expect(Reflect.get(window, 'D')).toBeUndefined();
  expect(document.querySelector('.cm-content')!.textContent).toBe('// restored production Java');
  const language = document.querySelector<HTMLSelectElement>('#welcome-baek-language')!;
  language.value = 'python';
  language.dispatchEvent(new Event('change'));
  await settle();
  expect(status()).not.toContain('실패');
  expect(document.querySelector('.cm-content')!.textContent).toBe('print("restored Python")');
  expect(document.querySelector('#welcome-baek-save')).toBeNull();
  const content = document.querySelector<HTMLElement>('.cm-content')!;
  content.focus();
  const shortcut = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
  content.dispatchEvent(shortcut);
  expect(shortcut.defaultPrevented).toBe(true);
  await settle();
  expect(status()).toBe('✓ 저장되었습니다');
  expect(records[pythonKey]).toMatchObject({ code: 'print("restored Python")', updatedAt: expect.any(Number) });
  language.value = 'cpp';
  language.dispatchEvent(new Event('change'));
  await settle();
  expect(status()).not.toContain('실패');
  expect(document.querySelector('.cm-content')!.textContent).toContain('#include <iostream>');
});
