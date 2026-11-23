import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPrefill, installSubmitBridge } from '../src/submission/bridge';
import { prefillEditor } from '../src/submission/client';
import { requestType, type PrefillRequest } from '../src/submission/protocol';
import { messageBus, submissionForm } from './submission-fixture';

const request = (): PrefillRequest => ({ type: requestType, requestId: crypto.randomUUID(), problemId: '1000', languageId: '28', code: 'print(42)', replaceExisting: false });
const cleanups: (() => void)[] = [];
beforeEach(() => { history.replaceState(null, '', '/submit/1000'); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('CodeMirror 5 page bridge', () => {
  it('synchronizes both the editor and textarea, updates language, and never submits or changes privacy', () => {
    const { editor, source, language, submitted } = submissionForm();
    const change = vi.fn();
    language.addEventListener('change', change);
    expect(applyPrefill(request())).toBe('applied');
    expect(editor.getValue()).toBe('print(42)');
    expect(source.value).toBe('print(42)');
    expect(language.value).toBe('28');
    expect(change).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLInputElement>('[name="code_open"]')!.checked).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });
  it('waits for editor initialization', () => {
    submissionForm();
    Reflect.deleteProperty(document.querySelector('.CodeMirror')!, 'CodeMirror');
    expect(applyPrefill(request())).toBe('not-ready');
  });
  it('waits for an incomplete editor API instead of throwing', () => {
    submissionForm();
    Reflect.set(document.querySelector('.CodeMirror')!, 'CodeMirror', { save() {} });
    expect(applyPrefill(request())).toBe('not-ready');
  });
  it.each(['language', 'disabled-source', 'readonly-source'])('leaves a restricted %s form untouched', restriction => {
    const { editor, language, source } = submissionForm();
    if (restriction === 'language') language.disabled = true;
    if (restriction === 'disabled-source') source.disabled = true;
    if (restriction === 'readonly-source') source.readOnly = true;
    expect(applyPrefill(request())).toBe('failed');
    expect(editor.setValue).not.toHaveBeenCalled();
    expect(language.value).toBe('93');
  });
  it('protects a textarea draft while its editor is still empty', () => {
    const { source, editor } = submissionForm();
    source.value = 'not yet loaded into the editor';
    expect(applyPrefill(request())).toBe('occupied');
    expect(source.value).toBe('not yet loaded into the editor');
    expect(editor.setValue).not.toHaveBeenCalled();
  });
  it('does not choose a different language when the desired option is unavailable', () => {
    const { language, editor } = submissionForm();
    language.querySelector('[value="28"]')!.remove();
    expect(applyPrefill(request())).toBe('language-unavailable');
    expect(language.value).toBe('93');
    expect(editor.setValue).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before replacing existing code', () => {
    const { editor, language } = submissionForm('do not overwrite');
    expect(applyPrefill(request())).toBe('occupied');
    expect(editor.getValue()).toBe('do not overwrite');
    expect(language.value).toBe('93');
    expect(applyPrefill({ ...request(), replaceExisting: true })).toBe('applied');
    expect(editor.getValue()).toBe('print(42)');
  });
  it('rejects a different problem before changing the document', () => {
    const { editor } = submissionForm();
    expect(applyPrefill({ ...request(), problemId: '1001' })).toBe('failed');
    expect(editor.setValue).not.toHaveBeenCalled();
  });
  it('rolls back code and language when textarea synchronization fails', () => {
    const { editor, language, source } = submissionForm('old');
    editor.save.mockImplementationOnce(() => {});
    expect(applyPrefill({ ...request(), replaceExisting: true })).toBe('failed');
    expect(editor.getValue()).toBe('old');
    expect(source.value).toBe('old');
    expect(language.value).toBe('93');
  });
  it('ignores foreign origins and malformed messages', () => {
    const { editor } = submissionForm();
    const bus = messageBus();
    cleanups.push(installSubmitBridge());
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://example.com', data: request() }));
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data: { ...request(), code: null } }));
    expect(editor.setValue).not.toHaveBeenCalled();
    expect(bus).not.toHaveBeenCalled();
  });
  it('replies idempotently to repeated successful requests without overwriting later edits', async () => {
    const { editor } = submissionForm();
    messageBus();
    cleanups.push(installSubmitBridge());
    const data = request();
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data }));
    editor.setValue('user edited after import');
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data }));
    expect(editor.getValue()).toBe('user edited after import');
  });
  it('retries until a late page bridge is available', async () => {
    vi.useFakeTimers();
    const { editor } = submissionForm();
    messageBus();
    const imported = prefillEditor({ problemId: '1000', language: 'python', code: 'print(42)', createdAt: Date.now() });
    await vi.advanceTimersByTimeAsync(300);
    cleanups.push(installSubmitBridge());
    await vi.advanceTimersByTimeAsync(150);
    expect(await imported).toBe('applied');
    expect(editor.getValue()).toBe('print(42)');
  });
  it('times out and stops sending requests when no bridge is available', async () => {
    vi.useFakeTimers();
    submissionForm();
    const bus = messageBus();
    const imported = prefillEditor({ problemId: '1000', language: 'java', code: 'class Main {}', createdAt: Date.now() });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await imported).toBe('timeout');
    const calls = bus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(bus).toHaveBeenCalledTimes(calls);
  });
});
