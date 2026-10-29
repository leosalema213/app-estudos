import { forwardRef, lazy, Suspense, useImperativeHandle, useRef, useState } from 'react';
import { fontSizes } from './note-document.js';
import { textColor } from './text-format.js';
import { Code2 } from 'lucide-react';
const RichTextField = lazy(() => import('./RichTextField.jsx'));
const FormatToolbar = lazy(() => import('./RichText.jsx').then(module => ({ default: module.FormatToolbar })));

// Complex imported templates stay byte-for-byte intact in source mode.
export function requiresSource(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tags = new Set('P DIV BR STRONG B EM I U UL OL LI H1 H2 H3 SPAN IMG'.split(' '));
  return !!doc.head.children.length || [...doc.body.querySelectorAll('*')].some(el => !tags.has(el.tagName) || [...el.attributes].some(attr => {
    if (el.tagName === 'IMG' && attr.name === 'src') return false;
    if (el.tagName === 'SPAN' && attr.name === 'data-organon-color') return false;
    if (el.tagName === 'OL' && attr.name === 'start') return false;
    if (el.tagName === 'SPAN' && attr.name === 'style') return [...el.style].some(key => !['color', 'font-size', 'font-weight', 'font-style', 'text-decoration'].includes(key)) || !!el.style.color && !textColor(el.style.color) || !!el.style.fontSize && !fontSizes.includes(el.style.fontSize.replace('px', '')) || !!el.style.textDecoration && el.style.textDecoration !== 'underline';
    return true;
  }));
}

export default forwardRef(function AnkiField({ value, label, identity, onChange, onFiles, loadImage, disabled }, ref) {
  const [source, setSource] = useState(() => requiresSource(value));
  const raw = useRef(), visual = useRef(), latest = useRef(); latest.current = { value, onChange };
  useImperativeHandle(ref, () => ({
    ready: () => source || !!visual.current,
    capture: () => source ? { from: raw.current.selectionStart, to: raw.current.selectionEnd } : visual.current?.capture(),
    cancel: token => visual.current?.cancel(token),
    insert(html, token) {
      if (!source) { visual.current?.insert(html, token); return; }
      const { value, onChange } = latest.current, from = token?.from ?? value.length, to = token?.to ?? from;
      onChange(value.slice(0, from) + html + value.slice(to));
    },
  }), [source]);
  const complex = requiresSource(value);
  const htmlButton = <button type="button" className="icon-button" aria-label={source ? 'Voltar ao editor visual' : 'Editar HTML'} title={source && complex ? 'HTML importado: edição do original preserva a estrutura.' : source ? 'Voltar ao editor visual' : 'Editar HTML'} aria-pressed={source} disabled={disabled || source && complex} onMouseDown={e => e.preventDefault()} onClick={() => setSource(!source)}><Code2 size={15} /></button>;
  return <>{source
    ? <div className="rich-text-field anki-source-field"><Suspense fallback={null}><FormatToolbar editor={null} state={{}}>{htmlButton}</FormatToolbar></Suspense><textarea ref={raw} aria-label={label} disabled={disabled} rows={4} value={value} onChange={e => onChange(e.target.value)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onFiles([...e.dataTransfer.files]); }} /></div>
    : <Suspense fallback={<p role="status">Abrindo editor…</p>}><RichTextField key={identity} identity={identity} ref={visual} label={label} content={value} disabled={disabled} toolbarEnd={htmlButton} onChange={({ html }) => onChange(html)} onFiles={onFiles} loadImage={loadImage} /></Suspense>}</>;
});
