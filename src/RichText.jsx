import { Mark } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Heading from '@tiptap/extension-heading';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import { Bold as BoldIcon, Italic as ItalicIcon, List, ListOrdered, Undo2, Redo2 } from 'lucide-react';
import { fontSizes } from './note-document.js';

const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() { return { size: { default: '14', parseHTML: element => element.style.fontSize.replace('px', '') } }; },
  parseHTML() { return [{ tag: 'span[style]', getAttrs: element => fontSizes.includes(element.style.fontSize.replace('px', '')) ? {} : false }]; },
  renderHTML({ mark }) { return ['span', { style: `font-size:${fontSizes.includes(mark.attrs.size) ? mark.attrs.size : '14'}px` }, 0]; },
});
export const richExtensions = [Bold, Italic, Heading.configure({ levels: [1, 2, 3] }), BulletList, OrderedList, ListItem, FontSize];

export function FormatToolbar({ editor, state }) {
  function command(fn) { if (editor && !editor.isDestroyed) { fn(editor.chain()).run(); editor.view.focus(); } }
  const button = (label, Icon, active, run, disabled = false) => <button type="button" className="icon-button" title={label} aria-label={label} aria-pressed={active} disabled={!editor || disabled} onMouseDown={e => e.preventDefault()} onClick={() => command(run)}><Icon size={15} /></button>;
  return <div className="format-toolbar" role="toolbar" aria-label="Formatação do texto">
    <select aria-label="Estilo do texto" value={state.heading || 'paragraph'} onChange={e => command(chain => e.target.value === 'paragraph' ? chain.setParagraph() : chain.setHeading({ level: Number(e.target.value) }))}><option value="paragraph">Texto</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option></select>
    <select aria-label="Tamanho da fonte" value={state.size || '14'} onChange={e => command(chain => chain.setMark('fontSize', { size: e.target.value }))}>{fontSizes.map(size => <option key={size} value={size}>{size} px</option>)}</select>
    <span className="format-separator" />
    {button('Negrito', BoldIcon, !!state.bold, chain => chain.toggleBold())}
    {button('Itálico', ItalicIcon, !!state.italic, chain => chain.toggleItalic())}
    {button('Lista com marcadores', List, !!state.bulletList, chain => chain.toggleBulletList())}
    {button('Lista numerada', ListOrdered, !!state.orderedList, chain => chain.toggleOrderedList())}
    <span className="format-separator" />
    {button('Desfazer', Undo2, undefined, chain => chain.undo(), !state.undo)}
    {button('Refazer', Redo2, undefined, chain => chain.redo(), !state.redo)}
  </div>;
}
