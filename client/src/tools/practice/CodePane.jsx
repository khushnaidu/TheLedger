import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { Prec } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

// the printout look: one-dark's token palette on the ledger's own
// near-black paper, hairline-free — the card around it draws the frame
const ledgerDark = EditorView.theme({
  '&': { backgroundColor: '#14130e', fontSize: '13px', height: '100%' },
  '.cm-content': { fontFamily: "'IBM Plex Mono', monospace", padding: '14px 0' },
  '.cm-gutters': { backgroundColor: '#14130e', color: 'rgba(232,228,216,0.28)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto' },
}, { dark: true });

// Mounts CodeMirror once per drill (parent keys this component by drill
// id, so `code` is only the opening state). Mod-Enter runs; onChange
// fires per keystroke for the parent's debounced autosave.
export default function CodePane({ code, onChange, onRun }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  onRunRef.current = onRun;
  onChangeRef.current = onChange;

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current,
      doc: code,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRunRef.current?.(); return true; } }])),
        basicSetup,
        keymap.of([indentWithTab]),
        python(),
        oneDark,
        ledgerDark,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="gym-editor" ref={hostRef} />;
}
