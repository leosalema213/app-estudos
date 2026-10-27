import { lazy, Suspense, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, FileText, ImagePlus, NotebookPen, Pencil, PenLine, Plus, Search, Trash2, X } from 'lucide-react';
import { newNotebook, newPage } from './model.js';
import CoverPicker, { coverIcons } from './CoverPicker.jsx';
import { customCoverStyle } from './book-appearance.js';
import { documentHeadings, isNoteImage } from './note-document.js';

const NoteEditor = lazy(() => import('./NoteEditor.jsx'));
function indexedTitle(page) { return page.title.trim() || documentHeadings(page.document).find(heading => heading.text.trim())?.text || ''; }
function IconButton({ label, children, ...props }) { return <button type="button" className="icon-button" aria-label={label} title={label} {...props}>{children}</button>; }
function BookCover({ book, small = false }) {
  const Icon = book.icon === 'none' ? null : coverIcons[book.icon] || BookOpen;
  return <div className={`journal-cover cover-${book.color.startsWith('#') ? 'custom' : book.color} ${small ? 'small-cover' : ''}`} style={customCoverStyle(book.color)}>{book.cover && <img src={book.cover} alt="" />}{Icon && <span><Icon size={small ? 18 : 30} strokeWidth={1.4} /></span>}</div>;
}

