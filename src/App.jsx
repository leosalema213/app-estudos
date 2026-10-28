import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, Coffee, Copy, Download, Expand, Flame, GripVertical, LayoutDashboard, ListFilter, Minus, MoreHorizontal, Moon, Sun, Pause, Pencil, Play, Plus, RotateCcw, Settings, Sparkles, Target, Trash2, TrendingUp, Upload, Volume2, VolumeX, X, ImagePlus, PenLine, PanelTopClose, LayoutGrid, List, NotebookText, StickyNote } from 'lucide-react';
import { clock, completedPlanSummary, dailySummary, dayKey, days, duration, editBlock, extendLesson, firstPlan, focusMs, getRecord, newBlock, newPlan, pause, play, preferences, recordKey, resetTimer, seed, setManualDone, setPlanCompleted, themePresets, tick, uid, validateData } from './model.js';
import Tutorial from './Tutorial.jsx';
import Notebook, { NotesPreview } from './Notebook.jsx';
import Library from './Library.jsx';
import CoverPicker, { coverIcons } from './CoverPicker.jsx';
import { customCoverStyle, planIconKey } from './book-appearance.js';
import RemindersPage, { DailyNotes, ReminderEditor } from './Reminders.jsx';
import { markReminder, newReminder } from './reminders.js';
import { version as appVersion } from '../package.json';
import organonWordmark from '../assets/branding/organon-wordmark.svg';
import Preferences from './Preferences.jsx';
import { UpdateDialog, useAppUpdates } from './Updates.jsx';

const LOCAL_KEY = 'compasso-v1';
let audioContext;
function unlockAudio() { try { audioContext ||= new AudioContext(); if (audioContext.state === 'suspended') audioContext.resume(); } catch {} }
function ring() {
  unlockAudio();
  if (!audioContext) return;
  for (let i = 0; i < 4; i++) {
    const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
    const t = audioContext.currentTime + i * 0.34;
    osc.type = 'sine'; osc.frequency.value = i % 2 ? 880 : 660;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.22, t + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.27);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t + 0.3);
  }
}
const IconButton = ({ title, children, ...props }) => <button className="icon-button" title={title} aria-label={title} {...props}>{children}</button>;
function CompactExtraTime({ disabled, onAdd }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    container.current.querySelector('[data-minutes]')?.focus();
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <span className="compact-extra" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={trigger} className="icon-button" aria-label="Adicionar minutos à aula" title={disabled ? 'Acréscimos disponíveis somente para aulas' : 'Adicionar minutos à aula'} disabled={disabled} aria-expanded={open} aria-controls={open ? 'compact-extra-options' : undefined} onClick={() => setOpen(value => !value)}><Plus size={15} /></button>
    {open && <div id="compact-extra-options" className="compact-extra-options no-drag" role="group" aria-label="Tempo extra nesta aula">{[2, 3, 5].map(minutes => <button key={minutes} data-minutes={minutes} aria-label={`Adicionar ${minutes} minutos`} onClick={() => { onAdd(minutes); close(); }}>+{minutes} min</button>)}</div>}
  </span>;
}
function PlanIcon({ plan, size = 21 }) {
  const Icon = coverIcons[planIconKey(plan)]; const custom = customCoverStyle(plan.color);
  return <span className={`plan-icon ${plan.color.startsWith('#') ? 'custom' : plan.color}`} style={custom ? { background: plan.color, color: custom['--cover-ink'] } : undefined}>{Icon && <Icon size={size} />}</span>;
}
function planAccent(plan) { const custom = customCoverStyle(plan.color); return custom ? { '--plan-color': plan.color, '--plan-ink': custom['--cover-ink'] } : undefined; }
function dotStyle(color) { return color?.startsWith('#') ? { background: color } : undefined; }
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

