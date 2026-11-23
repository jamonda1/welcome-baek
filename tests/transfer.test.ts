import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSubmission, readTransfer, storeTransfer, transferKey, transferLifetime, transferPrefix, type SubmissionSnapshot } from '../src/submission/transfer';
import { transferStorage } from './submission-fixture';

const token = '00000000-0000-4000-8000-000000000001';
const snapshot = (): SubmissionSnapshot => ({ problemId: '1000', language: 'java', code: 'public class Main {}', createdAt: Date.now() });
beforeEach(() => { history.replaceState(null, '', '/problem/1000'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('submission handoff storage', () => {
  it('isolates immutable transfer records from saved drafts and other handoffs', async () => {
    const draft = 'welcome-baek:v1:code:1000:java';
    const old = transferKey('00000000-0000-4000-8000-000000000002');
    const live = transferKey('00000000-0000-4000-8000-000000000003');
    const { records } = transferStorage({ [draft]: { code: 'draft' }, [old]: { ...snapshot(), createdAt: Date.now() - transferLifetime - 1 }, [live]: snapshot() });
    const clicked = snapshot();
    await storeTransfer(token, clicked);
    clicked.code = 'edited later';
    expect((await readTransfer(token, '1000')).code).toBe('public class Main {}');
    expect(records[draft]).toEqual({ code: 'draft' });
    expect(records[old]).toBeUndefined();
    expect(records[live]).toBeDefined();
  });
  it('rejects wrong problem and malformed token without deleting drafts', async () => {
    const { local } = transferStorage({ [transferKey(token)]: snapshot() });
    await expect(readTransfer(token, '1001')).rejects.toThrow('이 문제');
    await expect(readTransfer('not-a-token', '1000')).rejects.toThrow('주소');
    expect(local.remove).not.toHaveBeenCalled();
  });
  it('rejects and removes expired records', async () => {
    const { records } = transferStorage({ [transferKey(token)]: { ...snapshot(), createdAt: Date.now() - transferLifetime - 1 } });
    await expect(readTransfer(token, '1000')).rejects.toThrow('만료');
    expect(records[transferKey(token)]).toBeUndefined();
  });
  it('rejects invalid storage shapes', async () => {
    transferStorage({ [transferKey(token)]: { ...snapshot(), language: 'ruby' } });
    await expect(readTransfer(token, '1000')).rejects.toThrow('없습니다');
  });
  it('opens synchronously, awaits saving, and puts only a token in the destination URL', async () => {
    const { records } = transferStorage();
    const tab = { opener: window, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let finishSave!: (value: boolean) => void;
    const work = openSubmission(snapshot(), () => new Promise(resolve => { finishSave = resolve; }));
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).not.toHaveBeenCalled();
    finishSave(true);
    await work;
    const url = new URL(tab.location.replace.mock.calls[0][0]);
    expect(url.pathname).toBe('/submit/1000');
    expect(url.searchParams.get('welcome_baek_transfer')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(url.href).not.toContain('public');
    expect(Object.keys(records).filter(key => key.startsWith(transferPrefix))).toHaveLength(1);
  });
  it('keeps code local when popups are blocked', async () => {
    const { local } = transferStorage();
    vi.spyOn(window, 'open').mockReturnValue(null);
    const save = vi.fn(async () => true);
    await expect(openSubmission(snapshot(), save)).rejects.toThrow('팝업');
    expect(save).not.toHaveBeenCalled();
    expect(local.set).not.toHaveBeenCalled();
  });
  it('closes the blank tab after save or quota failure without navigating', async () => {
    const { local } = transferStorage();
    const tab = { closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    await expect(openSubmission(snapshot(), async () => false)).rejects.toThrow('저장');
    expect(tab.close).toHaveBeenCalledTimes(1);
    local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));
    await expect(openSubmission(snapshot(), async () => true)).rejects.toThrow('QUOTA');
    expect(tab.close).toHaveBeenCalledTimes(2);
    expect(tab.location.replace).not.toHaveBeenCalled();
  });
  it('refuses blank code without opening a tab', async () => {
    const open = vi.spyOn(window, 'open');
    await expect(openSubmission({ ...snapshot(), code: '  \n' }, async () => true)).rejects.toThrow('작성');
    expect(open).not.toHaveBeenCalled();
  });
});
