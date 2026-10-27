import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, BookOpen, Check, ImagePlus, NotebookText, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { uid } from './model.js';

function Tool({ label, children, ...props }) {
  return <button className="icon-button" title={label} aria-label={label} type="button" {...props}>{children}</button>;
}
function dateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function NotesPreview({ plan, onOpen }) {
  return <section className="plan-notes-preview" aria-label={`Últimas anotações de ${plan.name}`}>
    {plan.notes.slice(0, 3).map(note => <button className="preview-note" key={note.id} onClick={() => onOpen(note.id)}><NotebookText size={14} /><span><strong>{note.title || 'Sem título'}</strong><small>{note.text.trim().slice(0, 110) || (note.images.length ? 'Anotação com imagem' : 'Sem texto')}</small></span><ArrowUpRight size={13} /></button>)}
    <button className="preview-open" onClick={() => onOpen()}>Abrir caderno <ArrowUpRight size={12} /></button>
  </section>;
}

export default function Notebook({ plan, date, initialNote, saveError, onClose, onChange, notify, Modal, Sketch }) {
  const [selected, setSelected] = useState(plan.notes.find(n => n.id === initialNote)?.id || plan.notes[0]?.id || null);
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [details, setDetails] = useState(false);
  const [sketchNote, setSketchNote] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef();
  const textRef = useRef();
  const pageRef = useRef();
  const note = plan.notes.find(n => n.id === selected);
  const target = plan.notes.find(n => n.id === deleting);
  const filtered = plan.notes.filter(n => `${n.title || ''} ${n.text}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const block = plan.blocks.find(b => b.id === note?.blockId);

  // Apply changes against the latest plan: reading attachments must not overwrite later typing.
  function editById(id, changes) {
    onChange(current => ({ ...current, notes: current.notes.map(n => n.id === id ? { ...n, ...(typeof changes === 'function' ? changes(n) : changes) } : n) }));
  }
  function edit(changes) { if (note) editById(note.id, changes); }
  function add() {
    const next = { id: uid(), date, blockId: '', title: '', text: '', images: [] };
    onChange(current => ({ ...current, notes: [next, ...current.notes] }));
    setSelected(next.id); setQuery(''); setDetails(false);
  }
  function remove() {
    const id = deleting;
    onChange(current => ({ ...current, notes: current.notes.filter(n => n.id !== id) }));
    if (selected === id) setSelected(plan.notes.find(n => n.id !== id)?.id || null);
    setDeleting(null);
  }
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const resize = () => { text.style.height = '0px'; text.style.height = `${Math.max(note.images.length ? 140 : 320, text.scrollHeight)}px`; };
    resize();
    const observer = new ResizeObserver(resize);
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [note?.id, note?.text, note?.images.length, sidebar]);
  useLayoutEffect(() => { if (pageRef.current) pageRef.current.scrollTop = 0; }, [selected]);

  async function imageFiles(files, id = selected) {
    if (!id) return;
    const images = [];
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { notify('Use imagens PNG, JPG ou WebP.'); continue; }
      if (file.size > 4 * 1024 * 1024) { notify('Cada imagem pode ter até 4 MB.'); continue; }
      const data = await new Promise(resolve => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file);
      });
      if (data) images.push(data); else notify('Não foi possível ler esta imagem.');
    }
    if (images.length) editById(id, current => ({ images: [...current.images, ...images] }));
  }
  const actions = <><Tool label={sidebar ? 'Recolher lista de notas' : 'Mostrar lista de notas'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</Tool><button className="primary notebook-new" onClick={add}><Plus size={16} /><span>Nova anotação</span></button></>;

  return <>
    <Modal title={`Anotações · ${plan.name}`} onClose={() => sketchNote ? setSketchNote(null) : onClose()} className="notebook-modal" actions={actions}>
      <div className={`notebook-workspace ${sidebar ? '' : 'list-collapsed'}`}>
        {sidebar && <aside className="notebook-list" aria-label="Lista de anotações">
          <label className="notebook-search"><Search size={14} /><input aria-label="Buscar anotações" placeholder="Buscar notas" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="notebook-list-scroll">{filtered.map(n => <div className={`notebook-list-row ${selected === n.id ? 'selected' : ''}`} key={n.id}>
            <button className="notebook-select" aria-current={selected === n.id ? 'true' : undefined} onClick={() => setSelected(n.id)}><strong>{n.title || 'Sem título'}</strong><p>{n.text.trim().slice(0, 100) || (n.images.length ? 'Anotação com imagem' : 'Sem texto')}</p><time dateTime={n.date}>{dateLabel(n.date)}</time></button>
            <Tool label={`Excluir anotação ${n.title || 'Sem título'}`} onClick={() => setDeleting(n.id)}><X size={13} /></Tool>
          </div>)}{!filtered.length && <p className="notebook-list-empty">{query ? 'Nenhuma nota encontrada.' : 'Nenhuma anotação.'}</p>}</div>
          <small className="notebook-note-count">{plan.notes.length} {plan.notes.length === 1 ? 'anotação' : 'anotações'}</small>
        </aside>}
        <section className="notebook-document" aria-label="Editor de anotações">
          {note ? <>
            <div className="notebook-tools"><span className={`notebook-save ${saveError ? 'has-error' : ''}`} role="status">{saveError ? <X size={12} /> : <Check size={12} />}{saveError ? 'Falha ao salvar' : 'Salvamento automático'}</span><div><button className="notebook-tool" onClick={() => fileRef.current.click()}><ImagePlus size={16} /><span>Imagem</span></button><button className="notebook-tool" onClick={() => setSketchNote(note.id)}><PenLine size={16} /><span>Rabiscar</span></button><Tool label="Detalhes da anotação" aria-expanded={details} onClick={() => setDetails(!details)}><SlidersHorizontal size={16} /></Tool></div></div>
            {details && <div className="notebook-details"><label>Data<input type="date" aria-label="Data da anotação" value={note.date} onChange={e => e.target.value && edit({ date: e.target.value })} /></label><label>Aula vinculada<select aria-label="Vincular anotação à aula" value={note.blockId || ''} onChange={e => edit({ blockId: e.target.value })}><option value="">Sem aula vinculada</option>{plan.blocks.filter(b => b.type === 'lesson').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>}
            <div className="notebook-page" ref={pageRef}><div className="notebook-paper"><div className="notebook-page-meta"><time dateTime={note.date}>{dateLabel(note.date)}</time>{block && <span><BookOpen size={12} />{block.name}</span>}</div>
              <input className="notebook-title" aria-label="Título da anotação" placeholder="Título" value={note.title || ''} maxLength={160} onChange={e => edit({ title: e.target.value })} />
              <textarea ref={textRef} className={`notebook-text ${note.images.length ? 'with-attachments' : ''}`} aria-label="Texto da anotação" placeholder="Escreva aqui…" value={note.text} onChange={e => edit({ text: e.target.value })} onPaste={e => {
                const files = [...e.clipboardData.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
                if (files.length) { e.preventDefault(); imageFiles(files, note.id); }
              }} />
              <div className="note-images notebook-assets">{note.images.map((src, i) => <div key={i}><img src={src} alt={`Imagem da anotação ${i + 1}`} /><Tool label={`Remover imagem ${i + 1}`} onClick={() => edit(current => ({ images: current.images.filter((_, index) => index !== i) }))}><X size={14} /></Tool></div>)}</div>
            </div></div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple onChange={e => { imageFiles([...e.target.files], note.id); e.target.value = ''; }} />
          </> : <div className="notebook-empty"><NotebookText size={32} /><h3>Seu caderno</h3><button className="secondary" onClick={add}><Plus size={15} />Escrever primeira nota</button></div>}
        </section>
      </div>
      {sketchNote && <Sketch onClose={() => setSketchNote(null)} onSave={src => { editById(sketchNote, current => ({ images: [...current.images, src] })); setSketchNote(null); }} />}
    </Modal>
    {target && createPortal(<Modal title="Excluir anotação?" onClose={() => setDeleting(null)} small className="note-delete-confirm"><div className="note-delete-body"><Trash2 size={23} /><p><strong>{target.title || 'Sem título'}</strong></p><p>O texto e as imagens desta nota serão removidos.</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Cancelar</button><button className="danger-button" onClick={remove}>Excluir anotação</button></div></div></Modal>, document.body)}
  </>;
}