export default function App() {
  const [data, setData] = useState(null);
  const dataRef = useRef(null);
  const [fatal, setFatal] = useState('');
  const [page, setPage] = useState('today');
  const [date, setDate] = useState(dayKey());
  const currentDay = useRef(dayKey());
  const [filter, setFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('active');
  const [compact, setCompact] = useState(false);
  const [editor, setEditor] = useState(null);
  const [reminderEditor, setReminderEditor] = useState(null);
  const [notesFilter, setNotesFilter] = useState('all');
  const reminderStartupChecked = useRef(false);
  const [tutorial, setTutorial] = useState(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [blockEditor, setBlockEditor] = useState(null);
  const [notesPlan, setNotesPlan] = useState(null);
  const [initialNote, setInitialNote] = useState(null);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [saveError, setSaveError] = useState('');
  const [settings, setSettings] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const saveQueue = useRef(Promise.resolve());
  const initialized = useRef(false);
  const checkpoint = useRef({ at: 0, data: null });
  const appUpdates = useAppUpdates(!!data);
  useEffect(() => window.desktop?.onOpenReminders?.(async () => {
    await changeCompact(false); setDate(dayKey()); setNotesFilter('today'); setPage('notes');
  }), []);
  useEffect(() => {
    if (!data || reminderStartupChecked.current || !window.desktop?.reminders) return;
    reminderStartupChecked.current = true;
    persist(dataRef.current).then(saved => { if (saved) window.desktop.reminders.startup().catch(() => {}); });
  }, [!!data]);
  const update = (fn) => {
    const next = typeof fn === 'function' ? fn(dataRef.current) : fn;
    dataRef.current = next; setData(next);
  };
  const persist = (value) => {
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      try { if (window.desktop) await window.desktop.save(value); else localStorage.setItem(LOCAL_KEY, JSON.stringify(value)); setSaveError(''); setSavedAt(new Date()); return true; }
      catch (err) { setSaveError('Não foi possível salvar. Exporte um backup e verifique o espaço no disco.'); return false; }
    });
    return saveQueue.current;
  };
  useEffect(() => {
    (async () => {
      try {
        const loaded = window.desktop ? await window.desktop.load() : JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
        if (loaded) validateData(loaded);
        const next = loaded || seed();
        next.settings = preferences(next.settings);
        next.onboardingCompleted ??= true;
        next.notebooks ??= [];
        next.reminders ??= [];
        if (!next.onboardingCompleted) setTutorial(next.plans.length ? 'tips' : 'welcome');
        // Closing the app pauses the session: time away is never credited as study.
        if (next.active && next.plans.find(plan => plan.id === next.active.planId)?.completedAt) next.active = null;
        if (next.active) next.active = { ...next.active, running: false, startedAt: Date.now() };
        update(next); initialized.current = true;
      } catch (err) { setFatal(err.message); }
    })();
  }, []);
  useEffect(() => {
    if (!data || !initialized.current) return;
    const previous = checkpoint.current.data;
    const timerOnly = data.active?.running && previous?.active?.running
      && previous.plans === data.plans && previous.settings === data.settings && previous.notebooks === data.notebooks && previous.reminders === data.reminders
      && previous.active.planId === data.active.planId && previous.active.blockId === data.active.blockId
      && previous.active.totalMs === data.active.totalMs;
    if (timerOnly && Date.now() - checkpoint.current.at < 5000) return;
    checkpoint.current = { at: Date.now(), data };
    persist(data);
  }, [data]);
  const themePreference = data?.settings?.theme || 'system';
  const theme = themePreference === 'custom' ? 'dark' : themePreference === 'system' ? systemDark ? 'dark' : 'light' : themePreference;
  const palette = data?.settings?.palette || 'pink';
  const plansView = data?.settings?.plansView || 'cards';
  const density = data?.settings?.density || 'compact';
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    changed(); media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themePreference === 'custom') {
      const preset = themePresets.find(p => p.id === palette) || themePresets[0];
      document.documentElement.dataset.palette = preset.id;
      for (const [key, value] of Object.entries(preset)) if (!['id', 'name'].includes(key)) document.documentElement.style.setProperty('--custom-' + key, value);
    } else document.documentElement.removeAttribute('data-palette');
    window.desktop?.appearance(themePreference === 'custom' ? 'dark' : themePreference).then(result => {
      document.documentElement.dataset.glass = result?.glass ? 'native' : 'fallback';
    }).catch(() => { document.documentElement.dataset.glass = 'fallback'; });
  }, [theme, themePreference, palette]);
  const toggleTheme = () => update(s => ({ ...s, settings: { ...s.settings, theme: theme === 'dark' ? 'light' : 'dark' } }));
  useEffect(() => {
    const interval = setInterval(() => {
      const today = dayKey();
      if (today !== currentDay.current) {
        const previous = currentDay.current; currentDay.current = today;
        setDate(selected => selected === previous ? today : selected);
      }
      if (!dataRef.current?.active?.running) return;
      const result = tick(dataRef.current);
      update(result.state);
      if (result.finished) {
        const active = result.state.active;
        if (result.state.settings.sound) ring();
        window.desktop?.notify(`${active.blockName} terminou. Você escolhe quando começar o próximo bloco.`);
        setToast(`✓ ${active.blockName} concluído! Próximo bloco no seu tempo.`);
      }
    }, 1000);
    const onClose = () => { if (dataRef.current) { const next = pause(dataRef.current); if (window.desktop) window.desktop.save(next); else localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } };
    window.addEventListener('beforeunload', onClose);
    const unsubscribe = window.desktop?.onSuspend(() => {
      if (dataRef.current?.active?.running) {
        update(s => pause(s));
        persist(dataRef.current);
        setToast('O computador foi suspenso. Seu cronômetro ficou pausado.');
      }
    });
    return () => { clearInterval(interval); window.removeEventListener('beforeunload', onClose); unsubscribe?.(); };
  }, []);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 6500); return () => clearTimeout(id); } }, [toast]);
  useEffect(() => {
    const timer = setInterval(() => setDate(prev => prev === dayKey(new Date(Date.now() - 60000)) ? dayKey() : prev), 30000);
    return () => clearInterval(timer);
  }, []);
  async function changeCompact(value) {
    try { await window.desktop?.compact(value); setCompact(value); }
    catch { setToast('Não foi possível mudar o tamanho da janela.'); }
  }
  const togglePlay = (plan, block) => { unlockAudio(); update(s => play(s, plan, block, date)); };
  function openBlockEditor(plan, block) {
    if (dataRef.current.active?.planId === plan.id && dataRef.current.active.blockId === block.id) update(s => pause(s));
    setBlockEditor({ planId: plan.id, block: structuredClone(block) });
  }
  function saveBlock(fields) {
    try { update(s => editBlock(s, blockEditor.planId, blockEditor.block.id, fields)); setBlockEditor(null); setToast('Bloco atualizado.'); }
    catch (error) { setToast(error.message); }
  }
  function openNotebook(planId, noteId = null) {
    setInitialNote(typeof noteId === 'string' ? noteId : null); setNotesPlan(planId);
  }
  async function installUpdate() {
    update(s => pause(s));
    if (!await persist(dataRef.current)) { setToast('Salve um backup antes de atualizar: a gravação local falhou.'); return; }
    await appUpdates.install();
  }
  function toggleDone(plan, block) {
    update(s => setManualDone(s, date, plan.id, block.id, !getRecord(s, date, plan.id, block.id).done));
  }
  function toggleReminder(note, seen) { update(s => ({ ...s, reminders: markReminder(s.reminders || [], note.id, date, seen) })); }
  function saveReminder(value) {
    update(s => ({ ...s, reminders: (s.reminders || []).some(note => note.id === value.id) ? s.reminders.map(note => note.id === value.id ? value : note) : [value, ...(s.reminders || [])] }));
    setReminderEditor(null);
  }
  function finishPlan(plan) {
    if (plan.completedAt) { update(s => setPlanCompleted(s, plan.id, false)); setToast('Plano reaberto. Ele voltou ao seu roteiro.'); return; }
    setConfirm({ title: 'Concluir este plano?', text: 'O plano sai do Meu dia e fica em Finalizados. Seu histórico e suas anotações continuam salvos.', action: () => { update(s => setPlanCompleted(s, plan.id, true)); setToast('Plano concluído. Seu progresso foi preservado.'); } });
  }
  function savePlan(plan) {
    update(s => {
      if (s.active?.planId === plan.id) s = { ...pause(s), active: null };
      return { ...s, plans: s.plans.some(p => p.id === plan.id) ? s.plans.map(p => p.id === plan.id ? plan : p) : [...s.plans, plan] };
    });
    setEditor(null); setToast('Plano salvo. Seu próximo passo já está organizado.');
    if (tutorial === 'creating') setTutorial('tips');
  }
  function finishTutorial() {
    update(s => ({ ...s, onboardingCompleted: true })); setTutorial(null);
  }
  function duplicate(plan) {
    const copy = { ...structuredClone(plan), id: uid(), name: `${plan.name} (cópia)`, completedAt: null, blocks: plan.blocks.map(b => ({ ...b, id: uid() })), notes: [] };
    update(s => ({ ...s, plans: [...s.plans, copy] })); setToast('Plano duplicado com uma nova sequência e caderno vazio.');
  }
  async function backup() {
    try {
      await persist(dataRef.current);
      if (window.desktop) { if (await window.desktop.exportData()) setToast('Backup exportado.'); }
      else { const url = URL.createObjectURL(new Blob([JSON.stringify(dataRef.current)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'organon-backup.json'; a.click(); URL.revokeObjectURL(url); }
    } catch (err) { setToast(`Erro ao exportar: ${err.message}`); }
  }
  async function importBackup(file) {
    try {
      const value = window.desktop ? await window.desktop.importData() : JSON.parse(await file.text());
      if (!value) return;
      const imported = validateData(value);
      setConfirm({ title: 'Restaurar este backup?', text: `${imported.plans.length} planos encontrados. Isso substituirá os dados atuais. Exporte um backup antes se quiser preservá-los.`, action: () => { update(imported); setSettings(false); setToast('Backup restaurado.'); } });
    } catch (err) { setToast(`Não foi possível importar: ${err.message}`); }
  }
  if (fatal) return <div className="fatal"><BookOpen size={40} /><h1>Seus dados precisam de atenção</h1><p>{fatal}</p><p>O arquivo original não foi alterado. Feche o app e confira compasso.json na pasta de dados do aplicativo.</p></div>;
  if (!data) return <div className="loading"><span className="brand-mark"><BookOpen /></span>Preparando seu espaço de estudos…</div>;
  const selectedDate = new Date(`${date}T12:00:00`);
  const summary = dailySummary(data, date);
  const todayPlans = summary.plans;
  const doneCount = summary.completed;
  const plannedMinutes = summary.studyMinutes;
  const active = data.active;
  const activePlan = active && data.plans.find(p => p.id === active.planId);
  const activeBlock = activePlan?.blocks.find(b => b.id === active.blockId);
  const statusOf = (plan) => {
    if (plan.blocks.length && plan.blocks.every(b => getRecord(data, date, plan.id, b.id).done)) return 'done';
    if (plan.blocks.some(b => { const r = getRecord(data, date, plan.id, b.id); return r.done || r.elapsedMs > 0; }) || (active?.date === date && active.planId === plan.id && active.running)) return 'progress';
    return 'pending';
  };
  const catalogPlans = data.plans.filter(plan => planFilter === 'all' || (planFilter === 'completed' ? !!plan.completedAt : !plan.completedAt));
  const shownPlans = todayPlans.filter(p => filter === 'all' || statusOf(p) === filter);
  if (compact) return <div className="compact-window">
    <div className="compact-title drag"><h2 title={active?.blockName}>{active?.blockName || 'Escolha uma aula'}</h2><div className="no-drag">{['available', 'ready'].includes(appUpdates.state.status) && <IconButton title="Atualização disponível" onClick={() => { changeCompact(false); appUpdates.show(); }}><Download size={13} /></IconButton>}<IconButton title="Voltar ao aplicativo" onClick={() => changeCompact(false)}><Expand size={13} /></IconButton><IconButton title="Fechar modo compacto e voltar" onClick={() => changeCompact(false)}><X size={14} /></IconButton></div></div>
    <div className="compact-content"><div className="compact-controls"><strong>{clock(active?.remainingMs || 0)}</strong><span className={`timer-status ${active?.running ? 'running' : ''}`}>{active?.remainingMs === 0 ? 'Concluído' : active?.running ? 'Em foco' : 'Pausado'}</span><div><IconButton title="Reiniciar cronômetro" disabled={!active} onClick={() => update(s => resetTimer(s))}><RotateCcw size={15} /></IconButton><button className="round-play" aria-label={active?.running ? 'Pausar' : 'Continuar'} disabled={!activeBlock} onClick={() => { unlockAudio(); update(s => active.running ? pause(s) : play(s, activePlan, activeBlock, active.date)); }}>{active?.running ? <Pause size={18} /> : <Play size={18} />}</button><CompactExtraTime disabled={!activeBlock || active?.type !== 'lesson'} onAdd={minutes => update(s => extendLesson(s, minutes))} /></div></div><div className="timer-track"><i style={{ width: `${active ? 100 * (1 - active.remainingMs / active.totalMs) : 0}%` }} /></div></div>
    {saveError && <span className="compact-error">Falha ao salvar — volte ao app e exporte um backup.</span>}
  </div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand drag organon-brand"><div><span className="organon-wordmark" role="img" aria-label="organon" style={{ maskImage: `url(${organonWordmark})` }} /><small className="app-version">v{appVersion}</small></div></div>
      <div className="workspace-label">MEU ESPAÇO</div>
      <nav>{[['today', LayoutDashboard, 'Meu dia'], ['plans', BookOpen, 'Planos de estudo'], ['metrics', TrendingUp, 'Meu progresso'], ['books', NotebookText, 'Cadernos'], ['notes', StickyNote, 'Notas']].map(([key, Icon, label]) => <button key={key} className={page === key ? 'nav-active' : ''} onClick={() => setPage(key)}><Icon size={19} />{label}{key === 'today' && <span className="nav-count">{todayPlans.length}</span>}</button>)}</nav>
      <div className="sidebar-plans"><div className="workspace-label">MEUS PLANOS <IconButton title="Criar plano" onClick={() => setEditor(newPlan())}><Plus size={15} /></IconButton></div>{data.plans.filter(plan => !plan.completedAt).map(plan => <button key={plan.id} onClick={() => openNotebook(plan.id)}><span className={`color-dot ${plan.color}`} style={dotStyle(plan.color)} /> <span>{plan.name}</span><ChevronRight size={13} /></button>)}{!data.plans.length && <small>Seu próximo objetivo começa aqui.</small>}</div>
      <div className="sidebar-bottom"><div className="local-badge"><span className="live-dot" /><span>{saveError ? 'Erro ao salvar' : 'Dados locais'}<small>{saveError ? 'Exporte um backup' : 'Salvos automaticamente'}</small></span></div><button className="settings-button" onClick={() => setSettings(true)}><Settings size={18} /> Preferências</button></div>
    </aside>
    <main>
      <header className="topbar drag"><div><span>Meu espaço</span><ChevronRight size={13} />{page === 'today' ? 'Meu dia' : page === 'plans' ? 'Planos de estudo' : page === 'books' ? 'Cadernos' : page === 'notes' ? 'Notas' : 'Meu progresso'}</div><div className="topbar-right no-drag"><IconButton title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</IconButton><span className="local-pill"><span className="live-dot" /> LOCAL</span><IconButton title={data.settings.sound ? 'Desativar som' : 'Ativar som'} onClick={() => { unlockAudio(); update(s => ({ ...s, settings: { ...s.settings, sound: !s.settings.sound } })); }}>{data.settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</IconButton><span className="window-separator" /><IconButton title="Minimizar janela" onClick={() => window.desktop?.minimize()}><Minus size={16} /></IconButton><IconButton title="Maximizar janela" onClick={() => window.desktop?.maximize()}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" stroke="currentColor" /></svg></IconButton><IconButton title="Fechar aplicativo" onClick={async () => { update(s => pause(s)); await persist(dataRef.current); window.desktop?.close(); }}><X size={17} /></IconButton></div></header>
      <div className="main-scroll"><div className="content">
        {!['books', 'notes'].includes(page) && <div className="page-heading"><h1>{page === 'today' ? 'Meu dia' : page === 'plans' ? 'Planos de estudo' : page === 'books' ? 'Cadernos' : page === 'notes' ? 'Notas' : 'Meu progresso'}</h1><button className="primary" onClick={() => setEditor(newPlan())}><Plus size={17} /> Novo plano</button></div>}
        {saveError && <div className="error-banner">{saveError}<button onClick={backup}>Exportar backup</button></div>}
        {page === 'today' && <>
          <section className="stats-grid"><Stat icon={Clock3} label="TEMPO DE FOCO" value={duration(focusMs(data, date, date))} detail={`${plannedMinutes} min de estudo planejados`} color="violet" /><Stat icon={CheckCheck} label="BLOCOS CONCLUÍDOS" value={<>{doneCount}<small> / {summary.total}</small></>}  color="green" /><Stat icon={Target} label="META DO DIA" value={`${summary.percent}%`}  color="orange" /></section>
          <DailyNotes notes={data.reminders || []} date={date} onSeen={toggleReminder} onEdit={setReminderEditor} onCreate={() => setReminderEditor(newReminder(date))} onManage={() => setPage('notes')} />
          <div className="section-heading"><div><h2>Seu roteiro <span>{todayPlans.length} planos</span></h2></div><div className="date-switch"><IconButton title="Dia anterior" onClick={() => { selectedDate.setDate(selectedDate.getDate() - 1); setDate(dayKey(selectedDate)); }}><ChevronLeft size={16} /></IconButton><button title="Voltar para hoje" onClick={() => setDate(dayKey())}><CalendarDays size={15} />{date === dayKey() ? 'Hoje, ' : ''}{selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}</button><IconButton title="Próximo dia" onClick={() => { selectedDate.setDate(selectedDate.getDate() + 1); setDate(dayKey(selectedDate)); }}><ChevronRight size={16} /></IconButton></div></div>
          <div className="filter-row"><div className="tabs">{[['all', 'Todos'], ['pending', 'Pendentes'], ['progress', 'Em progresso'], ['done', 'Concluídos']].map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}{key === 'all' && <span>{todayPlans.length}</span>}</button>)}</div></div>
          <div className="plan-list">{shownPlans.map(plan => <StudyCard key={plan.id} {...{ plan, data, date, status: statusOf(plan), togglePlay, toggleDone }} onEdit={() => setEditor(structuredClone(plan))} onEditBlock={block => openBlockEditor(plan, block)} onNotes={noteId => openNotebook(plan.id, noteId)} onDuplicate={() => duplicate(plan)} onComplete={() => finishPlan(plan)} />)}{!shownPlans.length && <Empty icon={CalendarDays} title={todayPlans.length ? 'Nenhum plano com esse status.' : 'Um dia livre no seu roteiro.'} text={todayPlans.length ? 'Experimente outro filtro para ver suas aulas.' : 'Você pode descansar ou ajustar os dias de um plano em “Planos de estudo”.'} />}</div>

        </>}
        {page === 'plans' && <><div className="section-heading"><h2>Seus planos <span>{catalogPlans.length}</span></h2><div className="view-switch" role="group" aria-label="Visualização dos planos"><IconButton title="Exibir em cards" aria-pressed={plansView === 'cards'} onClick={() => update(s => ({ ...s, settings: { ...s.settings, plansView: 'cards' } }))}><LayoutGrid size={16} /></IconButton><IconButton title="Exibir em lista" aria-pressed={plansView === 'list'} onClick={() => update(s => ({ ...s, settings: { ...s.settings, plansView: 'list' } }))}><List size={17} /></IconButton></div></div><div className="plan-status-filters"><div className="tabs" role="group" aria-label="Status dos planos">{[['active', 'Em andamento'], ['completed', 'Finalizados'], ['all', 'Todos']].map(([key, label]) => <button key={key} className={planFilter === key ? 'selected' : ''} aria-pressed={planFilter === key} onClick={() => setPlanFilter(key)}>{label}<span>{data.plans.filter(plan => key === 'all' || (key === 'completed' ? !!plan.completedAt : !plan.completedAt)).length}</span></button>)}</div></div>{!catalogPlans.length && <p className="plans-filter-empty">{planFilter === 'completed' ? 'Nenhum plano finalizado ainda.' : 'Nenhum plano em andamento.'}</p>}<div className={`plans-grid ${plansView === 'list' ? 'plans-list' : ''}`}>{catalogPlans.map(plan => <article className="overview-card" key={plan.id}><div className="overview-top"><PlanIcon plan={plan} /><IconButton title={`Editar ${plan.name}`} onClick={() => setEditor(structuredClone(plan))}><Pencil size={17} /></IconButton></div><h2>{plan.name}{plan.completedAt && <span className="plan-finished-label"><Check size={11} />Finalizado</span>}</h2><p>{plan.description || 'Um novo objetivo para conquistar.'}</p><div className="weekdays">{weekdayOrder.map(d => <span key={d} className={plan.days.includes(d) ? `on ${plan.color}` : ''} style={plan.days.includes(d) && plan.color.startsWith('#') ? { background: plan.color, color: customCoverStyle(plan.color)['--cover-ink'] } : undefined}>{days[d][0]}</span>)}</div><div className="overview-meta"><span><BookOpen size={14} />{plan.blocks.filter(b => b.type === 'lesson').length} aulas</span><span><Clock3 size={14} />{plan.blocks.reduce((s, b) => s + b.minutes, 0)} min com pausas</span></div><div className="overview-actions"><button aria-expanded={!!expandedNotes[plan.id]} onClick={() => plan.notes.length ? setExpandedNotes(s => ({ ...s, [plan.id]: !s[plan.id] })) : openNotebook(plan.id)}><NotebookText size={15} /> Anotações{plan.notes.length > 0 && <><span className="notes-count">{plan.notes.length}</span><ChevronRight size={12} className={expandedNotes[plan.id] ? 'notes-chevron expanded' : 'notes-chevron'} /></>}</button><IconButton title={`${plan.completedAt ? 'Reabrir' : 'Concluir'} plano ${plan.name}`} onClick={() => finishPlan(plan)}>{plan.completedAt ? <RotateCcw size={16} /> : <CheckCheck size={16} />}</IconButton><IconButton title={`Duplicar ${plan.name}`} onClick={() => duplicate(plan)}><Copy size={16} /></IconButton><IconButton title={`Excluir ${plan.name}`} onClick={() => setConfirm({ title: 'Excluir este plano?', text: `O plano “${plan.name}” e suas anotações serão removidos. As horas registradas serão mantidas no histórico.`, action: () => update(s => ({ ...pause(s), active: s.active?.planId === plan.id ? null : pause(s).active, plans: s.plans.filter(p => p.id !== plan.id) })) })}><Trash2 size={16} /></IconButton></div>{expandedNotes[plan.id] && plan.notes.length > 0 && <NotesPreview plan={plan} onOpen={noteId => openNotebook(plan.id, noteId)} />}</article>)}<button className="add-plan-card" onClick={() => setEditor(newPlan())}><span><Plus size={25} /></span><strong>Um novo objetivo</strong><small>Crie seu próximo plano de estudo</small></button></div></>}
        {page === 'metrics' && <Metrics data={data} onViewCompleted={() => { setPlanFilter('completed'); setPage('plans'); }} />}
        {page === 'notes' && <RemindersPage filter={notesFilter} onFilter={setNotesFilter} notes={data.reminders || []} date={date} onEdit={setReminderEditor} onCreate={() => setReminderEditor(newReminder(date))} onSeen={toggleReminder} onDelete={id => update(s => ({ ...s, reminders: s.reminders.filter(note => note.id !== id) }))} Modal={Modal} />}
        {page === 'books' && <Library notebooks={data.notebooks || []} onChange={change => update(s => ({ ...s, notebooks: typeof change === 'function' ? change(s.notebooks || []) : change }))} notify={setToast} saveError={saveError} Modal={Modal} Sketch={Sketch} />}

      </div></div>
      {active && activePlan && <div className="bottom-player"><div className="player-info"><PlanIcon plan={activePlan} size={18} /><div><small>{active.planName} <span>• {active.type === 'break' ? 'DESCANSO' : 'EM FOCO'}</span></small><strong>{active.blockName}</strong></div></div><div className="player-middle"><IconButton title="Reiniciar cronômetro" onClick={() => setConfirm({ title: 'Reiniciar este cronômetro?', text: 'O contador volta à duração inicial. O tempo já estudado continua no histórico.', action: () => update(s => resetTimer(s)) })}><RotateCcw size={16} /></IconButton><button className="round-play" aria-label={active.running ? 'Pausar aula' : 'Continuar aula'} onClick={() => { unlockAudio(); update(s => active.running ? pause(s) : play(s, activePlan, activeBlock, active.date)); }}>{active.running ? <Pause size={18} /> : <Play size={18} />}</button><strong className="player-time">{clock(active.remainingMs)}<small> / {clock(active.totalMs)}</small></strong><span className="player-state">{!active.remainingMs ? 'Concluído' : active.running ? 'Concentre-se no agora' : 'Pausado'}</span></div><button className="compact-button" aria-label="Modo compacto" title="Modo compacto" onClick={() => changeCompact(true)}><PanelTopClose size={15} /></button><div className="bottom-progress" style={{ width: `${100 * (1 - active.remainingMs / active.totalMs)}%` }} /></div>}
    </main>
    {blockEditor && <BlockEditor block={blockEditor.block} onClose={() => setBlockEditor(null)} onSave={saveBlock} />}
    {editor && <PlanEditor plan={editor} firstRun={tutorial === 'creating'} onClose={() => { setEditor(null); if (tutorial === 'creating') setTutorial('welcome'); }} onSave={savePlan} />}
    {['welcome', 'tips'].includes(tutorial) && <Tutorial stage={tutorial} Modal={Modal} onStart={() => { setTutorial('creating'); setEditor(firstPlan()); }} onClose={finishTutorial} onDone={() => { finishTutorial(); setPage('plans'); }} />}
    {reminderEditor && <ReminderEditor key={reminderEditor.id} value={reminderEditor} onClose={() => setReminderEditor(null)} onSave={saveReminder} Modal={Modal} />}
    {notesPlan && data.plans.some(p => p.id === notesPlan) && <Notebook key={notesPlan} plan={data.plans.find(p => p.id === notesPlan)} date={date} initialNote={initialNote} saveError={saveError} onClose={() => setNotesPlan(null)} onChange={change => update(s => ({ ...s, plans: s.plans.map(p => p.id === notesPlan ? typeof change === 'function' ? change(p) : change : p) }))} notify={setToast} Modal={Modal} Sketch={Sketch} />}
    {settings && <Preferences settings={data.settings} onChange={fields => { unlockAudio(); update(s => ({ ...s, settings: { ...s.settings, ...fields } })); }} onClose={() => setSettings(false)} onTestSound={ring} onBackup={backup} onImport={importBackup} onTutorial={() => { setSettings(false); setTutorial('tips'); }} updates={appUpdates} Modal={Modal} />}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)} small><p className="confirm-text">{confirm.text}</p><div className="modal-actions"><button className="secondary" onClick={() => setConfirm(null)}>Cancelar</button><button className="primary" onClick={() => { confirm.action(); setConfirm(null); }}>Confirmar</button></div></Modal>}
    {appUpdates.open && <UpdateDialog updates={appUpdates} onInstall={installUpdate} Modal={Modal} />}
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><IconButton title="Fechar aviso" onClick={() => setToast('')}><X size={16} /></IconButton></div>}
  </div>;
}

