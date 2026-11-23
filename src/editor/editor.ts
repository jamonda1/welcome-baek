
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { java } from '@codemirror/lang-java';

export function createEditor(parent: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Baekjoon!");
    }
}`,
    extensions: [
      basicSetup,
      java(),
      EditorView.lineWrapping
    ]
  });

  return new EditorView({
    state,
    parent
  });
}
