export const languages = {
  java: { label: 'Java', submission: { id: '93', label: 'Java 11' } },
  c: { label: 'C', submission: { id: '75', label: 'C11' } },
  cpp: { label: 'C++', submission: { id: '84', label: 'C++17' } },
  csharp: { label: 'C#', submission: { id: '86', label: 'C#' } },
  python: { label: 'Python', submission: { id: '28', label: 'Python 3' } },
  javascript: { label: 'JavaScript', submission: { id: '17', label: 'node.js' } }
} as const;

export type CodeLanguage = keyof typeof languages;
export const defaultLanguage: CodeLanguage = 'java';
export const languageOrder = Object.keys(languages) as CodeLanguage[];

export function isCodeLanguage(value: unknown): value is CodeLanguage {
  return typeof value === 'string' && Object.hasOwn(languages, value);
}

const submissionLanguageIds = new Set<string>(Object.values(languages).map(language => language.submission.id));
export const isSubmissionLanguageId = (value: unknown): value is string =>
  typeof value === 'string' && submissionLanguageIds.has(value);