function Stat({ icon: Icon, label, value, detail, color }) { return <article className="stat-card"><div><span className="stat-label">{label}</span><span className={`stat-icon ${color}`}><Icon size={18} /></span></div><strong>{value}</strong>{detail && <p>{detail}</p>}</article>; }
function Empty({ icon: Icon, title, text }) { return <div className="empty"><Icon size={29} /><h3>{title}</h3><p>{text}</p></div>; }
function StudyCard({ plan, data, date, status, togglePlay, toggleDone, onEdit, onEditBlock, onNotes, onDuplicate, onComplete }) {
  const [menu, setMenu] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const done = plan.blocks.filter(b => getRecord(data, date, plan.id, b.id).done).length;
  return <article className={`study-card accent-${plan.color} ${plan.color.startsWith('#') ? 'custom-plan-accent' : ''}`} style={planAccent(plan)}><div className="study-card-header"><PlanIcon plan={plan} /><div className="card-heading"><div><h3>{plan.name}</h3><span className={`status ${status}`}>{status === 'progress' && <i />}{status === 'done' ? 'Concluído' : status === 'progress' ? 'Em progresso' : 'Pendente'}</span></div><p><span>{plan.days.length === 5 && [1, 2, 3, 4, 5].every(d => plan.days.includes(d)) ? 'Segunda a sexta' : weekdayOrder.filter(d => plan.days.includes(d)).map(d => days[d]).join(', ')}</span><span>·</span><Clock3 size={12} />{plan.blocks.reduce((s, b) => s + b.minutes, 0)} min<span>·</span>{plan.blocks.filter(b => b.type === 'lesson').length} aulas</p></div><button className="notes-link" aria-expanded={notesExpanded} onClick={() => plan.notes.length ? setNotesExpanded(!notesExpanded) : onNotes()}><NotebookText size={15} /> Anotações <span>{plan.notes.length || ''}</span>{plan.notes.length > 0 && <ChevronRight size={12} className={notesExpanded ? 'notes-chevron expanded' : 'notes-chevron'} />}</button><div className="menu-container"><IconButton title={`Opções de ${plan.name}`} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></IconButton>{menu && <><button className="menu-backdrop" aria-label="Fechar opções" onClick={() => setMenu(false)} /><div className="dropdown"><button onClick={() => { onEdit(); setMenu(false); }}><Pencil size={15} /> Editar plano</button><button onClick={() => { onDuplicate(); setMenu(false); }}><Copy size={15} /> Duplicar plano</button><button onClick={() => { onComplete(); setMenu(false); }}><CheckCheck size={15} /> Concluir plano</button></div></>}</div></div>
    <div className="block-list">{plan.blocks.map((block, index) => {
      const rec = getRecord(data, date, plan.id, block.id);
      const isActive = data.active?.date === date && data.active.planId === plan.id && data.active.blockId === block.id;
      const running = isActive && data.active.running;
      return <div className={`study-block ${block.type} ${rec.done ? 'is-done' : ''} ${isActive && !rec.done ? 'is-active' : ''}`} key={block.id}><span className="block-number">{String(index + 1).padStart(2, '0')}</span><span className="block-type">{block.type === 'break' ? <Coffee size={16} /> : <BookOpen size={16} />}</span><div className="block-name"><strong>{block.name}</strong></div><span className="block-duration">{isActive && data.active.remainingMs > 0 ? clock(data.active.remainingMs) : `${block.minutes} min`}</span><IconButton title={`Editar ${block.name}`} onClick={() => onEditBlock(block)}><Pencil size={14} /></IconButton><button className={`block-play ${running ? 'playing' : ''}`} aria-label={`${running ? 'Pausar' : 'Iniciar'} ${block.name}`} onClick={() => togglePlay(plan, block)}>{running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button className={`checkbox ${rec.done ? 'checked' : ''}`} role="checkbox" aria-checked={rec.done} aria-label={`Concluir ${block.name}`} onClick={() => toggleDone(plan, block)}>{rec.done && <Check size={13} strokeWidth={3} />}</button></div>;
    })}</div>{notesExpanded && plan.notes.length > 0 && <NotesPreview plan={plan} onOpen={onNotes} />}<div className="card-footer"><span>{done} de {plan.blocks.length} blocos concluídos</span><div className="mini-progress"><i style={{ width: `${plan.blocks.length ? done / plan.blocks.length * 100 : 0}%` }} /></div><span>{Math.round(plan.blocks.length ? done / plan.blocks.length * 100 : 0)}%</span></div>
  </article>;
}

function Modal({ title, subtitle, onClose, children, small, wide, className = '', actions }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = e => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = [...ref.current.querySelectorAll('button:not(:disabled), input, textarea, select, [tabindex="0"], [contenteditable="true"]')].filter(el => el.offsetParent !== null);
        const first = items[0]; const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={ref} className={`modal ${small ? 'small' : ''} ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="modal-heading-actions">{actions}<IconButton title="Fechar" onClick={onClose}><X size={20} /></IconButton></div></div>{children}</section></div>;
}
function BlockEditor({ block, onClose, onSave }) {
  const [name, setName] = useState(block.name);
  const [minutes, setMinutes] = useState(block.minutes);
  return <Modal title={block.type === 'break' ? 'Editar descanso' : 'Editar aula'} onClose={onClose} small><form className="editor-form block-editor-form" onSubmit={e => { e.preventDefault(); onSave({ name, minutes }); }}><label>Nome<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>Duração (minutos)<input type="number" min="1" max="360" step="1" required value={minutes} onChange={e => setMinutes(e.target.value)} /></label><p className="muted">O tempo já estudado é mantido. A aula em andamento fica pausada.</p><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar alteração</button></div></form></Modal>;
}

function PlanEditor({ plan, onClose, onSave, firstRun }) {
  const [draft, setDraft] = useState(() => ({ ...structuredClone(plan), icon: planIconKey(plan) }));
  const [dragged, setDragged] = useState(null);
  const [error, setError] = useState('');
  function changeBlock(id, fields) { setDraft(s => ({ ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, ...fields } : b) })); }
  function move(from, to) { if (to < 0 || to >= draft.blocks.length || from === to) return; setDraft(s => { const blocks = [...s.blocks]; const [block] = blocks.splice(from, 1); blocks.splice(to, 0, block); return { ...s, blocks }; }); }
  function save(e) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.days.length || !draft.blocks.some(b => b.type === 'lesson') || draft.blocks.some(b => !b.name.trim() || !Number.isFinite(+b.minutes) || +b.minutes < 1 || +b.minutes > 360)) { setError('Defina um nome, pelo menos um dia e uma aula. Os blocos precisam de nome e duração entre 1 e 360 minutos.'); return; }
    onSave({ ...draft, name: draft.name.trim(), blocks: draft.blocks.map(b => ({ ...b, name: b.name.trim(), minutes: +b.minutes })) });
  }
  return <Modal title={firstRun ? 'Criar seu primeiro plano' : plan.name ? 'Editar plano de estudo' : 'Um novo plano de estudo'} subtitle={firstRun ? 'Ajuste o nome, os dias e a duração das aulas abaixo.' : 'Transforme o seu objetivo em pequenos passos.'} onClose={onClose} wide><form onSubmit={save} className="editor-form"><div className="form-two"><label>Nome do plano<input autoFocus value={draft.name} maxLength={80} placeholder="Ex.: Infraestrutura" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className="plan-appearance"><CoverPicker Modal={Modal} context="plano" icon={draft.icon} color={draft.color} onChange={changes => setDraft(current => ({ ...current, ...changes }))} /></div></div><label>Uma intenção para este plano <span className="optional">opcional</span><input value={draft.description} maxLength={160} placeholder="O que você quer conquistar?" onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label>Dias de estudo</label><div className="day-picker">{weekdayOrder.map(d => <button type="button" key={d} className={draft.days.includes(d) ? 'on' : ''} onClick={() => setDraft({ ...draft, days: draft.days.includes(d) ? draft.days.filter(day => day !== d) : [...draft.days, d] })}>{days[d]}{draft.days.includes(d) && <Check size={12} />}</button>)}</div><div className="editor-section"><div><h3>Sua sequência de estudo</h3><p>Arraste os blocos ou use as setas para mudar a ordem.</p></div><span>{draft.blocks.reduce((s, b) => s + (+b.minutes || 0), 0)} min no total</span></div><div className="editor-blocks">{draft.blocks.map((block, i) => <div key={block.id} className={`editor-block ${block.type} ${dragged === i ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => { e.preventDefault(); const source = Number(e.dataTransfer.getData('text/plain')); if (dragged !== null && Number.isInteger(source)) move(source, i); setDragged(null); }}><button type="button" className="block-drag-handle" draggable aria-label={`Arrastar bloco ${i + 1}`} title="Arraste por esta alça; as setas também mudam a ordem" onDragStart={e => { setDragged(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }} onDragEnd={() => setDragged(null)} onKeyDown={e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); move(i, i + (e.key === 'ArrowUp' ? -1 : 1)); } }}><GripVertical size={17} className="grip" /></button><span className={`editor-type ${block.type}`}>{block.type === 'break' ? <Coffee size={17} /> : <BookOpen size={17} />}</span><label className="block-edit-name"><span>{block.type === 'break' ? 'DESCANSO' : 'AULA'}</span><input aria-label={`Nome do bloco ${i + 1}`} value={block.name} maxLength={120} onChange={e => changeBlock(block.id, { name: e.target.value })} /></label><label className="minutes-input"><input aria-label={`Minutos do bloco ${i + 1}`} type="number" min="1" max="360" value={block.minutes} onChange={e => changeBlock(block.id, { minutes: e.target.value })} /><span>min</span></label><div className="reorder"><IconButton type="button" title={`Mover bloco ${i + 1} para cima`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></IconButton><IconButton type="button" title={`Mover bloco ${i + 1} para baixo`} disabled={i === draft.blocks.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></IconButton></div><IconButton type="button" title={`Remover bloco ${i + 1}`} onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter(b => b.id !== block.id) })}><X size={16} /></IconButton></div>)}</div><div className="button-row"><button type="button" className="secondary" draggable onDragStart={e => e.dataTransfer.setData('application/compasso-block', 'lesson')} onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, newBlock()] })}><Plus size={15} /><BookOpen size={15} /> Adicionar aula</button><button type="button" className="secondary" draggable onDragStart={e => e.dataTransfer.setData('application/compasso-block', 'break')} onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, newBlock('break')] })}><Plus size={15} /><Coffee size={15} /> Adicionar descanso</button></div><div className="block-drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const type = e.dataTransfer.getData('application/compasso-block'); if (['lesson', 'break'].includes(type)) setDraft({ ...draft, blocks: [...draft.blocks, newBlock(type)] }); }}>Você também pode arrastar os botões acima para cá.</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit"><Check size={16} /> Salvar plano</button></div></form></Modal>;
}

