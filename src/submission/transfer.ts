import type { CodeLanguage } from '../editor/editor';

export const transferParameter = 'welcome_baek_transfer';
export const transferPrefix = 'welcome-baek:v1:transfer:';
export const transferLifetime = 30 * 60 * 1000;
export const languageTargets: Record<CodeLanguage, { id: string; label: string }> = {
  java: { id: '93', label: 'Java 11' },
  cpp: { id: '84', label: 'C++17' },
  python: { id: '28', label: 'Python 3' }
};
export interface SubmissionSnapshot {
  problemId: string;
  language: CodeLanguage;
  code: string;
  createdAt: number;
}
export const validToken = (token: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
export const transferKey = (token: string) => `${transferPrefix}${token}`;
export async function discardTransfer(token: string): Promise<void> {
  await chrome.storage.local.remove(transferKey(token));
}

export function isSnapshot(value: unknown): value is SubmissionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SubmissionSnapshot>;
  return typeof item.problemId === 'string' && /^\d+$/.test(item.problemId) &&
    (item.language === 'java' || item.language === 'cpp' || item.language === 'python') &&
    typeof item.code === 'string' && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt);
}

export async function storeTransfer(token: string, snapshot: SubmissionSnapshot): Promise<void> {
  if (!validToken(token) || !isSnapshot(snapshot)) throw new Error('코드 전달 정보를 만들 수 없습니다');
  // Remove only expired transfer records; never delete a saved draft or a live transfer.
  const records = await chrome.storage.local.get(null);
  const stale = Object.entries(records).filter(([key, record]) => key.startsWith(transferPrefix) &&
    (!isSnapshot(record) || Date.now() - record.createdAt > transferLifetime)).map(([key]) => key);
  if (stale.length) await chrome.storage.local.remove(stale);
  await chrome.storage.local.set({ [transferKey(token)]: snapshot });
}

export async function readTransfer(token: string, problemId: string): Promise<SubmissionSnapshot> {
  if (!validToken(token)) throw new Error('코드 전달 주소가 올바르지 않습니다');
  const record = (await chrome.storage.local.get([transferKey(token)]))[transferKey(token)];
  if (!isSnapshot(record) || record.problemId !== problemId) {
    throw new Error('이 문제로 전달된 코드가 없습니다. 문제 페이지에서 다시 열어 주세요');
  }
  if (Date.now() - record.createdAt > transferLifetime || record.createdAt > Date.now() + 60_000) {
    await chrome.storage.local.remove(transferKey(token));
    throw new Error('코드 전달 시간이 만료되었습니다. 문제 페이지에서 다시 열어 주세요');
  }
  return record;
}

/** Called directly in the click handler so the browser can open a tab before any awaits. */
export async function openSubmission(snapshot: SubmissionSnapshot, saveDraft: () => Promise<boolean>): Promise<void> {
  if (!isSnapshot(snapshot)) throw new Error('잘못된 문제 또는 언어입니다');
  if (!snapshot.code.trim()) throw new Error('코드를 작성한 뒤 제출 페이지를 열어 주세요');
  const destination = new URL(`/submit/${snapshot.problemId}`, location.origin);
  if (!/^https:\/\/(www\.)?acmicpc\.net$/.test(destination.origin)) throw new Error('백준 문제 페이지에서 사용해 주세요');
  const token = crypto.randomUUID();
  destination.searchParams.set(transferParameter, token);
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('새 탭을 열 수 없습니다. 팝업 차단 설정을 확인해 주세요');
  try {
    tab.opener = null;
    if (!await saveDraft()) throw new Error('코드를 저장하지 못했습니다. 저장 오류를 해결한 뒤 다시 시도해 주세요');
    await storeTransfer(token, snapshot);
    if (tab.closed) throw new Error('제출 탭이 닫혔습니다. 다시 열어 주세요');
    tab.location.replace(destination.href);
  } catch (error) {
    tab.close();
    try { await chrome.storage.local.remove(transferKey(token)); } catch { /* Keep the original error. */ }
    throw error;
  }
}