export default function Library({ notebooks, onChange, notify, saveError, Modal, Sketch }) {
  const [bookId, setBookId] = useState(null);
  const [pageId, setPageId] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [loadingCover, setLoadingCover] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [sketch, setSketch] = useState(null);
  const editor = useRef(); const file = useRef(); const insertion = useRef(); const sheet = useRef();
  const book = notebooks.find(item => item.id === bookId);
  const page = book?.pages.find(item => item.id === pageId) || book?.pages[0];
  const headings = documentHeadings(page?.document);
  const filtered = book?.pages.filter(item => `${item.title} ${item.text}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))) || [];

  function editPage(id, changes) {
    const origin = book.id;
    onChange(current => current.map(item => item.id === origin ? { ...item, pages: item.pages.map(value => value.id === id ? { ...value, ...changes } : value) } : item));
  }
  function openBook(value) { setBookId(value.id); setPageId(value.pages[0]?.id || null); setQuery(''); }
  function selectPage(id) { setPageId(id); if (sheet.current) sheet.current.scrollTop = 0; }
  function addPage() {
    const next = newPage();
    onChange(current => current.map(item => item.id === book.id ? { ...item, pages: [...item.pages, next] } : item));
    setPageId(next.id); setQuery(''); if (sheet.current) sheet.current.scrollTop = 0;
  }
  function saveBook(event) {
    event.preventDefault(); if (!draft.name.trim() || loadingCover) return;
    const value = { ...draft, name: draft.name.trim() };
    onChange(current => current.some(item => item.id === value.id) ? current.map(item => item.id === value.id ? { ...item, name: value.name, icon: value.icon, color: value.color, cover: value.cover } : item) : [...current, value]);
    if (!notebooks.some(item => item.id === value.id)) openBook(value);
    setDraft(null);
  }
  async function coverImage(image) {
    if (!image) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type) || image.size > 4 * 1024 * 1024) { notify('Use uma imagem PNG, JPG ou WebP de até 4 MB.'); return; }
    const id = draft.id; setLoadingCover(true);
    const src = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(image); });
    if (isNoteImage(src)) setDraft(current => current?.id === id ? { ...current, cover: src } : current); else notify('Não foi possível ler a capa.');
    setLoadingCover(false);
  }
  function pickImage() {
    if (!editor.current) return;
    insertion.current = { editor: editor.current, token: editor.current.capture() }; file.current.click();
  }
  function closeSketch() { sketch?.editor.cancel(sketch.token); setSketch(null); }
  function remove() {
    if (deleting.kind === 'book') {
      onChange(current => current.filter(item => item.id !== deleting.bookId)); setBookId(null); setPageId(null);
    } else {
      onChange(current => current.map(item => item.id === deleting.bookId ? { ...item, pages: item.pages.filter(value => value.id !== deleting.id) } : item));
      if (page?.id === deleting.id) setPageId(book.pages.find(value => value.id !== deleting.id)?.id || null);
    }
    setDeleting(null);
  }
  return <div className="journal-area">
    <div className="journal-heading">{book ? <><IconButton label="Todos os cadernos" onClick={() => setBookId(null)}><ArrowLeft size={19} /></IconButton><BookCover book={book} small /><h1>{book.name}</h1><IconButton label="Editar caderno" onClick={() => setDraft({ ...book })}><Pencil size={15} /></IconButton><button className="primary" onClick={addPage}><Plus size={16} />Nova página</button></> : <><h1>Cadernos</h1><button className="primary" onClick={() => setDraft(newNotebook())}><Plus size={16} />Novo caderno</button></>}</div>
    {!book ? <>
      {!notebooks.length ? <div className="journal-empty"><NotebookPen size={34} strokeWidth={1.3} /><h2>Um lugar para suas ideias</h2><p>Diário, casa, pensamentos. Cada caderno, um espaço seu.</p><button className="secondary" onClick={() => setDraft(newNotebook())}><Plus size={15} />Criar caderno</button></div> : <div className="journal-grid">{notebooks.map(value => <article className="journal-card" key={value.id}><button className="journal-open" aria-label={`Abrir caderno ${value.name}`} onClick={() => openBook(value)}><BookCover book={value} /><div><h2>{value.name}</h2><small>{value.pages.length} {value.pages.length === 1 ? 'página' : 'páginas'}</small></div></button><IconButton label={`Editar caderno ${value.name}`} onClick={() => setDraft({ ...value })}><Pencil size={14} /></IconButton></article>)}</div>}
    </> : <div className="journal-layout">
      <aside className="journal-index" aria-label="Índice do caderno"><div className="journal-index-title"><span>PÁGINAS</span><span>{book.pages.length}</span></div><label className="notebook-search"><Search size={13} /><input aria-label="Buscar páginas" placeholder="Buscar páginas" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="journal-pages">{filtered.map(value => <div className={`journal-page-row ${value.id === page?.id ? 'selected' : ''}`} key={value.id}><button aria-current={value.id === page?.id ? 'page' : undefined} onClick={() => selectPage(value.id)}><FileText size={14} /><span>{indexedTitle(value) || `Página ${book.pages.indexOf(value) + 1}`}</span></button><IconButton label={`Excluir página ${indexedTitle(value) || book.pages.indexOf(value) + 1}`} onClick={() => setDeleting({ kind: 'page', bookId: book.id, id: value.id, name: indexedTitle(value) || 'Sem título' })}><X size={12} /></IconButton></div>)}{!filtered.length && <p className="journal-no-results">{query ? 'Nenhuma página encontrada.' : 'Nenhuma página.'}</p>}</div>
        {!!headings.length && <nav className="journal-outline" aria-label="Títulos desta página"><span>NESTA PÁGINA</span>{headings.map((heading, index) => <button key={index} style={{ paddingLeft: 8 + (heading.level - 1) * 10 }} onClick={() => editor.current?.goToHeading(index)}>{heading.text || 'Título sem texto'}</button>)}</nav>}
      </aside>
      <section className="journal-document" aria-label="Página do caderno">{page ? <>
        <div className="journal-page-tools"><span className={saveError ? 'has-error' : ''}><Check size={12} />{saveError ? 'Falha ao salvar' : 'Salvo automaticamente'}</span><div><button className="notebook-tool" onClick={pickImage}><ImagePlus size={15} />Imagem</button><button className="notebook-tool" onClick={() => editor.current && setSketch({ editor: editor.current, token: editor.current.capture() })}><PenLine size={15} />Rabiscar</button></div></div>
        <div className="journal-sheet" ref={sheet}><div className="journal-paper"><time dateTime={page.date}>{new Date(`${page.date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</time><input className="notebook-title" aria-label="Título da página" maxLength={160} placeholder="Sem título" value={page.title} onChange={event => editPage(page.id, { title: event.target.value })} />
          <Suspense fallback={<p className="muted">Abrindo página…</p>}><NoteEditor key={page.id} note={page} ref={editor} rich onChange={changes => editPage(page.id, changes)} notify={notify} /></Suspense>
        </div></div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple onCancel={() => { const value = insertion.current; if (value) value.editor.cancel(value.token); insertion.current = null; }} onChange={event => { const value = insertion.current; if (value) value.editor.images([...event.target.files], value.token); insertion.current = null; event.target.value = ''; }} />
      </> : <div className="journal-empty"><FileText size={28} /><p>Comece uma nova página.</p><button className="secondary" onClick={addPage}><Plus size={15} />Nova página</button></div>}</section>
    </div>}
    {draft && <Modal title={notebooks.some(item => item.id === draft.id) ? 'Editar caderno' : 'Novo caderno'} onClose={() => setDraft(null)} small className="journal-book-modal"><form className="journal-book-form" onSubmit={saveBook}>
      <BookCover book={draft} /><label>Nome<input autoFocus required maxLength={80} aria-label="Nome do caderno" placeholder="Meu diário" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <CoverPicker icon={draft.icon} color={draft.color} onChange={changes => setDraft(current => ({ ...current, ...changes }))} />
      <div className="journal-cover-actions"><label className="secondary"><ImagePlus size={15} />{loadingCover ? 'Carregando…' : 'Escolher capa'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Imagem de capa" onChange={event => { coverImage(event.target.files[0]); event.target.value = ''; }} /></label>{draft.cover && <button type="button" className="notebook-tool" onClick={() => setDraft({ ...draft, cover: null })}>Remover capa</button>}</div>
      <div className="modal-actions">{notebooks.some(item => item.id === draft.id) && <IconButton label="Excluir caderno" onClick={() => { setDeleting({ kind: 'book', bookId: draft.id, name: draft.name }); setDraft(null); }}><Trash2 size={16} /></IconButton>}<button type="button" className="secondary" onClick={() => setDraft(null)}>Cancelar</button><button type="submit" className="primary" disabled={loadingCover || !draft.name.trim()}>Salvar caderno</button></div>
    </form></Modal>}
    {sketch && <Sketch onClose={closeSketch} onSave={src => { sketch.editor.insert(src, sketch.token); setSketch(null); }} />}
    {deleting && <Modal title={deleting.kind === 'book' ? 'Excluir caderno?' : 'Excluir página?'} onClose={() => setDeleting(null)} small><div className="note-delete-body"><Trash2 size={22} /><p><strong>{deleting.name}</strong></p><p>{deleting.kind === 'book' ? 'Todas as páginas, imagens e desenhos deste caderno serão removidos.' : 'O conteúdo desta página será removido.'}</p><div className="modal-actions"><button className="secondary" onClick={() => setDeleting(null)}>Cancelar</button><button className="danger-button" onClick={remove}>{deleting.kind === 'book' ? 'Excluir caderno' : 'Excluir página'}</button></div></div></Modal>}
  </div>;
}
