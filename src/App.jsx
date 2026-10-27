import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, Coffee, Copy, Download, Expand, Flame, GripVertical, LayoutDashboard, ListFilter, Maximize2, Minus, MoreHorizontal, Moon, Sun, Pause, Pencil, Play, Plus, RotateCcw, Settings, Sparkles, Target, Trash2, TrendingUp, Upload, Volume2, VolumeX, X, ImagePlus, PenLine, PanelTopClose } from 'lucide-react';
import { clock, colors, dayKey, days, duration, editBlock, focusMs, getRecord, newBlock, newPlan, pause, play, preferences, recordKey, resetTimer, seed, setDone, tick, uid, validateData } from './model.js';
import { UpdateDialog, UpdateSettings, useAppUpdates } from './Updates.jsx';

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
function PlanIcon({ plan, size = 21 }) { const Icon = plan.color === 'blue' ? Target : plan.color === 'orange' ? BookOpen : plan.color === 'green' ? Flame : Sparkles; return <span className={`plan-icon ${plan.color}`}><Icon size={size} /></span>; }
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

export default function App() {
  const [data, setData] = useState(null);
  const dataRef = useRef(null);
  const [fatal, setFatal] = useState('');
  const [page, setPage] = useState('today');
  const [date, setDate] = useState(dayKey());
  const [filter, setFilter] = useState('all');
  const [compact, setCompact] = useState(false);
  const [editor, setEditor] = useState(null);
  const [blockEditor, setBlockEditor] = useState(null);
  const [notesPlan, setNotesPlan] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [saveError, setSaveError] = useState('');
  const [settings, setSettings] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const saveQueue = useRef(Promise.resolve());
  const initialized = useRef(false);
  const checkpoint = useRef({ at: 0, data: null });
  const appUpdates = useAppUpdates(!!data);
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
        // Closing the app pauses the session: time away is never credited as study.
        if (next.active) next.active = { ...next.active, running: false, startedAt: Date.now() };
        update(next); initialized.current = true;
      } catch (err) { setFatal(err.message); }
    })();
  }, []);
  useEffect(() => {
    if (!data || !initialized.current) return;
    const previous = checkpoint.current.data;
    const timerOnly = data.active?.running && previous?.active?.running
      && previous.plans === data.plans && previous.settings === data.settings
      && previous.active.planId === data.active.planId && previous.active.blockId === data.active.blockId;
    if (timerOnly && Date.now() - checkpoint.current.at < 5000) return;
    checkpoint.current = { at: Date.now(), data };
    persist(data);
  }, [data]);
  const theme = data?.settings?.theme || 'dark';
  const density = data?.settings?.density || 'compact';
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.desktop?.appearance(theme).then(result => {
      document.documentElement.dataset.glass = result?.glass ? 'native' : 'fallback';
    }).catch(() => { document.documentElement.dataset.glass = 'fallback'; });
  }, [theme]);
  const toggleTheme = () => update(s => ({ ...s, settings: { ...s.settings, theme: theme === 'dark' ? 'light' : 'dark' } }));
  useEffect(() => {
    const interval = setInterval(() => {
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
  async function installUpdate() {
    update(s => pause(s));
    if (!await persist(dataRef.current)) { setToast('Salve um backup antes de atualizar: a gravação local falhou.'); return; }
    await appUpdates.install();
  }
  function toggleDone(plan, block) {
    update(s => {
      if (s.active?.planId === plan.id && s.active?.blockId === block.id && s.active.date === date) s = pause(s);
      return setDone(s, date, plan.id, block.id, !getRecord(s, date, plan.id, block.id).done);
    });
  }
  function savePlan(plan) {
    update(s => {
      if (s.active?.planId === plan.id) s = { ...pause(s), active: null };
      return { ...s, plans: s.plans.some(p => p.id === plan.id) ? s.plans.map(p => p.id === plan.id ? plan : p) : [...s.plans, plan] };
    });
    setEditor(null); setToast('Plano salvo. Seu próximo passo já está organizado.');
  }
  function duplicate(plan) {
    const copy = { ...structuredClone(plan), id: uid(), name: `${plan.name} (cópia)`, blocks: plan.blocks.map(b => ({ ...b, id: uid() })), notes: [] };
    update(s => ({ ...s, plans: [...s.plans, copy] })); setToast('Plano duplicado com uma nova sequência e caderno vazio.');
  }
  async function backup() {
    try {
      await persist(dataRef.current);
      if (window.desktop) { if (await window.desktop.exportData()) setToast('Backup exportado.'); }
      else { const url = URL.createObjectURL(new Blob([JSON.stringify(dataRef.current)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'compasso-backup.json'; a.click(); URL.revokeObjectURL(url); }
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
  const todayPlans = data.plans.filter(p => p.days.includes(selectedDate.getDay()));
  const allLessons = todayPlans.flatMap(p => p.blocks.filter(b => b.type === 'lesson').map(b => ({ plan: p, block: b })));
  const doneCount = allLessons.filter(({ plan, block }) => getRecord(data, date, plan.id, block.id).done).length;
  const plannedMinutes = allLessons.reduce((sum, x) => sum + x.block.minutes, 0);
  const active = data.active;
  const activePlan = active && data.plans.find(p => p.id === active.planId);
  const activeBlock = activePlan?.blocks.find(b => b.id === active.blockId);
  const statusOf = (plan) => {
    const lessons = plan.blocks.filter(b => b.type === 'lesson');
    if (lessons.length && lessons.every(b => getRecord(data, date, plan.id, b.id).done)) return 'done';
    if (plan.blocks.some(b => { const r = getRecord(data, date, plan.id, b.id); return r.done || r.elapsedMs > 0; }) || (active?.date === date && active.planId === plan.id && active.running)) return 'progress';
    return 'pending';
  };
  const shownPlans = todayPlans.filter(p => filter === 'all' || statusOf(p) === filter);
  if (compact) return <div className="compact-window">
    <div className="compact-title drag"><h2 title={active?.blockName}>{active?.blockName || 'Escolha uma aula'}</h2><div className="no-drag">{['available', 'ready'].includes(appUpdates.state.status) && <IconButton title="Atualização disponível" onClick={() => { changeCompact(false); appUpdates.show(); }}><Download size={13} /></IconButton>}<IconButton title="Voltar ao aplicativo" onClick={() => changeCompact(false)}><Expand size={13} /></IconButton><IconButton title="Fechar modo compacto e voltar" onClick={() => changeCompact(false)}><X size={14} /></IconButton></div></div>
    <div className="compact-content"><div className="compact-controls"><strong>{clock(active?.remainingMs || 0)}</strong><span className={`timer-status ${active?.running ? 'running' : ''}`}>{active?.remainingMs === 0 ? 'Concluído' : active?.running ? 'Em foco' : 'Pausado'}</span><div><IconButton title="Reiniciar cronômetro" disabled={!active} onClick={() => update(s => resetTimer(s))}><RotateCcw size={15} /></IconButton><button className="round-play" aria-label={active?.running ? 'Pausar' : 'Continuar'} disabled={!activeBlock} onClick={() => { unlockAudio(); update(s => active.running ? pause(s) : play(s, activePlan, activeBlock, active.date)); }}>{active?.running ? <Pause size={18} /> : <Play size={18} />}</button></div></div><div className="timer-track"><i style={{ width: `${active ? 100 * (1 - active.remainingMs / active.totalMs) : 0}%` }} /></div></div>
    {saveError && <span className="compact-error">Falha ao salvar — volte ao app e exporte um backup.</span>}
  </div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand drag"><span className="brand-mark"><BookOpen size={21} /></span><div>compasso</div></div>
      <div className="workspace-label">MEU ESPAÇO</div>
      <nav>{[['today', LayoutDashboard, 'Meu dia'], ['plans', BookOpen, 'Planos de estudo'], ['metrics', TrendingUp, 'Meu progresso']].map(([key, Icon, label]) => <button key={key} className={page === key ? 'nav-active' : ''} onClick={() => setPage(key)}><Icon size={19} />{label}{key === 'today' && <span className="nav-count">{todayPlans.length}</span>}</button>)}</nav>
      <div className="sidebar-plans"><div className="workspace-label">MEUS PLANOS <IconButton title="Criar plano" onClick={() => setEditor(newPlan())}><Plus size={15} /></IconButton></div>{data.plans.map(plan => <button key={plan.id} onClick={() => setNotesPlan(plan.id)}><span className={`color-dot ${plan.color}`} /> <span>{plan.name}</span><ChevronRight size={13} /></button>)}{!data.plans.length && <small>Seu próximo objetivo começa aqui.</small>}</div>
      <div className="sidebar-bottom"><div className="local-badge"><span className="live-dot" /><span>{saveError ? 'Erro ao salvar' : 'Dados locais'}<small>{saveError ? 'Exporte um backup' : 'Salvos automaticamente'}</small></span></div><button className="settings-button" onClick={() => setSettings(true)}><Settings size={18} /> Preferências</button></div>
    </aside>
    <main>
      <header className="topbar drag"><div><span>Meu espaço</span><ChevronRight size={13} />{page === 'today' ? 'Meu dia' : page === 'plans' ? 'Planos de estudo' : 'Meu progresso'}</div><div className="topbar-right no-drag"><IconButton title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</IconButton><span className="local-pill"><span className="live-dot" /> LOCAL</span><IconButton title={data.settings.sound ? 'Desativar som' : 'Ativar som'} onClick={() => { unlockAudio(); update(s => ({ ...s, settings: { ...s.settings, sound: !s.settings.sound } })); }}>{data.settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</IconButton><span className="window-separator" /><IconButton title="Minimizar janela" onClick={() => window.desktop?.minimize()}><Minus size={16} /></IconButton><IconButton title="Maximizar janela" onClick={() => window.desktop?.maximize()}><Maximize2 size={14} /></IconButton><IconButton title="Fechar aplicativo" onClick={async () => { update(s => pause(s)); await persist(dataRef.current); window.desktop?.close(); }}><X size={17} /></IconButton></div></header>
      <div className="main-scroll"><div className="content">
        <div className="page-heading"><h1>{page === 'today' ? 'Meu dia' : page === 'plans' ? 'Planos de estudo' : 'Meu progresso'}</h1><button className="primary" onClick={() => setEditor(newPlan())}><Plus size={17} /> Novo plano</button></div>
        {saveError && <div className="error-banner">{saveError}<button onClick={backup}>Exportar backup</button></div>}
        {page === 'today' && <>
          <section className="stats-grid"><Stat icon={Clock3} label="TEMPO DE FOCO" value={duration(focusMs(data, date, date))} detail={`${plannedMinutes} min planejados`} color="violet" /><Stat icon={CheckCheck} label="AULAS CONCLUÍDAS" value={<>{doneCount}<small> / {allLessons.length}</small></>}  color="green" /><Stat icon={Target} label="META DO DIA" value={`${allLessons.length ? Math.round(doneCount / allLessons.length * 100) : 0}%`}  color="orange" /></section>
          <div className="section-heading"><div><h2>Seu roteiro <span>{todayPlans.length} planos</span></h2></div><div className="date-switch"><IconButton title="Dia anterior" onClick={() => { selectedDate.setDate(selectedDate.getDate() - 1); setDate(dayKey(selectedDate)); }}><ChevronLeft size={16} /></IconButton><button title="Voltar para hoje" onClick={() => setDate(dayKey())}><CalendarDays size={15} />{date === dayKey() ? 'Hoje, ' : ''}{selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}</button><IconButton title="Próximo dia" onClick={() => { selectedDate.setDate(selectedDate.getDate() + 1); setDate(dayKey(selectedDate)); }}><ChevronRight size={16} /></IconButton></div></div>
          <div className="filter-row"><div className="tabs">{[['all', 'Todos'], ['pending', 'Pendentes'], ['progress', 'Em progresso'], ['done', 'Concluídos']].map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}{key === 'all' && <span>{todayPlans.length}</span>}</button>)}</div></div>
          <div className="plan-list">{shownPlans.map(plan => <StudyCard key={plan.id} {...{ plan, data, date, status: statusOf(plan), togglePlay, toggleDone }} onEdit={() => setEditor(structuredClone(plan))} onEditBlock={block => openBlockEditor(plan, block)} onNotes={() => setNotesPlan(plan.id)} onDuplicate={() => duplicate(plan)} />)}{!shownPlans.length && <Empty icon={CalendarDays} title={todayPlans.length ? 'Nenhum plano com esse status.' : 'Um dia livre no seu roteiro.'} text={todayPlans.length ? 'Experimente outro filtro para ver suas aulas.' : 'Você pode descansar ou ajustar os dias de um plano em “Planos de estudo”.'} />}</div>

        </>}
        {page === 'plans' && <><div className="section-heading"><h2>Seus planos <span>{data.plans.length}</span></h2></div><div className="plans-grid">{data.plans.map(plan => <article className="overview-card" key={plan.id}><div className="overview-top"><PlanIcon plan={plan} /><IconButton title={`Editar ${plan.name}`} onClick={() => setEditor(structuredClone(plan))}><Pencil size={17} /></IconButton></div><h2>{plan.name}</h2><p>{plan.description || 'Um novo objetivo para conquistar.'}</p><div className="weekdays">{weekdayOrder.map(d => <span key={d} className={plan.days.includes(d) ? `on ${plan.color}` : ''}>{days[d][0]}</span>)}</div><div className="overview-meta"><span><BookOpen size={14} />{plan.blocks.filter(b => b.type === 'lesson').length} aulas</span><span><Clock3 size={14} />{plan.blocks.reduce((s, b) => s + b.minutes, 0)} min com pausas</span></div><div className="overview-actions"><button onClick={() => setNotesPlan(plan.id)}><PenLine size={15} /> Anotações</button><IconButton title={`Duplicar ${plan.name}`} onClick={() => duplicate(plan)}><Copy size={16} /></IconButton><IconButton title={`Excluir ${plan.name}`} onClick={() => setConfirm({ title: 'Excluir este plano?', text: `O plano “${plan.name}” e suas anotações serão removidos. As horas registradas serão mantidas no histórico.`, action: () => update(s => ({ ...pause(s), active: s.active?.planId === plan.id ? null : pause(s).active, plans: s.plans.filter(p => p.id !== plan.id) })) })}><Trash2 size={16} /></IconButton></div></article>)}<button className="add-plan-card" onClick={() => setEditor(newPlan())}><span><Plus size={25} /></span><strong>Um novo objetivo</strong><small>Crie seu próximo plano de estudo</small></button></div></>}
        {page === 'metrics' && <Metrics data={data} />}

      </div></div>
      {active && activePlan && <div className="bottom-player"><div className="player-info"><PlanIcon plan={activePlan} size={18} /><div><small>{active.planName} <span>• {active.type === 'break' ? 'DESCANSO' : 'EM FOCO'}</span></small><strong>{active.blockName}</strong></div></div><div className="player-middle"><IconButton title="Reiniciar cronômetro" onClick={() => setConfirm({ title: 'Reiniciar este cronômetro?', text: 'O contador volta à duração inicial. O tempo já estudado continua no histórico.', action: () => update(s => resetTimer(s)) })}><RotateCcw size={16} /></IconButton><button className="round-play" aria-label={active.running ? 'Pausar aula' : 'Continuar aula'} onClick={() => { unlockAudio(); update(s => active.running ? pause(s) : play(s, activePlan, activeBlock, active.date)); }}>{active.running ? <Pause size={18} /> : <Play size={18} />}</button><strong className="player-time">{clock(active.remainingMs)}<small> / {clock(active.totalMs)}</small></strong><span className="player-state">{!active.remainingMs ? 'Concluído' : active.running ? 'Concentre-se no agora' : 'Pausado'}</span></div><button className="compact-button" onClick={() => changeCompact(true)}><PanelTopClose size={17} /> Modo compacto <ArrowUpRight size={14} /></button><div className="bottom-progress" style={{ width: `${100 * (1 - active.remainingMs / active.totalMs)}%` }} /></div>}
    </main>
    {blockEditor && <BlockEditor block={blockEditor.block} onClose={() => setBlockEditor(null)} onSave={saveBlock} />}
    {editor && <PlanEditor plan={editor} onClose={() => setEditor(null)} onSave={savePlan} />}
    {notesPlan && data.plans.some(p => p.id === notesPlan) && <Notebook plan={data.plans.find(p => p.id === notesPlan)} date={date} onClose={() => setNotesPlan(null)} onChange={plan => update(s => ({ ...s, plans: s.plans.map(p => p.id === plan.id ? plan : p) }))} notify={setToast} />}
    {settings && <Modal title="Seu espaço, suas preferências" subtitle="Tudo funciona localmente, sem conta e sem servidor." onClose={() => setSettings(false)}><div className="settings-content"><DensitySettings value={density} onChange={value => update(s => ({ ...s, settings: { ...s.settings, density: value } }))} /><hr /><UpdateSettings updates={appUpdates} /><hr /><div className="setting-row"><div><strong>Modo escuro</strong><p>Preto, cinzas neutros e superfícies de vidro.</p></div><button className={`toggle ${theme === 'dark' ? 'on' : ''}`} role="switch" aria-checked={theme === 'dark'} aria-label="Modo escuro" onClick={toggleTheme}><i /></button></div><hr /><div className="setting-row"><div><strong>Som ao concluir um bloco</strong><p>Um toque curto para avisar que o tempo acabou.</p></div><button className={`toggle ${data.settings.sound ? 'on' : ''}`} role="switch" aria-checked={data.settings.sound} aria-label="Som de conclusão" onClick={() => { unlockAudio(); update(s => ({ ...s, settings: { ...s.settings, sound: !s.settings.sound } })); }}><i /></button></div><button className="secondary" onClick={ring}><Volume2 size={16} /> Testar som</button><hr /><h3>Uma cópia do seu progresso</h3><p className="muted">O backup inclui planos, histórico, anotações e imagens. Guarde uma cópia em outro lugar para ter segurança.</p><div className="button-row"><button className="primary" onClick={backup}><Download size={16} /> Exportar backup</button>{window.desktop ? <button className="secondary" onClick={() => importBackup()}><Upload size={16} /> Importar backup</button> : <label className="secondary file-label"><Upload size={16} /> Importar backup<input type="file" accept=".json" onChange={e => e.target.files[0] && importBackup(e.target.files[0])} /></label>}</div><div className="info-box"><CircleHelp size={18} /><p>Ao fechar o aplicativo, a sessão é pausada. Ao reabrir, clique em play para continuar. Cada bloco seguinte sempre começa manualmente.</p></div></div></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)} small><p className="confirm-text">{confirm.text}</p><div className="modal-actions"><button className="secondary" onClick={() => setConfirm(null)}>Cancelar</button><button className="primary" onClick={() => { confirm.action(); setConfirm(null); }}>Confirmar</button></div></Modal>}
    {appUpdates.open && <UpdateDialog updates={appUpdates} onInstall={installUpdate} Modal={Modal} />}
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><IconButton title="Fechar aviso" onClick={() => setToast('')}><X size={16} /></IconButton></div>}
  </div>;
}

function Stat({ icon: Icon, label, value, detail, color }) { return <article className="stat-card"><div><span className="stat-label">{label}</span><span className={`stat-icon ${color}`}><Icon size={18} /></span></div><strong>{value}</strong>{detail && <p>{detail}</p>}</article>; }
function DensitySettings({ value, onChange }) {
  return <section><h3>Espaçamento</h3><div className="density-options" role="group" aria-label="Espaçamento da interface">{[['minimal', 'Mínimo', 'Mais conteúdo'], ['compact', 'Compacto', 'Padrão'], ['comfortable', 'Confortável', 'Mais espaço']].map(([key, label, hint]) => <button key={key} className={value === key ? 'selected' : ''} aria-pressed={value === key} onClick={() => onChange(key)}><strong>{label}</strong><small>{hint}</small></button>)}</div></section>;
}
function Empty({ icon: Icon, title, text }) { return <div className="empty"><Icon size={29} /><h3>{title}</h3><p>{text}</p></div>; }
function StudyCard({ plan, data, date, status, togglePlay, toggleDone, onEdit, onEditBlock, onNotes, onDuplicate }) {
  const [menu, setMenu] = useState(false);
  const done = plan.blocks.filter(b => getRecord(data, date, plan.id, b.id).done).length;
  return <article className={`study-card accent-${plan.color}`}><div className="study-card-header"><PlanIcon plan={plan} /><div className="card-heading"><div><h3>{plan.name}</h3><span className={`status ${status}`}>{status === 'progress' && <i />}{status === 'done' ? 'Concluído' : status === 'progress' ? 'Em progresso' : 'Pendente'}</span></div><p><span>{plan.days.length === 5 && [1, 2, 3, 4, 5].every(d => plan.days.includes(d)) ? 'Segunda a sexta' : weekdayOrder.filter(d => plan.days.includes(d)).map(d => days[d]).join(', ')}</span><span>·</span><Clock3 size={12} />{plan.blocks.reduce((s, b) => s + b.minutes, 0)} min<span>·</span>{plan.blocks.filter(b => b.type === 'lesson').length} aulas</p></div><button className="notes-link" onClick={onNotes}><PenLine size={15} /> Anotações <span>{plan.notes.length || ''}</span></button><div className="menu-container"><IconButton title={`Opções de ${plan.name}`} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></IconButton>{menu && <><button className="menu-backdrop" aria-label="Fechar opções" onClick={() => setMenu(false)} /><div className="dropdown"><button onClick={() => { onEdit(); setMenu(false); }}><Pencil size={15} /> Editar plano</button><button onClick={() => { onDuplicate(); setMenu(false); }}><Copy size={15} /> Duplicar plano</button></div></>}</div></div>
    <div className="block-list">{plan.blocks.map((block, index) => {
      const rec = getRecord(data, date, plan.id, block.id);
      const isActive = data.active?.date === date && data.active.planId === plan.id && data.active.blockId === block.id;
      const running = isActive && data.active.running;
      return <div className={`study-block ${block.type} ${rec.done ? 'is-done' : ''} ${isActive && !rec.done ? 'is-active' : ''}`} key={block.id}><span className="block-number">{String(index + 1).padStart(2, '0')}</span><span className="block-type">{block.type === 'break' ? <Coffee size={16} /> : <BookOpen size={16} />}</span><div className="block-name"><strong>{block.name}</strong></div><span className="block-duration">{isActive && data.active.remainingMs > 0 ? clock(data.active.remainingMs) : `${block.minutes} min`}</span><IconButton title={`Editar ${block.name}`} onClick={() => onEditBlock(block)}><Pencil size={14} /></IconButton><button className={`block-play ${running ? 'playing' : ''}`} aria-label={`${running ? 'Pausar' : 'Iniciar'} ${block.name}`} onClick={() => togglePlay(plan, block)}>{running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button className={`checkbox ${rec.done ? 'checked' : ''}`} role="checkbox" aria-checked={rec.done} aria-label={`Concluir ${block.name}`} onClick={() => toggleDone(plan, block)}>{rec.done && <Check size={13} strokeWidth={3} />}</button></div>;
    })}</div><div className="card-footer"><span>{done} de {plan.blocks.length} blocos concluídos</span><div className="mini-progress"><i style={{ width: `${plan.blocks.length ? done / plan.blocks.length * 100 : 0}%` }} /></div><span>{Math.round(plan.blocks.length ? done / plan.blocks.length * 100 : 0)}%</span></div>
  </article>;
}

function Modal({ title, subtitle, onClose, children, small, wide }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = e => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = [...ref.current.querySelectorAll('button:not(:disabled), input, textarea, select, [tabindex="0"]')].filter(el => el.offsetParent !== null);
        const first = items[0]; const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={ref} className={`modal ${small ? 'small' : ''} ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton title="Fechar" onClick={onClose}><X size={20} /></IconButton></div>{children}</section></div>;
}
function BlockEditor({ block, onClose, onSave }) {
  const [name, setName] = useState(block.name);
  const [minutes, setMinutes] = useState(block.minutes);
  return <Modal title={block.type === 'break' ? 'Editar descanso' : 'Editar aula'} onClose={onClose} small><form className="editor-form block-editor-form" onSubmit={e => { e.preventDefault(); onSave({ name, minutes }); }}><label>Nome<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>Duração (minutos)<input type="number" min="1" max="360" step="1" required value={minutes} onChange={e => setMinutes(e.target.value)} /></label><p className="muted">O tempo já estudado é mantido. A aula em andamento fica pausada.</p><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar alteração</button></div></form></Modal>;
}

function PlanEditor({ plan, onClose, onSave }) {
  const [draft, setDraft] = useState(structuredClone(plan));
  const [dragged, setDragged] = useState(null);
  const [error, setError] = useState('');
  function changeBlock(id, fields) { setDraft(s => ({ ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, ...fields } : b) })); }
  function move(from, to) { if (to < 0 || to >= draft.blocks.length || from === to) return; setDraft(s => { const blocks = [...s.blocks]; const [block] = blocks.splice(from, 1); blocks.splice(to, 0, block); return { ...s, blocks }; }); }
  function save(e) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.days.length || !draft.blocks.some(b => b.type === 'lesson') || draft.blocks.some(b => !b.name.trim() || !Number.isFinite(+b.minutes) || +b.minutes < 1 || +b.minutes > 360)) { setError('Defina um nome, pelo menos um dia e uma aula. Os blocos precisam de nome e duração entre 1 e 360 minutos.'); return; }
    onSave({ ...draft, name: draft.name.trim(), blocks: draft.blocks.map(b => ({ ...b, name: b.name.trim(), minutes: +b.minutes })) });
  }
  return <Modal title={plan.name ? 'Editar plano de estudo' : 'Um novo plano de estudo'} subtitle="Transforme o seu objetivo em pequenos passos." onClose={onClose} wide><form onSubmit={save} className="editor-form"><div className="form-two"><label>Nome do plano<input autoFocus value={draft.name} maxLength={80} placeholder="Ex.: Infraestrutura" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div><label>Cor do plano</label><div className="color-picker">{colors.map(c => <button type="button" key={c} className={`color-choice ${c} ${draft.color === c ? 'chosen' : ''}`} aria-label={`Cor ${c}`} onClick={() => setDraft({ ...draft, color: c })}>{draft.color === c && <Check size={17} />}</button>)}</div></div></div><label>Uma intenção para este plano <span className="optional">opcional</span><input value={draft.description} maxLength={160} placeholder="O que você quer conquistar?" onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label>Dias de estudo</label><div className="day-picker">{weekdayOrder.map(d => <button type="button" key={d} className={draft.days.includes(d) ? 'on' : ''} onClick={() => setDraft({ ...draft, days: draft.days.includes(d) ? draft.days.filter(day => day !== d) : [...draft.days, d] })}>{days[d]}{draft.days.includes(d) && <Check size={12} />}</button>)}</div><div className="editor-section"><div><h3>Sua sequência de estudo</h3><p>Arraste os blocos ou use as setas para mudar a ordem.</p></div><span>{draft.blocks.reduce((s, b) => s + (+b.minutes || 0), 0)} min no total</span></div><div className="editor-blocks">{draft.blocks.map((block, i) => <div key={block.id} className={`editor-block ${block.type} ${dragged === i ? 'dragging' : ''}`} draggable onDragStart={e => { setDragged(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }} onDragEnd={() => setDragged(null)} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => { e.preventDefault(); const source = Number(e.dataTransfer.getData('text/plain')); if (dragged !== null && Number.isInteger(source)) move(source, i); setDragged(null); }}><GripVertical size={17} className="grip" /><span className={`editor-type ${block.type}`}>{block.type === 'break' ? <Coffee size={17} /> : <BookOpen size={17} />}</span><label className="block-edit-name"><span>{block.type === 'break' ? 'DESCANSO' : 'AULA'}</span><input aria-label={`Nome do bloco ${i + 1}`} value={block.name} maxLength={120} onChange={e => changeBlock(block.id, { name: e.target.value })} /></label><label className="minutes-input"><input aria-label={`Minutos do bloco ${i + 1}`} type="number" min="1" max="360" value={block.minutes} onChange={e => changeBlock(block.id, { minutes: e.target.value })} /><span>min</span></label><div className="reorder"><IconButton type="button" title={`Mover bloco ${i + 1} para cima`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></IconButton><IconButton type="button" title={`Mover bloco ${i + 1} para baixo`} disabled={i === draft.blocks.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></IconButton></div><IconButton type="button" title={`Remover bloco ${i + 1}`} onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter(b => b.id !== block.id) })}><X size={16} /></IconButton></div>)}</div><div className="button-row"><button type="button" className="secondary" draggable onDragStart={e => e.dataTransfer.setData('application/compasso-block', 'lesson')} onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, newBlock()] })}><Plus size={15} /><BookOpen size={15} /> Adicionar aula</button><button type="button" className="secondary" draggable onDragStart={e => e.dataTransfer.setData('application/compasso-block', 'break')} onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, newBlock('break')] })}><Plus size={15} /><Coffee size={15} /> Adicionar descanso</button></div><div className="block-drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const type = e.dataTransfer.getData('application/compasso-block'); if (['lesson', 'break'].includes(type)) setDraft({ ...draft, blocks: [...draft.blocks, newBlock(type)] }); }}>Você também pode arrastar os botões acima para cá.</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit"><Check size={16} /> Salvar plano</button></div></form></Modal>;
}

function Notebook({ plan, date, onClose, onChange, notify }) {
  const [selected, setSelected] = useState(plan.notes[0]?.id || null);
  const [sketch, setSketch] = useState(false);
  const fileRef = useRef();
  const note = plan.notes.find(n => n.id === selected);
  function add() { const n = { id: uid(), date, blockId: '', title: '', text: '', images: [] }; onChange({ ...plan, notes: [n, ...plan.notes] }); setSelected(n.id); }
  function edit(fields) { if (note) onChange({ ...plan, notes: plan.notes.map(n => n.id === note.id ? { ...n, ...fields } : n) }); }
  async function imageFiles(files) {
    if (!note) return;
    const images = [];
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { notify('Use imagens PNG, JPG ou WebP.'); continue; }
      if (file.size > 4 * 1024 * 1024) { notify('Cada imagem pode ter até 4 MB.'); continue; }
      const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
      if (base64) images.push(base64);
    }
    if (images.length) edit({ images: [...note.images, ...images] });
  }
  return <Modal title={`Caderno · ${plan.name}`} subtitle="Ideias, descobertas e aqueles detalhes que você quer guardar." onClose={onClose} wide><div className="notebook"><aside><button className="primary" onClick={add}><Plus size={15} /> Nova anotação</button>{plan.notes.map(n => <button key={n.id} className={`note-item ${selected === n.id ? 'selected' : ''}`} onClick={() => setSelected(n.id)}><strong>{n.title || 'Sem título'}</strong><small>{new Date(`${n.date}T12:00:00`).toLocaleDateString('pt-BR')}</small><p>{n.text.slice(0, 65) || 'Uma página para suas ideias.'}</p></button>)}</aside><section className="note-editor">{note ? <><div className="note-meta"><input type="date" aria-label="Data da anotação" value={note.date} onChange={e => e.target.value && edit({ date: e.target.value })} /><select aria-label="Vincular anotação à aula" value={note.blockId} onChange={e => edit({ blockId: e.target.value })}><option value="">Anotação geral</option>{plan.blocks.filter(b => b.type === 'lesson').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><input className="note-title" aria-label="Título da anotação" value={note.title} maxLength={160} onChange={e => edit({ title: e.target.value })} placeholder="O que você aprendeu hoje?" /><textarea aria-label="Texto da anotação" value={note.text} onChange={e => edit({ text: e.target.value })} onPaste={e => { const files = [...e.clipboardData.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean); if (files.length) { e.preventDefault(); imageFiles(files); } }} placeholder="Escreva livremente. Você pode colar um print aqui também…" /><div className="note-images">{note.images.map((src, i) => <div key={i}><img src={src} alt={`Imagem da anotação ${i + 1}`} /><IconButton title={`Remover imagem ${i + 1}`} onClick={() => edit({ images: note.images.filter((_, index) => index !== i) })}><X size={14} /></IconButton></div>)}</div><div className="note-toolbar"><button className="secondary" onClick={() => fileRef.current.click()}><ImagePlus size={16} /> Imagem</button><button className="secondary" onClick={() => setSketch(true)}><PenLine size={16} /> Rabiscar</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple onChange={e => { imageFiles([...e.target.files]); e.target.value = ''; }} /><span>Salvo automaticamente</span></div><details className="delete-note"><summary>Excluir anotação</summary><p>Remover esta página e suas imagens?</p><button className="danger" onClick={() => { onChange({ ...plan, notes: plan.notes.filter(n => n.id !== note.id) }); setSelected(plan.notes.find(n => n.id !== note.id)?.id || null); }}>Sim, excluir anotação</button></details></> : <Empty icon={PenLine} title="Conhecimento que fica." text="Crie uma anotação para guardar o que você aprendeu. Vincule a uma aula e adicione imagens ou rabiscos." />}</section></div>{sketch && <Sketch onClose={() => setSketch(false)} onSave={src => { edit({ images: [...note.images, src] }); setSketch(false); }} />}</Modal>;
}
function Sketch({ onClose, onSave }) {
  const canvas = useRef(); const drawing = useRef(false); const [color, setColor] = useState('#6356ce');
  useEffect(() => { const ctx = canvas.current.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 420); }, []);
  function point(e) { const rect = canvas.current.getBoundingClientRect(); return [(e.clientX - rect.left) * 800 / rect.width, (e.clientY - rect.top) * 420 / rect.height]; }
  return <div className="sketch-overlay"><div className="sketch-panel"><h3>Uma ideia em traços</h3><canvas ref={canvas} width="800" height="420" onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...point(e)); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; }} onPointerMove={e => { if (drawing.current) { const ctx = canvas.current.getContext('2d'); ctx.lineTo(...point(e)); ctx.stroke(); } }} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} /><div className="button-row"><input type="color" aria-label="Cor da caneta" value={color} onChange={e => setColor(e.target.value)} /><button className="secondary" onClick={() => { const ctx = canvas.current.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 420); }}>Limpar</button><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={() => onSave(canvas.current.toDataURL('image/png'))}>Guardar no caderno</button></div></div></div>;
}

function Metrics({ data }) {
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);
  const end = new Date();
  let start;
  if (period === 'week') { end.setDate(end.getDate() - (end.getDay() + 6) % 7 + offset * 7); start = new Date(end); end.setDate(end.getDate() + 6); }
  else { end.setMonth(end.getMonth() + offset, 1); start = new Date(end); end.setMonth(end.getMonth() + 1, 0); }
  const from = dayKey(start); const to = dayKey(end);
  const entries = Object.entries(data.records).filter(([k]) => k.split('|')[0] >= from && k.split('|')[0] <= to);
  const total = focusMs(data, from, to);
  const studyDays = new Set(entries.filter(([, r]) => r.type !== 'break' && r.elapsedMs > 0).map(([k]) => k.split('|')[0])).size;
  const completed = entries.filter(([, r]) => r.type !== 'break' && r.done).length;
  const bars = []; const cursor = new Date(start);
  while (dayKey(cursor) <= to) { const key = dayKey(cursor); bars.push({ date: key, label: period === 'week' ? days[cursor.getDay()] : String(cursor.getDate()), ms: focusMs(data, key, key) }); cursor.setDate(cursor.getDate() + 1); }
  const max = Math.max(3600000, ...bars.map(b => b.ms));
  const planTotals = {};
  for (const [key, r] of entries) { if (r.type === 'break') continue; const id = key.split('|')[1]; const p = data.plans.find(p => p.id === id); planTotals[id] ||= { name: p?.name || r.planName || 'Plano removido', color: p?.color || 'violet', ms: 0, done: 0 }; planTotals[id].ms += r.elapsedMs; if (r.done) planTotals[id].done++; }
  return <><div className="metrics-period"><div className="tabs">{[['week', 'Semanal'], ['month', 'Mensal']].map(([key, label]) => <button key={key} className={period === key ? 'selected' : ''} onClick={() => { setPeriod(key); setOffset(0); }}>{label}</button>)}</div><div className="date-switch"><IconButton title="Período anterior" onClick={() => setOffset(offset - 1)}><ChevronLeft size={16} /></IconButton><span>{start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — {end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span><IconButton title="Próximo período" onClick={() => setOffset(offset + 1)}><ChevronRight size={16} /></IconButton></div></div><section className="stats-grid"><Stat icon={Clock3} color="violet" label="TEMPO REAL DE ESTUDO" value={duration(total)} detail="Pausas e descansos não entram na conta" /><Stat icon={Flame} color="orange" label="DIAS COM ESTUDO" value={studyDays} detail={`${completed} aulas concluídas no período`} /><Stat icon={TrendingUp} color="green" label="MÉDIA POR DIA ATIVO" value={duration(studyDays ? total / studyDays : 0)} detail="Tempo de foco dividido pelos dias estudados" /></section><section className="chart-card"><div><h2>Seu ritmo ao longo dos dias</h2><span><i className="color-dot violet" /> Tempo de estudo</span></div><div className="chart"><div className="chart-y"><span>{Math.round(max / 60000)} min</span><span>{Math.round(max / 120000)} min</span><span>0 min</span></div><div className="chart-bars">{bars.map(b => <div className={`chart-column ${b.date === dayKey() ? 'today' : ''}`} key={b.date} title={`${b.date}: ${duration(b.ms)}`}><div className="bar-space"><div className="bar" style={{ height: `${b.ms / max * 100}%`, minHeight: b.ms ? 4 : 0 }} /></div><span>{b.label}</span></div>)}</div></div>{!total && <p className="chart-empty">Seu gráfico começa no primeiro play. Vamos dar esse passo?</p>}</section><section className="history-card"><h2>Por plano de estudo</h2><table><thead><tr><th>Plano</th><th>Tempo de foco</th><th>Aulas concluídas</th><th>Participação</th></tr></thead><tbody>{Object.entries(planTotals).map(([id, p]) => <tr key={id}><td><span className={`color-dot ${p.color}`} />{p.name}</td><td>{duration(p.ms)}</td><td>{p.done}</td><td>{total ? Math.round(p.ms / total * 100) : 0}%</td></tr>)}</tbody></table>{!entries.length && <p className="muted history-empty">Ainda não há registros neste período.</p>}<p className="metrics-help">O tempo é registrado enquanto o cronômetro roda. Marcar uma aula manualmente conta como conclusão, sem adicionar horas de estudo.</p></section></>;
}
