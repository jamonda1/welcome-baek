import { vi } from 'vitest';

export function submissionForm(code = '') {
  document.body.innerHTML = `<main class="container content"><form id="submit_form">
    <select id="language"><option value="93">Java 11</option><option value="84">C++17</option><option value="28">Python 3</option>
    <option value="75">C11</option><option value="86">C#</option><option value="17">node.js</option></select>
    <input type="radio" name="code_open" value="close" checked>
    <textarea id="source"></textarea><div class="CodeMirror"></div>
    <button type="submit" id="submit_button">제출</button></form></main>`;
  const source = document.querySelector<HTMLTextAreaElement>('#source')!;
  source.value = code;
  let value = code;
  const editor = {
    getValue: vi.fn(() => value),
    setValue: vi.fn((next: string) => { value = next; }),
    save: vi.fn(() => { source.value = value; })
  };
  Reflect.set(document.querySelector('.CodeMirror')!, 'CodeMirror', editor);
  const submitted = vi.fn((event: Event) => event.preventDefault());
  document.querySelector('form')!.addEventListener('submit', submitted);
  return { editor, source, submitted, language: document.querySelector<HTMLSelectElement>('#language')! };
}

export function messageBus() {
  return vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: location.origin })));
  });
}

export function transferStorage(seed: Record<string, unknown> = {}) {
  const records = structuredClone(seed);
  const local = {
    get: vi.fn(async (_keys?: unknown) => structuredClone(records)),
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(records, structuredClone(items))),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete records[key];
    })
  };
  vi.stubGlobal('chrome', { storage: { local } });
  return { records, local };
}
