import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, BookOpen, CalendarDays, Check, ImagePlus, NotebookText, PanelLeftClose, PanelLeftOpen, PenLine, Pin, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { orderedNotes, uid } from './model.js';
import { documentImages } from './note-document.js';
import { planForDate } from './daily-plans.js';

const NoteEditor = lazy(() => import('./NoteEditor.jsx'));

function Tool({ label, children, ...props }) {
  return <button className="icon-button" title={label} aria-label={label} type="button" {...props}>{children}</button>;
}
function dateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function NotesPreview({ plan, onOpen }) {
  return <section className="plan-notes-preview" aria-label={`Últimas anotações de ${plan.name}`}>
    {orderedNotes(plan.notes).slice(0, 3).map(note => <button className="preview-note" key={note.id} onClick={() => onOpen(note.id)}>{note.pinned ? <Pin size={14} /> : <NotebookText size={14} />}<span><strong>{note.title || 'Sem título'}</strong><small>{note.text.trim().slice(0, 110) || (documentImages(note).length ? 'Anotação com imagem' : 'Sem texto')}</small></span><ArrowUpRight size={13} /></button>)}
    <button className="preview-open" onClick={() => onOpen()}>Abrir caderno <ArrowUpRight size={12} /></button>
  </section>;
}

export default function Notebook({ plan, date, initialNote, saveError, onClose, onChange, notify, Modal, Sketch }) {
  const [selected, setSelected] = useState(plan.notes.find(n => n.id === initialNote)?.id || orderedNotes(plan.notes)[0]?.id || null);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [details, setDetails] = useState(false);
  const [sketchNote, setSketchNote] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef();
  const editorRef = useRef();
  const fileInsertion = useRef();
  const pageRef = useRef();
  const note = plan.notes.find(n => n.id === selected);
  const target = plan.notes.find(n => n.id === deleting);
  const filtered = orderedNotes(plan.notes).filter(n => (!dateFilter || n.date === dateFilter) && `${n.title || ''} ${n.text}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const notePlan = planForDate(plan, note?.date || date);
  const block = notePlan.blocks.find(b => b.id === note?.blockId);

  // Apply changes against the latest plan: reading attachments must not overwrite later typing.
  function editById(id, changes) {
    onChange(current => ({ ...current, notes: current.notes.map(n => n.id === id ? { ...n, ...(typeof changes === 'function' ? changes(n) : changes) } : n) }));
  }
  function edit(changes) { if (note) editById(note.id, changes); }
  function add() {
    const next = { id: uid(), date, blockId: '', title: '', text: '', images: [], pinned: false };
    onChange(current => ({ ...current, notes: [next, ...current.notes] }));
    setSelected(next.id); setQuery(''); setDateFilter(''); setDetails(false);
  }
  function remove() {
    const id = deleting;
    onChange(current => ({ ...current, notes: current.notes.filter(n => n.id !== id) }));
    if (selected === id) setSelected(orderedNotes(plan.notes).find(n => n.id !== id)?.id || null);
    setDeleting(null);
  }
  useLayoutEffect(() => { if (pageRef.current) pageRef.current.scrollTop = 0; }, [selected]);
  function pickImage() {
    if (!editorRef.current) return;
    fileInsertion.current = { editor: editorRef.current, token: editorRef.current.capture() };
    fileRef.current.click();
  }
  function closeSketch() { sketchNote?.editor.cancel(sketchNote.token); setSketchNote(null); }
  const actions = <><Tool label={sidebar ? 'Recolher lista de notas' : 'Mostrar lista de notas'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</Tool><button className="primary notebook-new" onClick={add}><Plus size={16} /><span>Nova anotação</span></button></>;

  return <>
    <Modal panel title={`Anotações · ${plan.name}`} onClose={() => sketchNote ? closeSketch() : onClose()} className="notebook-modal" actions={actions}>
      <div className={`notebook-workspace ${sidebar ? '' : 'list-collapsed'}`}>
        {sidebar && <aside className="notebook-list" aria-label="Lista de anotações">
          <div className="notebook-search-row"><label className="notebook-search"><Search size={14} /><input aria-label="Buscar anotações" placeholder="Buscar notas" value={query} onChange={e => setQuery(e.target.value)} /></label><Tool label="Filtrar notas por data" className={`icon-button notebook-date-toggle ${dateFilter ? 'active' : ''}`} aria-expanded={filterOpen} aria-pressed={!!dateFilter} onClick={() => setFilterOpen(!filterOpen)}><CalendarDays size={16} /></Tool></div>
          {filterOpen && <div className="notebook-date-filter"><label>Data<input type="date" aria-label="Filtrar anotações pela data" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /></label>{dateFilter && <Tool label="Limpar filtro de data" onClick={() => setDateFilter('')}><X size={13} /></Tool>}</div>}
          <div className="notebook-list-scroll">{filtered.map(n => <div className={`notebook-list-row ${selected === n.id ? 'selected' : ''}`} key={n.id}>
            <button className="notebook-select" aria-current={selected === n.id ? 'true' : undefined} onClick={() => setSelected(n.id)}><strong>{n.title || 'Sem título'}</strong><p>{n.text.trim().slice(0, 100) || (documentImages(n).length ? 'Anotação com imagem' : 'Sem texto')}</p><time dateTime={n.date}>{dateLabel(n.date)}</time></button>
            <div className="notebook-row-actions"><Tool label={`${n.pinned ? 'Desafixar' : 'Fixar'} anotação ${n.title || 'Sem título'}`} aria-pressed={!!n.pinned} onClick={() => editById(n.id, current => ({ pinned: !current.pinned }))}><Pin size={13} fill={n.pinned ? 'currentColor' : 'none'} /></Tool><Tool label={`Excluir anotação ${n.title || 'Sem título'}`} onClick={() => setDeleting(n.id)}><X size={13} /></Tool></div>
          </div>)}{!filtered.length && <p className="notebook-list-empty">{query || dateFilter ? 'Nenhuma nota encontrada.' : 'Nenhuma anotação.'}</p>}</div>
          <small className="notebook-note-count">{query || dateFilter ? `${filtered.length} de ` : ''}{plan.notes.length} {plan.notes.length === 1 ? 'anotação' : 'anotações'}</small>
        </aside>}
        <section className="notebook-document" aria-label="Editor de anotações">
          {note ? <>
            <div className="notebook-tools"><span className={`notebook-save ${saveError ? 'has-error' : ''}`} role="status">{saveError ? <X size={12} /> : <Check size={12} />}{saveError ? 'Falha ao salvar' : 'Salvamento automático'}</span><div><button className="notebook-tool" onClick={pickImage}><ImagePlus size={16} /><span>Imagem</span></button><button className="notebook-tool" onClick={() => editorRef.current && setSketchNote({ editor: editorRef.current, token: editorRef.current.capture() })}><PenLine size={16} /><span>Rabiscar</span></button><Tool label="Detalhes da anotação" aria-expanded={details} onClick={() => setDetails(!details)}><SlidersHorizontal size={16} /></Tool></div></div>
            {details && <div className="notebook-details"><label>Data<input type="date" aria-label="Data da anotação" value={note.date} onChange={e => e.target.value && edit({ date: e.target.value })} /></label><label>Aula vinculada<select aria-label="Vincular anotação à aula" value={note.blockId || ''} onChange={e => edit({ blockId: e.target.value })}><option value="">Sem aula vinculada</option>{plan.blocks.filter(b => b.type === 'lesson').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>}
            <div className="notebook-page" ref={pageRef}><div className="notebook-paper"><div className="notebook-page-meta"><time dateTime={note.date}>{dateLabel(note.date)}</time>{block && <span><BookOpen size={12} />{block.name}</span>}</div>
              <input className="notebook-title" aria-label="Título da anotação" placeholder="Título" value={note.title || ''} maxLength={160} onChange={e => edit({ title: e.target.value })} />
              <Suspense fallback={<p className="muted">Abrindo caderno…</p>}><NoteEditor key={note.id} ref={editorRef} note={note} onChange={changes => editById(note.id, changes)} notify={notify} /></Suspense>
            </div></div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple onCancel={() => { const insertion = fileInsertion.current; if (insertion) insertion.editor.cancel(insertion.token); fileInsertion.current = null; }} onChange={e => { const insertion = fileInsertion.current; if (insertion) insertion.editor.images([...e.target.files], insertion.token); fileInsertion.current = null; e.target.value = ''; }} />
          </> : <div className="notebook-empty"><NotebookText size={32} /><h3>Seu caderno</h3><button className="secondary" onClick={add}><Plus size={15} />Escrever primeira nota</button></div>}
        </section>
      </div>
      {sketchNote && <Sketch onClose={closeSketch} onSave={src => { sketchNote.editor.insert(src, sketchNote.token); setSketchNote(null); }} />}
    </Modal>
    {target && createPortal(<Modal title="Excluir anotação?" onClose={() => setDeleting(null)} small className="note-delete-confirm"><div className="note-delete-body"><Trash2 size={23} /><p><strong>{target.title || 'Sem título'}</strong></p><p>O texto e as imagens desta nota serão removidos.</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Cancelar</button><button className="danger-button" onClick={remove}>Excluir anotação</button></div></div></Modal>, document.body)}
  </>;
}
