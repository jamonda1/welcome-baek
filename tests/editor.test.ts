import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { createEditor } from '../src/editor/editor';
import { languageOrder } from '../src/languages/catalog';
import { templates } from '../src/languages/templates';

const editors: ReturnType<typeof createEditor>[] = [];
function setup() {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  const onSave = vi.fn();
  const editor = createEditor(parent, { onChange, onSave });
  editors.push(editor);
  return { editor, onChange, onSave };
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); });

describe('CodeMirror regression and shortcuts', () => {
  it('starts locked and blank, loading a document does not schedule a save', () => {
    const { editor, onChange } = setup();
    expect(editor.view.state.doc.toString()).toBe('');
    expect(editor.view.state.readOnly).toBe(true);
    editor.showDocument('java', 'restored code');
    expect(editor.view.state.readOnly).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    editor.view.dispatch({ changes: { from: 0, insert: 'new ' } });
    expect(onChange).toHaveBeenCalledWith('new restored code');
  });
  it.each(languageOrder)('keeps %s syntax and four-space indentation', language => {
    const { editor } = setup();
    editor.showDocument(language, templates[language]);
    expect(syntaxTree(editor.view.state).length).toBeGreaterThan(0);
    expect(editor.view.state.tabSize).toBe(4);
    editor.view.focus();
    editor.view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(editor.view.state.doc.toString().startsWith('    ')).toBe(true);
  });
  it('retains code and selection through every theme', () => {
    const { editor, onChange } = setup();
    editor.showDocument('python', 'print(42)');
    editor.view.dispatch({ selection: { anchor: 5 } });
    for (const theme of ['github-light', 'one-dark', 'dracula'] as const) {
      editor.setTheme(theme);
      expect(editor.view.state.doc.toString()).toBe('print(42)');
      expect(editor.view.state.selection.main.anchor).toBe(5);
      expect(editor.view.state.facet(EditorView.darkTheme)).toBe(theme !== 'github-light');
    }
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each(['ctrlKey', 'metaKey'] as const)('captures %s+S only with editor focus', modifier => {
    const { editor, onSave } = setup();
    editor.showDocument('java', templates.java);
    editor.view.focus();
    const event = new KeyboardEvent('keydown', { key: 's', [modifier]: true, bubbles: true, cancelable: true });
    editor.view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    const normal = new KeyboardEvent('keydown', { key: 's', [modifier]: true, bubbles: true, cancelable: true });
    outside.dispatchEvent(normal);
    expect(normal.defaultPrevented).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it('prevents undo from resurrecting the previous language document', () => {
    const { editor } = setup();
    editor.showDocument('java', 'java code');
    editor.view.dispatch({ changes: { from: 0, insert: 'edit ' } });
    editor.showDocument('python', 'python code');
    expect(undo(editor.view)).toBe(false);
    expect(editor.view.state.doc.toString()).toBe('python code');
    expect(editor.view.state.facet(EditorState.readOnly)).toBe(false);
  });
});
