import { requestType, responseType, type PrefillRequest, type PrefillResponse, type PrefillStatus } from './protocol';

interface CodeMirror5 {
  getValue(): string;
  setValue(code: string): void;
  save(): void;
}
type EditorElement = HTMLElement & { CodeMirror?: CodeMirror5 };

/** Runs in the page's MAIN world; deliberately has no Chrome Storage/API access. */
export function applyPrefill(request: PrefillRequest): PrefillStatus {
  if (/^\/submit\/(\d+)\/?$/.exec(location.pathname)?.[1] !== request.problemId) return 'failed';
  const language = document.querySelector<HTMLSelectElement>('#language');
  const source = document.querySelector<HTMLTextAreaElement>('textarea#source');
  const editor = document.querySelector<EditorElement>('.CodeMirror')?.CodeMirror;
  if (!language || !source || !editor || typeof editor.getValue !== 'function' ||
    typeof editor.setValue !== 'function' || typeof editor.save !== 'function') return 'not-ready';
  if (language.disabled || source.disabled || source.readOnly) return 'failed';
  if (!Array.from(language.options).some(option => option.value === request.languageId && !option.disabled)) return 'language-unavailable';
  const previousCode = editor.getValue();
  if (!request.replaceExisting && ((previousCode.length && previousCode !== request.code) ||
    (source.value.length && source.value !== request.code))) return 'occupied';
  const previousLanguage = language.value;
  try {
    language.value = request.languageId;
    language.dispatchEvent(new Event('change', { bubbles: true }));
    const page = window as unknown as { jQuery?: (element: Element) => { trigger(name: string): void } };
    page.jQuery?.(language).trigger('chosen:updated');
    editor.setValue(request.code);
    editor.save();
    if (editor.getValue() !== request.code || source.value !== request.code || language.value !== request.languageId) throw new Error('Code verification failed');
    return 'applied';
  } catch {
    // Best-effort rollback: never leave a different language's code selected after failure.
    try {
      language.value = previousLanguage;
      language.dispatchEvent(new Event('change', { bubbles: true }));
      const page = window as unknown as { jQuery?: (element: Element) => { trigger(name: string): void } };
      page.jQuery?.(language).trigger('chosen:updated');
      editor.setValue(previousCode);
      editor.save();
    } catch { /* The UI reports failure instead of claiming the code was copied. */ }
    return 'failed';
  }
}

export function installSubmitBridge(): () => void {
  const completed = new Set<string>();
  const handler = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const request = event.data as Partial<PrefillRequest> | null;
    if (!request || request.type !== requestType || typeof request.requestId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(request.requestId) || typeof request.code !== 'string' ||
      typeof request.problemId !== 'string' || !/^\d+$/.test(request.problemId) ||
      typeof request.languageId !== 'string' || !['93', '84', '28'].includes(request.languageId) ||
      typeof request.replaceExisting !== 'boolean') return;
    let status: PrefillStatus;
    try { status = completed.has(request.requestId) ? 'applied' : applyPrefill(request as PrefillRequest); }
    catch { status = 'failed'; }
    if (status === 'applied') {
      completed.add(request.requestId);
      if (completed.size > 20) completed.delete(completed.values().next().value!);
    }
    const response: PrefillResponse = { type: responseType, requestId: request.requestId, status };
    window.postMessage(response, location.origin);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
