import type { EditorTheme } from '../editor/editor';
import { defaultLanguage, isCodeLanguage, type CodeLanguage } from '../languages/catalog';

export interface Preferences {
  language: CodeLanguage;
  theme: EditorTheme;
  problemRatio: number;
  reversed: boolean;
}

export const defaults: Preferences = {
  language: defaultLanguage, theme: 'github-light', problemRatio: 50, reversed: false
};
export const codeKey = (problemId: string, language: CodeLanguage) =>
  `welcome-baek:v1:code:${problemId}:${language}`;
export const preferenceKey = (name: keyof Preferences) => `welcome-baek:v1:preference:${name}`;

export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const local: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items)
};

export function isExtensionContextInvalidated(error: unknown): boolean {
  return /context invalidated/i.test(error instanceof Error ? error.message : String(error));
}

export function storageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|QUOTA_BYTES|maximum.*bytes/i.test(message)) {
    return '저장 공간이 부족합니다. 코드를 복사해 보관하고 저장 공간을 확보한 뒤 재시도하세요.';
  }
  if (isExtensionContextInvalidated(error)) {
    return '확장 프로그램이 다시 로드되었습니다. 코드를 복사해 보관한 뒤 페이지를 새로고침하세요.';
  }
  return `저장소 오류: ${message}. 재시도하세요. 작성한 코드는 현재 탭에 유지됩니다.`;
}

export class Repository {
  constructor(private area: StorageArea = local) {}

  async readValue(key: string): Promise<unknown> { return (await this.area.get([key]))[key]; }
  writeValue(key: string, value: unknown): Promise<void> { return this.area.set({ [key]: value }); }

  async readCode(problemId: string, language: CodeLanguage): Promise<string | undefined> {
    const key = codeKey(problemId, language);
    const record = (await this.area.get([key]))[key];
    if (record === undefined) return undefined;
    if (typeof record === 'object' && record !== null &&
        'code' in record && typeof record.code === 'string') return record.code;
    // A bad read must never turn into a template write over the existing draft.
    throw new Error('저장된 코드 형식을 읽을 수 없습니다. 기존 데이터는 변경하지 않았습니다');
  }

  writeCode(problemId: string, language: CodeLanguage, code: string): Promise<void> {
    return this.area.set({ [codeKey(problemId, language)]: { code, updatedAt: Date.now() } });
  }

  async readPreferences(): Promise<Preferences> {
    const keys = (Object.keys(defaults) as (keyof Preferences)[]).map(preferenceKey);
    const data = await this.area.get(keys);
    const language = data[preferenceKey('language')];
    const theme = data[preferenceKey('theme')];
    const ratio = data[preferenceKey('problemRatio')];
    const reversed = data[preferenceKey('reversed')];
    return {
      language: isCodeLanguage(language) ? language : defaults.language,
      theme: theme === 'github-light' || theme === 'one-dark' || theme === 'dracula' ? theme : defaults.theme,
      problemRatio: typeof ratio === 'number' && Number.isFinite(ratio) ? Math.max(20, Math.min(80, ratio)) : defaults.problemRatio,
      reversed: typeof reversed === 'boolean' ? reversed : defaults.reversed
    };
  }

  writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
    // Separate keys avoid replacing unrelated preferences from another tab.
    return this.area.set({ [preferenceKey(key)]: value });
  }
}
