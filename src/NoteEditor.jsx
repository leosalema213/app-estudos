import { forwardRef, useLayoutEffect, useRef } from 'react';
import { Editor, Node } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import { Dropcursor, Gapcursor, TrailingNode, UndoRedo } from '@tiptap/extensions';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { documentText, isNoteImage, noteDocument } from './note-document.js';

const Image = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true,
  addAttributes() { return { src: { default: '' } }; },
  parseHTML() { return [{ tag: 'img[src]', getAttrs: element => isNoteImage(element.getAttribute('src')) ? { src: element.getAttribute('src') } : false }]; },
  renderHTML({ node }) { return ['img', { src: node.attrs.src, alt: 'Imagem da anotação' }]; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('figure'); dom.className = 'note-document-image'; dom.contentEditable = 'false';
      const image = document.createElement('img'); image.src = node.attrs.src; image.alt = 'Imagem da anotação';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button';
      remove.setAttribute('aria-label', 'Remover imagem'); remove.title = 'Remover imagem'; remove.textContent = '×';
      remove.addEventListener('mousedown', event => event.preventDefault());
      remove.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos === 'number') { editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize }); editor.view.focus(); }
      });
      dom.append(image, remove);
      return { dom, stopEvent: event => remove.contains(event.target) };
    };
  },
});

// One editor per note: its history and selection survive React autosave renders.
export default forwardRef(function NoteEditor({ note, onChange, notify }, apiRef) {
  const host = useRef();
  useLayoutEffect(() => {
    const bookmarks = new Set();
    let pending = 0; let detached = false;
    const editor = new Editor({
      element: host.current,
      extensions: [Document, Paragraph, Text, HardBreak, UndoRedo, Dropcursor, Gapcursor, TrailingNode, Image],
      content: noteDocument(note),
      onCreate: ({ editor }) => { editor.view.dom.dataset.empty = String(editor.isEmpty); },
      editorProps: {
        attributes: { class: 'notebook-text', role: 'textbox', 'aria-label': 'Texto da anotação', 'aria-multiline': 'true', 'data-placeholder': 'Escreva aqui…' },
        handlePaste: (_view, event) => {
          const files = [...event.clipboardData.items].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
          if (!files.length) return false;
          event.preventDefault(); api.images(files); return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer.files.length) return false;
          event.preventDefault();
          const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (point) editor.commands.setTextSelection(point.pos);
          api.images([...event.dataTransfer.files]); return true;
        },
      },
      onTransaction: ({ transaction }) => { for (const token of bookmarks) token.selection = token.selection.map(transaction.mapping); },
      onUpdate: ({ editor }) => {
        editor.view.dom.dataset.empty = String(editor.isEmpty);
        const document = editor.getJSON(); onChange({ document, text: documentText(document), images: [] });
      },
    });
    const capture = () => {
      // A paste can arrive before the browser's deferred selectionchange event.
      const selection = window.getSelection();
      if (document.activeElement === editor.view.dom && selection?.anchorNode && editor.view.dom.contains(selection.anchorNode) && editor.view.dom.contains(selection.focusNode)) {
        const anchor = editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset);
        const head = editor.view.posAtDOM(selection.focusNode, selection.focusOffset);
        const next = TextSelection.between(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head));
        if (!editor.state.selection.eq(next)) editor.view.dispatch(editor.state.tr.setSelection(next));
      }
      const token = { selection: editor.state.selection.getBookmark() }; bookmarks.add(token); return token;
    };
    const insert = (sources, token) => {
      if (editor.isDestroyed) return;
      bookmarks.delete(token);
      const selection = token.selection.resolve(editor.state.doc);
      const follow = editor.state.selection.eq(selection);
      editor.commands.insertContentAt({ from: selection.from, to: selection.to }, sources.map(src => ({ type: 'image', attrs: { src } })), { updateSelection: follow });
      // TrailingNode guarantees a paragraph after the last image; ArrowDown/typing can continue there.
      if (follow) {
        const tr = editor.state.tr;
        editor.view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(tr.selection.to), 1)));
        if (!detached) editor.view.focus();
      }
    };
    const api = {
      capture,
      cancel: token => bookmarks.delete(token),
      insert: (src, token) => insert([src], token),
      async images(files, token = capture()) {
        pending++;
        try {
          const sources = [];
          for (const file of files) {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { notify('Use imagens PNG, JPG ou WebP.'); continue; }
            if (file.size > 4 * 1024 * 1024) { notify('Cada imagem pode ter até 4 MB.'); continue; }
            const src = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
            if (isNoteImage(src)) sources.push(src); else notify('Não foi possível ler esta imagem.');
          }
          if (sources.length) insert(sources, token); else bookmarks.delete(token);
        } finally { pending--; if (detached && !pending) editor.destroy(); }
      },
    };
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
      detached = true;
      // Finish an in-flight paste against the original note even after switching notes.
      if (!pending) editor.destroy();
    };
  }, [note.id]);
  return <div className="note-document-editor" ref={host} />;
});
