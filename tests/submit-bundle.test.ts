import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { transferKey, transferLifetime } from '../src/submission/transfer';
import { messageBus, submissionForm, transferStorage } from './submission-fixture';

const token = '00000000-0000-4000-8000-000000000010';
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const code = 'print("production snapshot")';
const snapshot = () => ({ problemId: '1000', language: 'python', code, createdAt: Date.now() });
const script = readFileSync('dist/submit.js', 'utf8');
const run = async () => { window.eval(script); await settle(); };
const status = () => document.querySelector('#welcome-baek-import p')!.textContent!;

describe('production submission scripts', () => {
  beforeAll(() => {
    history.replaceState(null, '', '/submit/1000');
    window.eval(readFileSync('dist/submit-bridge.js', 'utf8'));
  });
  beforeEach(() => {
    history.replaceState(null, '', `/submit/1000?welcome_baek_transfer=${token}`);
    messageBus();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('ignores ordinary visits without a transfer marker', async () => {
    const { editor } = submissionForm('existing');
    const { local } = transferStorage();
    history.replaceState(null, '', '/submit/1000');
    await run();
    expect(document.querySelector('#welcome-baek-import')).toBeNull();
    expect(editor.getValue()).toBe('existing');
    expect(local.get).not.toHaveBeenCalled();
  });
  it('fills the editor and textarea, consumes its own transfer, preserves privacy, and does not submit', async () => {
    const { editor, source, language, submitted } = submissionForm();
    const { records } = transferStorage({ [transferKey(token)]: snapshot(), 'welcome-baek:v1:code:1000:python': { code: 'saved draft' } });
    await run();
    expect(status()).toContain('코드를 가져왔습니다');
    expect(editor.getValue()).toBe(code);
    expect(source.value).toBe(code);
    expect(language.value).toBe('28');
    expect(new URL(location.href).searchParams.has('welcome_baek_transfer')).toBe(false);
    expect(records[transferKey(token)]).toBeUndefined();
    expect(records['welcome-baek:v1:code:1000:python']).toEqual({ code: 'saved draft' });
    expect(document.querySelector<HTMLInputElement>('[name="code_open"]')!.checked).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
    editor.setValue('edited after import');
    await run();
    expect(editor.getValue()).toBe('edited after import');
  });
  it('keeps existing code until the user clicks replace', async () => {
    const { editor } = submissionForm('keep this until confirmed');
    const { records } = transferStorage({ [transferKey(token)]: snapshot() });
    await run();
    expect(status()).toContain('이미 코드');
    expect(editor.getValue()).toBe('keep this until confirmed');
    expect(records[transferKey(token)]).toBeDefined();
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#welcome-baek-import button')).find(button => !button.hidden && button.textContent?.includes('대신'))!;
    expect(button).toBeDefined();
    button.click();
    await settle();
    expect(editor.getValue()).toBe(code);
    expect(status()).toContain('코드를 가져왔습니다');
  });
  it('reports an unavailable preferred language without choosing another option', async () => {
    const { editor, language } = submissionForm();
    language.querySelector('[value="28"]')!.remove();
    const { records } = transferStorage({ [transferKey(token)]: snapshot() });
    await run();
    expect(status()).toContain('언어 목록에 Python 3이 없습니다');
    expect(editor.getValue()).toBe('');
    expect(language.value).toBe('93');
    expect(records[transferKey(token)]).toBeDefined();
    expect(document.querySelector<HTMLAnchorElement>('#welcome-baek-import a')!.pathname).toBe('/setting/language');
  });
  it('rejects expired data without overwriting the current editor', async () => {
    const { editor } = submissionForm('keep old code');
    transferStorage({ [transferKey(token)]: { ...snapshot(), createdAt: Date.now() - transferLifetime - 1 } });
    await run();
    expect(status()).toContain('만료');
    expect(editor.getValue()).toBe('keep old code');
  });
  it('retries a failed storage read without losing the transfer', async () => {
    const { editor } = submissionForm();
    const { local } = transferStorage({ [transferKey(token)]: snapshot() });
    local.get.mockRejectedValueOnce(new Error('temporary storage failure'));
    await run();
    expect(status()).toContain('temporary storage failure');
    const retry = Array.from(document.querySelectorAll<HTMLButtonElement>('#welcome-baek-import button')).find(button => !button.hidden && button.textContent?.includes('다시'))!;
    retry.click();
    await settle();
    expect(editor.getValue()).toBe(code);
  });
  it('leaves login pages untouched and can resume when the marked submit URL returns', async () => {
    const { editor } = submissionForm();
    const { records, local } = transferStorage({ [transferKey(token)]: snapshot() });
    const next = `/submit/1000?welcome_baek_transfer=${token}`;
    history.replaceState(null, '', `/login?next=${encodeURIComponent(next)}`);
    await run();
    expect(local.get).not.toHaveBeenCalled();
    expect(records[transferKey(token)]).toBeDefined();
    history.replaceState(null, '', next);
    await run();
    expect(editor.getValue()).toBe(code);
  });
});
