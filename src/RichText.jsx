import { useId } from 'react';
import { Mark } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Heading from '@tiptap/extension-heading';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import { Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, List, ListOrdered, Undo2, Redo2, Palette, RotateCcw } from 'lucide-react';
import { fontSizes } from './note-document.js';
import { textColor, textColors } from './text-format.js';
import './rich-text.css';

const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() { return { size: { default: '14', parseHTML: element => element.style.fontSize.replace('px', '') } }; },
  parseHTML() { return [{ tag: 'span[style]', consuming: false, getAttrs: element => fontSizes.includes(element.style.fontSize.replace('px', '')) ? {} : false }]; },
  renderHTML({ mark }) { return ['span', { style: `font-size:${fontSizes.includes(mark.attrs.size) ? mark.attrs.size : '14'}px` }, 0]; },
});
const Underline = Mark.create({ name: 'underline', parseHTML: () => [{ tag: 'u' }, { style: 'text-decoration', getAttrs: value => value.includes('underline') ? {} : false }], renderHTML: () => ['u', {}, 0], addCommands() { return { toggleUnderline: () => ({ commands }) => commands.toggleMark(this.name) }; }, addKeyboardShortcuts() { return { 'Mod-u': () => this.editor.commands.toggleUnderline() }; } });
const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() { return { color: { default: null, parseHTML: element => textColor(element.style.color) } }; },
  parseHTML: () => [{ tag: 'span[style]', consuming: false, getAttrs: element => textColor(element.style.color) ? {} : false }],
  renderHTML: ({ mark }) => ['span', { style: `color:${textColor(mark.attrs.color) || 'inherit'}`, 'data-organon-color': textColor(mark.attrs.color) }, 0],
});
export const richExtensions = [Bold, Italic, Underline, Heading.configure({ levels: [1, 2, 3] }), BulletList, OrderedList, ListItem, FontSize, TextColor];
export const formatState = editor => ({ bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), color: editor.getAttributes('textColor').color || '', heading: editor.isActive('heading') ? editor.getAttributes('heading').level : '', size: editor.getAttributes('fontSize').size || '14', bulletList: editor.isActive('bulletList'), orderedList: editor.isActive('orderedList'), undo: editor.can().undo(), redo: editor.can().redo() });

export function FormatToolbar({ editor, state, children }) {
  const paletteId = useId();
  function command(fn) { if (editor && !editor.isDestroyed) { fn(editor.chain()).run(); editor.view.focus(); } }
  const button = (label, Icon, active, run, disabled = false) => <button type="button" className="icon-button" title={label} aria-label={label} aria-pressed={active} disabled={!editor || disabled} onMouseDown={e => e.preventDefault()} onClick={() => command(run)}><Icon size={15} /></button>;
  return <div className="format-toolbar" role="toolbar" aria-label="Formatação do texto">
    <select disabled={!editor} aria-label="Estilo do texto" value={state.heading || 'paragraph'} onChange={e => command(chain => e.target.value === 'paragraph' ? chain.setParagraph() : chain.setHeading({ level: Number(e.target.value) }))}><option value="paragraph">Texto</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option></select>
    <select disabled={!editor} aria-label="Tamanho da fonte" value={state.size || '14'} onChange={e => command(chain => chain.setMark('fontSize', { size: e.target.value }))}>{fontSizes.map(size => <option key={size} value={size}>{size} px</option>)}</select>
    <span className="format-separator" />
    {button('Negrito', BoldIcon, !!state.bold, chain => chain.toggleBold())}
    {button('Itálico', ItalicIcon, !!state.italic, chain => chain.toggleItalic())}
    {button('Sublinhado', UnderlineIcon, !!state.underline, chain => chain.toggleUnderline())}
    <label className="format-color" title="Cor do texto"><Palette size={15} /><input type="color" aria-label="Cor do texto" list={paletteId} disabled={!editor} value={textColor(state.color) || textColors[0]} onChange={e => command(chain => chain.setMark('textColor', { color: e.target.value }))} /></label>
    <datalist id={paletteId}>{textColors.map(color => <option key={color} value={color} />)}</datalist>
    {button('Restaurar cor do texto', RotateCcw, undefined, chain => chain.unsetMark('textColor'), !state.color)}
    {button('Lista com marcadores', List, !!state.bulletList, chain => chain.toggleBulletList())}
    {button('Lista numerada', ListOrdered, !!state.orderedList, chain => chain.toggleOrderedList())}
    <span className="format-separator" />
    {button('Desfazer', Undo2, undefined, chain => chain.undo(), !state.undo)}
    {button('Refazer', Redo2, undefined, chain => chain.redo(), !state.redo)}
    {children}
  </div>;
}
