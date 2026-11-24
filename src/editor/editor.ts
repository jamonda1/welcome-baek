
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';
import {
  indentUnit,
  HighlightStyle,
  syntaxHighlighting
} from '@codemirror/language';

import { tags as t } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';

import { defaultLanguage, type CodeLanguage } from '../languages/catalog';
import { languageExtensions } from '../languages/editor-support';

export type EditorTheme = 'github-light' | 'one-dark' | 'dracula';

// ========================================
// GitHub Light 스타일
// ========================================

const githubLight = [
  EditorView.theme({
    '&': {
      backgroundColor: '#ffffff',
      color: '#24292f'
    },
    '.cm-content': {
      caretColor: '#0969da'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#0969da'
    },
    '.cm-gutters': {
      backgroundColor: '#f6f8fa',
      color: '#8c959f',
      border: 'none'
    },
    '.cm-activeLine': {
      // CodeMirror paints the selection underneath the active line.
      backgroundColor: '#818b9812'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#eaeef2'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#b6d7ff'
    }
  }, { dark: false }),

  syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword, color: '#cf222e' },
    { tag: t.controlKeyword, color: '#cf222e' },
    { tag: t.operatorKeyword, color: '#cf222e' },
    { tag: t.string, color: '#0a3069' },
    { tag: t.number, color: '#0550ae' },
    { tag: t.bool, color: '#0550ae' },
    { tag: t.comment, color: '#6e7781' },
    { tag: t.typeName, color: '#8250df' },
    { tag: t.className, color: '#8250df' },
    { tag: t.function(t.variableName), color: '#8250df' }
  ]))
];

// ========================================
// Dracula 스타일
// ========================================

const dracula = [
  EditorView.theme({
    '&': {
      backgroundColor: '#282a36',
      color: '#f8f8f2'
    },
    '.cm-content': {
      caretColor: '#f8f8f2'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#f8f8f2'
    },
    '.cm-gutters': {
      backgroundColor: '#282a36',
      color: '#6272a4',
      border: 'none'
    },
    '.cm-activeLine': {
      backgroundColor: '#44475a55'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#44475a'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#44475a'
    }
  }, { dark: true }),

  syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword, color: '#ff79c6' },
    { tag: t.controlKeyword, color: '#ff79c6' },
    { tag: t.operatorKeyword, color: '#ff79c6' },
    { tag: t.string, color: '#f1fa8c' },
    { tag: t.number, color: '#bd93f9' },
    { tag: t.bool, color: '#bd93f9' },
    { tag: t.comment, color: '#6272a4' },
    { tag: t.typeName, color: '#8be9fd' },
    { tag: t.className, color: '#8be9fd' },
    { tag: t.function(t.variableName), color: '#50fa7b' }
  ]))
];

// ========================================
// 테마 선택
// ========================================

function getThemeExtension(theme: EditorTheme) {
  switch (theme) {
    case 'github-light':
      return githubLight;
    case 'one-dark':
      return oneDark;
    case 'dracula':
      return dracula;
  }
}

// ========================================
// CodeMirror 에디터 생성
// ========================================

export function createEditor(parent: HTMLElement, options: {
  onChange: (code: string) => void;
  onSave: () => void;
}) {
  const themeCompartment = new Compartment();
  const editingCompartment = new Compartment();
  let theme: EditorTheme = 'github-light';
  let documentEditable = false;
  let locked = false;
  const editingExtensions = () => {
    const editable = documentEditable && !locked;
    return [EditorState.readOnly.of(!editable), EditorView.editable.of(editable),
      EditorView.contentAttributes.of({ 'aria-readonly': String(!editable) })];
  };

  const makeState = (language: CodeLanguage, code: string, editable: boolean) => {
    documentEditable = editable;
    return EditorState.create({
    doc: code,
    extensions: [
      basicSetup,
      languageExtensions[language],
      themeCompartment.of(getThemeExtension(theme)),
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      editingCompartment.of(editingExtensions()),
      EditorView.contentAttributes.of({ 'aria-label': '문제 풀이 코드' }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
      }),
      keymap.of([
        { key: 'Tab', run: view => {
          if (view.state.readOnly) return true;
          if (view.state.selection.ranges.some(range => !range.empty)) return indentMore(view);
          view.dispatch(view.state.replaceSelection('    '));
          return true;
        } },
        { key: 'Shift-Tab', run: view => view.state.readOnly || indentLess(view) }
      ]),
      EditorView.lineWrapping
    ]
    });
  };
  // Never expose a template before the storage read has succeeded.
  const view = new EditorView({ state: makeState(defaultLanguage, '', false), parent });
  const saveShortcut = (event: KeyboardEvent) => {
    if (!view.hasFocus || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    event.stopPropagation();
    options.onSave();
  };
  // Capture at the editor root, ahead of CodeMirror/browser default handlers.
  view.dom.addEventListener('keydown', saveShortcut, true);

  return {
    view,
    showDocument(language: CodeLanguage, code: string, editable = true) {
      // A fresh state also keeps Undo from restoring another language's document.
      view.setState(makeState(language, code, editable));
    },
    setTheme(next: EditorTheme) {
      theme = next;
      view.dispatch({ effects: themeCompartment.reconfigure(getThemeExtension(theme)) });
    },
    setLocked(next: boolean) {
      if (locked === next) return;
      locked = next;
      // Reconfigure permissions without replacing the document, caret or Undo history.
      view.dispatch({ effects: editingCompartment.reconfigure(editingExtensions()) });
    },
    destroy() {
      view.dom.removeEventListener('keydown', saveShortcut, true);
      view.destroy();
    }
  };
}