function Sketch({ onClose, onSave }) {
  const canvas = useRef(); const drawing = useRef(false); const [color, setColor] = useState('#6356ce');
  useEffect(() => { const ctx = canvas.current.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 420); }, []);
  function point(e) { const rect = canvas.current.getBoundingClientRect(); return [(e.clientX - rect.left) * 800 / rect.width, (e.clientY - rect.top) * 420 / rect.height]; }
  return <div className="sketch-overlay"><div className="sketch-panel"><h3>Uma ideia em traços</h3><canvas ref={canvas} width="800" height="420" onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...point(e)); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; }} onPointerMove={e => { if (drawing.current) { const ctx = canvas.current.getContext('2d'); ctx.lineTo(...point(e)); ctx.stroke(); } }} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} /><div className="button-row"><input type="color" aria-label="Cor da caneta" value={color} onChange={e => setColor(e.target.value)} /><button className="secondary" onClick={() => { const ctx = canvas.current.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 420); }}>Limpar</button><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={() => onSave(canvas.current.toDataURL('image/png'))}>Guardar no caderno</button></div></div></div>;
}

function Metrics({ data, onViewCompleted }) {
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);
  const end = new Date();
  let start;
  if (period === 'week') { end.setDate(end.getDate() - (end.getDay() + 6) % 7 + offset * 7); start = new Date(end); end.setDate(end.getDate() + 6); }
  else { end.setMonth(end.getMonth() + offset, 1); start = new Date(end); end.setMonth(end.getMonth() + 1, 0); }
  const from = dayKey(start); const to = dayKey(end);
  const finishedPlans = completedPlanSummary(data.plans, from, to);
  const entries = Object.entries(data.records).filter(([k]) => k.split('|')[0] >= from && k.split('|')[0] <= to);
  const total = focusMs(data, from, to);
  const studyDays = new Set(entries.filter(([, r]) => r.type !== 'break' && r.elapsedMs > 0).map(([k]) => k.split('|')[0])).size;
  const completed = entries.filter(([, r]) => r.type !== 'break' && r.done).length;
  const bars = []; const cursor = new Date(start);
  while (dayKey(cursor) <= to) { const key = dayKey(cursor); bars.push({ date: key, label: period === 'week' ? days[cursor.getDay()] : String(cursor.getDate()), ms: focusMs(data, key, key) }); cursor.setDate(cursor.getDate() + 1); }
  const max = Math.max(3600000, ...bars.map(b => b.ms));
  const planTotals = {};
  for (const [key, r] of entries) { if (r.type === 'break') continue; const id = key.split('|')[1]; const p = data.plans.find(p => p.id === id); planTotals[id] ||= { name: p?.name || r.planName || 'Plano removido', color: p?.color || 'violet', ms: 0, done: 0 }; planTotals[id].ms += r.elapsedMs; if (r.done) planTotals[id].done++; }
  return <><div className="metrics-period"><div className="tabs">{[['week', 'Semanal'], ['month', 'Mensal']].map(([key, label]) => <button key={key} className={period === key ? 'selected' : ''} onClick={() => { setPeriod(key); setOffset(0); }}>{label}</button>)}</div><div className="date-switch"><IconButton title="Período anterior" onClick={() => setOffset(offset - 1)}><ChevronLeft size={16} /></IconButton><span>{start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — {end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span><IconButton title="Próximo período" onClick={() => setOffset(offset + 1)}><ChevronRight size={16} /></IconButton></div></div><section className="stats-grid metrics-stats"><Stat icon={Clock3} color="violet" label="TEMPO DE ESTUDO" value={duration(total)} detail="Pausas e descansos não entram na conta" /><Stat icon={Flame} color="orange" label="DIAS COM ESTUDO" value={studyDays} detail={`${completed} aulas concluídas no período`} /><Stat icon={TrendingUp} color="green" label="MÉDIA POR DIA ATIVO" value={duration(studyDays ? total / studyDays : 0)} detail="Tempo de foco dividido pelos dias estudados" /><Stat icon={CheckCheck} color="green" label="PLANOS CONCLUÍDOS" value={finishedPlans.inPeriod.length} detail={`${finishedPlans.total} no total`} /></section>{!!finishedPlans.inPeriod.length && <section className="completed-plan-list"><div><h2>Planos concluídos neste período</h2><button onClick={onViewCompleted}>Ver finalizados</button></div><ul>{finishedPlans.inPeriod.map(plan => <li key={plan.id}><PlanIcon plan={plan} size={15} /><span>{plan.name}</span><span>{new Date(`${plan.completedAt}T12:00:00`).toLocaleDateString('pt-BR')}</span></li>)}</ul></section>}<section className="chart-card"><div><h2>Seu ritmo ao longo dos dias</h2><span><i className="color-dot violet" /> Tempo de estudo</span></div><div className="chart"><div className="chart-y"><span>{Math.round(max / 60000)} min</span><span>{Math.round(max / 120000)} min</span><span>0 min</span></div><div className="chart-bars">{bars.map(b => <div className={`chart-column ${b.date === dayKey() ? 'today' : ''}`} key={b.date} title={`${b.date}: ${duration(b.ms)}`}><div className="bar-space"><div className="bar" style={{ height: `${b.ms / max * 100}%`, minHeight: b.ms ? 4 : 0 }} /></div><span>{b.label}</span></div>)}</div></div>{!total && <p className="chart-empty">Seu gráfico começa no primeiro play. Vamos dar esse passo?</p>}</section><section className="history-card"><h2>Por plano de estudo</h2><table><thead><tr><th>Plano</th><th>Tempo de foco</th><th>Aulas concluídas</th><th>Participação</th></tr></thead><tbody>{Object.entries(planTotals).map(([id, p]) => <tr key={id}><td><span className={`color-dot ${p.color}`} style={dotStyle(p.color)} />{p.name}</td><td>{duration(p.ms)}</td><td>{p.done}</td><td>{total ? Math.round(p.ms / total * 100) : 0}%</td></tr>)}</tbody></table>{!entries.length && <p className="muted history-empty">Ainda não há registros neste período.</p>}<p className="metrics-help">O tempo reúne o cronômetro e os registros manuais habilitados nas preferências. Descansos não contam como foco.</p></section></>;
}
