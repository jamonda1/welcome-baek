import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { StreamLanguage } from '@codemirror/language';
import { c, csharp } from '@codemirror/legacy-modes/mode/clike';
import type { Extension } from '@codemirror/state';
import type { CodeLanguage } from './catalog';

export const languageExtensions = {
  java: java(),
  c: StreamLanguage.define(c),
  cpp: cpp(),
  csharp: StreamLanguage.define(csharp),
  python: python(),
  javascript: javascript()
} satisfies Record<CodeLanguage, Extension>;
