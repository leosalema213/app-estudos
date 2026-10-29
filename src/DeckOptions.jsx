import React, { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { defaultOptions, studyDay, validOptions } from './anki.js';
import { numberOptions } from './anki-option-fields.js';
import { presetLabel, presetLabels } from './anki-labels.js';

const sections = [['limits', 'Limites'], ['learning', 'Aprendizagem'], ['order', 'Ordem'], ['audio', 'Áudio e tempo'], ['schedule', 'Agendamento']];
export default function DeckOptions({ a, deckId, Modal, notify, onClose, onSave }) {
  const deck = a.decks.find(d => d.id === deckId), day = studyDay(Date.now(), a.settings.rollover);
  const initial = { ...defaultOptions, ...a.presets.find(p => p.id === deck.presetId)?.options };
  const [catalog, setCatalog] = useState(a.presets), [presetId, setPresetId] = useState(deck.presetId), [scope, setScope] = useState('preset'), [tab, setTab] = useState('limits');
  const [values, setValues] = useState(initial), [settings, setSettings] = useState(a.settings), [limits, setLimits] = useState({ deck: {}, today: {} });
  const [steps, setSteps] = useState({ learnSteps: initial.learnSteps.join(' '), relearnSteps: initial.relearnSteps.join(' ') }), [weights, setWeights] = useState(initial.weights.join(' '));
  const [creating, setCreating] = useState(false), [name, setName] = useState(''); const tabs = useRef([]);
  const labels = presetLabels(catalog);
  const change = (key, value) => setValues(s => ({ ...s, [key]: value }));
  const scopedLimits = scope === 'preset' ? values : { ...values, ...(scope === 'deck' ? deck.options : deck.today?.day === day ? deck.today.options : {}), ...limits[scope] };
  function parsedValues() {
    const options = { ...values, ...Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.trim() ? v.trim().split(/\s+/).map(x => /^\d+(\.\d+)?[md]?$/.test(x) ? parseFloat(x) * (x.endsWith('d') ? 1440 : 1) : NaN) : []])), weights: weights.trim() ? weights.trim().split(/[\s,]+/).map(Number) : [] };
    if (!validOptions(options)) { notify('Confira os números, passos (ex.: 1m 10m) e pesos FSRS (17, 19 ou 21 números).'); return null; }
    return options;
  }
  function loadPreset(id) {
    const current = parsedValues(); if (!current) return;
    setCatalog(items => items.map(p => p.id === presetId ? { ...p, options: current } : p));
    const next = { ...defaultOptions, ...catalog.find(p => p.id === id).options };
    setPresetId(id); setValues(next); setSteps({ learnSteps: next.learnSteps.join(' '), relearnSteps: next.relearnSteps.join(' ') }); setWeights(next.weights.join(' '));
  }
  function createPreset() {
    const options = parsedValues(), title = name.trim(); if (!options) return;
    if (!title || catalog.some(p => presetLabel(p.name).trim().toLocaleLowerCase() === presetLabel(title).toLocaleLowerCase())) { notify('Use um nome único para a configuração.'); return; }
    const preset = { id: crypto.randomUUID(), name: title, options: structuredClone(options) };
    setCatalog([...catalog.map(p => p.id === presetId ? { ...p, options } : p), preset]); setPresetId(preset.id); setCreating(false); setName('');
  }
  function save(e) {
    e.preventDefault(); const options = parsedValues(); if (!options) return;
    if (!Number.isInteger(settings.rollover) || settings.rollover < 0 || settings.rollover > 23 || Object.values(limits).some(v => Object.values(v).some(n => !Number.isInteger(n) || n < 0 || n > 1000000))) { notify('Confira os limites e a hora de início do dia.'); return; }
    const nextDeck = { ...deck, presetId };
    if (Object.keys(limits.deck).length) nextDeck.options = { ...deck.options, ...limits.deck };
    if (Object.keys(limits.today).length) nextDeck.today = { day, options: { ...(deck.today?.day === day ? deck.today.options : {}), ...limits.today } };
    onSave({ ...a, settings, presets: catalog.map(p => p.id === presetId ? { ...p, options } : p), decks: a.decks.map(d => d.id === deckId ? nextDeck : d) });
  }
  const check = (key, label, global = false) => <label className="anki-check" key={key}><input type="checkbox" checked={!!(global ? settings : values)[key]} onChange={e => global ? setSettings({ ...settings, [key]: e.target.checked }) : change(key, e.target.checked)} />{label}</label>;
  const select = (key, label, labels) => <label key={key}>{label}<select value={values[key]} onChange={e => change(key, Number(e.target.value))}>{labels.map((title, i) => <option key={title} value={i}>{title}</option>)}</select></label>;
  const numericGroup = index => <fieldset><legend>{numberOptions[index][0]}</legend><div className="anki-form-grid">{numberOptions[index][1].map(([key, label, step]) => <label key={key}>{label}<input type="number" required min={0} step={step} value={(index === 0 ? scopedLimits : values)[key]} onChange={e => index === 0 && scope !== 'preset' ? setLimits({ ...limits, [scope]: { ...limits[scope], [key]: Number(e.target.value) } }) : change(key, Number(e.target.value))} /></label>)}</div></fieldset>;
  return <Modal title={`Opções · ${deck.name}`} wide onClose={onClose}><form className="anki-editor anki-options-form" onSubmit={save}>
    <div className="anki-preset-toolbar"><label>Configuração<select value={presetId} onChange={e => loadPreset(e.target.value)}>{catalog.map(p => <option key={p.id} value={p.id}>{labels.get(p.id)}</option>)}</select></label><button type="button" className="secondary" onClick={() => setCreating(!creating)}><Plus size={14} />Nova configuração</button></div>
    {creating && <div className="anki-new-preset"><label>Nome da nova configuração<input autoFocus maxLength={60} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createPreset(); } }} /></label><p className="muted">Começa com uma cópia das opções atuais. Só será gravado ao salvar as opções.</p><div className="anki-actions"><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button type="button" className="secondary" onClick={createPreset}>Criar configuração</button></div></div>}
    <div className="tabs anki-options-tabs" role="tablist" aria-label="Grupos de opções">{sections.map(([id, title], i) => <button type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} ref={el => { tabs.current[i] = el; }} key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length; setTab(sections[next][0]); tabs.current[next]?.focus(); } }}>{title}</button>)}</div>
    <div className="anki-options-panel" role="tabpanel" aria-label={sections.find(([id]) => id === tab)[1]}>
      {tab === 'limits' && <><label>Aplicar limites a<select value={scope} onChange={e => setScope(e.target.value)}><option value="preset">Configuração</option><option value="deck">Este baralho</option><option value="today">Somente hoje</option></select></label>{numericGroup(0)}{check('newIgnoreReview', 'Novas cartas ignoram limite de revisões', true)}{check('limitsFromTop', 'Aplicar limites desde o topo', true)}<p className="muted">A configuração compartilha as opções entre baralhos. Os outros escopos alteram somente os limites deste baralho.</p></>}
      {tab === 'learning' && <>{numericGroup(1)}<fieldset><legend>Passos (minutos ou dias)</legend>{Object.entries(steps).map(([key, value]) => <label key={key}>{key === 'learnSteps' ? 'Aprendizagem' : 'Reaprendizagem'}<input value={value} placeholder="1m 10m" onChange={e => setSteps({ ...steps, [key]: e.target.value })} /></label>)}<label>Ação para cartas problemáticas<select value={values.leechAction} onChange={e => change('leechAction', e.target.value)}><option value="tag">Somente marcador</option><option value="suspend">Suspender</option></select></label></fieldset></>}
      {tab === 'order' && <><fieldset><legend>Ordem de exibição</legend><div className="anki-form-grid">{select('insertion', 'Inserção de novos', ['Sequencial', 'Aleatória'])}{select('gather', 'Coleta de novos', ['Baralho', 'Menor posição', 'Maior posição', 'Notas aleatórias', 'Cartas aleatórias', 'Baralho e notas aleatórias'])}{select('newSort', 'Ordenação de novos', ['Tipo de carta, depois coleta', 'Ordem coletada', 'Tipo de carta, depois aleatória', 'Nota aleatória, depois tipo', 'Aleatória'])}{select('newMix', 'Novos e revisões', ['Misturar', 'Após revisões', 'Antes de revisões'])}{select('interdayMix', 'Aprendizagem de outro dia', ['Misturar', 'Após revisões', 'Antes de revisões'])}<label>Ordenação de revisão<select value={values.reviewOrder} onChange={e => change('reviewOrder', Number(e.target.value))}>{[[0, 'Vencimento, depois aleatória'], [3, 'Intervalo crescente'], [4, 'Intervalo decrescente'], [5, 'Facilidade crescente'], [6, 'Facilidade decrescente'], [8, 'Aleatória'], [9, 'Adicionados primeiro'], [10, 'Adicionados por último'], [1, 'Vencimento e baralho'], [2, 'Baralho e vencimento']].map(([n, title]) => <option key={n} value={n}>{title}</option>)}</select></label></div></fieldset><fieldset><legend>Irmãos</legend>{check('buryNew', 'Enterrar irmãos novos')}{check('buryReview', 'Enterrar irmãos de revisão')}{check('buryInterday', 'Enterrar irmãos em aprendizagem entre dias')}</fieldset></>}
      {tab === 'audio' && <>{numericGroup(2)}<fieldset><legend>Áudio e tempo</legend>{check('autoplay', 'Reproduzir áudio automaticamente')}{check('skipQuestion', 'Ao repetir verso, pular áudio da pergunta')}{check('showTimer', 'Mostrar temporizador')}{check('stopTimer', 'Parar temporizador ao mostrar resposta')}{check('waitAudio', 'Aguardar áudio antes do avanço automático')}{select('questionAction', 'Ação após pergunta', ['Mostrar resposta', 'Lembrar'])}{select('answerAction', 'Ação após resposta', ['Adiar carta', 'Errei', 'Bom', 'Difícil', 'Lembrar'])}</fieldset></>}
      {tab === 'schedule' && <>{check('fsrs', 'Usar FSRS (coleção inteira)', true)}{numericGroup(3)}<label>Início do dia (hora)<input type="number" min={0} max={23} step={1} value={settings.rollover} onChange={e => setSettings({ ...settings, rollover: Number(e.target.value) })} /></label><fieldset><legend>Dias leves</legend><div className="anki-form-grid">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((title, i) => <label key={title}>{title}<select value={values.easyDays[i]} onChange={e => change('easyDays', values.easyDays.map((v, j) => j === i ? Number(e.target.value) : v))}><option value={0}>Mínimo</option><option value={0.5}>Reduzido</option><option value={1}>Normal</option></select></label>)}</div></fieldset><label>Pesos FSRS (vazio usa os padrões)<textarea value={weights} onChange={e => setWeights(e.target.value)} /></label><p className="muted">Os vencimentos importados são preservados. O agendador local ainda tem diferenças para o Anki, incluindo variação aleatória e Dias leves; não há garantia de datas futuras idênticas.</p></>}
    </div>
    <div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar opções</button></div>
  </form></Modal>;
}
