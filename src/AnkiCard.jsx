import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cardDocument, renderTemplate } from './anki-render.js';

function Surface({ a, card, back, typed, active, ready, onKey, dark }) {
  const frame = useRef(), [src, setSrc] = useState(''), [error, setError] = useState('');
  const note = a.notes.find(n => n.id === card.noteId), model = a.models.find(m => m.id === note?.modelId);
  const readyRef = useRef(ready), keyRef = useRef(onKey); readyRef.current = ready; keyRef.current = onKey;
  useEffect(() => {
    let stopped = false, url; const urls = new Map(); setError(''); setSrc('');
    (async () => {
      const source = await cardDocument(renderTemplate(model, note, card, back, typed), model.css, a.media, dark, async meta => {
        if (!urls.has(meta.hash)) { const bytes = await window.desktop.anki.readMedia(meta); if (stopped) throw new Error('Carta fechada.'); urls.set(meta.hash, URL.createObjectURL(new Blob([bytes], { type: meta.mime }))); }
        return urls.get(meta.hash);
      });
      if (stopped) return;
      url = URL.createObjectURL(new Blob([source], { type: 'text/html' })); setSrc(url);
    })().catch(e => { if (!stopped) setError(e.message); });
    return () => { stopped = true; if (url) URL.revokeObjectURL(url); for (const item of urls.values()) URL.revokeObjectURL(item); readyRef.current(null); };
  }, [card.id, back, typed, note, model, a.media, dark]);
  return error ? <p role="alert">{error}</p> : src ? <iframe ref={frame} src={src} title={back ? 'Verso da carta' : 'Frente da carta'} tabIndex={active ? 0 : -1} sandbox="allow-same-origin" onLoad={() => { const doc = frame.current.contentDocument; doc.addEventListener('keydown', e => keyRef.current?.(e)); readyRef.current(doc); }} /> : <div className="anki-card-loading">Preparando carta…</div>;
}

export default function AnkiCard({ a, card, back = false, typed = '', autoplay = false, skipQuestion, replay, onKey, onAudioStart, onAudioEnd, onReveal, onTyped, typing, answerActions, leaving, preview = false, onEdit, counters }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme !== 'light');
  useEffect(() => { const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme !== 'light')); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => observer.disconnect(); }, []);
  const documents = useRef({}), token = useRef(0), initialPlayed = useRef(false), previousReplay = useRef(replay);
  const current = useRef({ back, onAudioStart, onAudioEnd }); current.current = { back, onAudioStart, onAudioEnd };
  function stop() {
    token.current++;
    for (const doc of Object.values(documents.current)) for (const audio of doc?.querySelectorAll('audio') || []) { audio.pause(); audio.currentTime = 0; }
  }
  async function play(onlyAudio) {
    stop(); const request = token.current, doc = documents.current[current.current.back ? 'back' : 'front'];
    let audios = onlyAudio ? [onlyAudio] : [...(doc?.querySelectorAll('audio') || [])];
    if (!onlyAudio && current.current.back && skipQuestion) {
      const note = a.notes.find(n => n.id === card.noteId), model = a.models.find(m => m.id === note.modelId), template = model.templates[model.kind === 1 ? 0 : card.ord];
      if (template?.a.includes('{{FrontSide}}')) audios = audios.slice([...renderTemplate(model, note, card).matchAll(/\[sound:|<audio\b/gi)].length);
    }
    if (audios.length) current.current.onAudioStart?.();
    for (const audio of audios) {
      if (request !== token.current) return;
      await new Promise(resolve => { audio.onended = resolve; audio.onerror = resolve; audio.onpause = resolve; audio.play().catch(resolve); });
    }
    if (request === token.current) current.current.onAudioEnd?.();
  }
  function ready(side, doc) {
    documents.current[side] = doc; if (!doc) return;
    for (const button of doc.querySelectorAll('[data-anki-play]')) button.addEventListener('click', () => { const audio = doc.getElementById(button.dataset.ankiPlay); if (audio) play(audio); });
    // Each card autoplays once on entry. Turning it over never starts audio.
    if (side === 'front' && !initialPlayed.current && !preview) { initialPlayed.current = true; autoplay && !current.current.back ? play() : current.current.onAudioEnd?.(); }
  }
  useEffect(() => { if (replay !== previousReplay.current) { previousReplay.current = replay; play(); } }, [replay]);
  useEffect(() => { if (back) { stop(); current.current.onAudioEnd?.(); } }, [back]);
  useEffect(() => { if (leaving) stop(); }, [leaving]);
  useEffect(() => () => stop(), []);
  return <div className={`anki-card-stage ${leaving ? 'anki-card-leaving' : ''} ${preview ? 'anki-card-preview' : ''}`}>
    {!preview && <div className="anki-card-stack" aria-hidden="true"><i /><i /></div>}
    <div className={`anki-flip ${back ? 'anki-flipped' : ''}`}>
      <div className="anki-card-side anki-card-front" aria-hidden={back} inert={back}>
        <div className="anki-card-topline"><span className="anki-card-eyebrow">PERGUNTA</span>{onEdit && <button className="icon-button" title="Editar nota" aria-label="Editar nota" onClick={onEdit}><Pencil size={14} /></button>}</div>
        <Surface {...{ a, card, onKey, dark }} typed="" back={false} active={!back} ready={doc => ready('front', doc)} />
        {typing && <input className="anki-typed" aria-label="Sua resposta" value={typed} onChange={e => onTyped?.(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onReveal?.(); }} />}
        {onReveal && <div className="anki-card-controls anki-question-controls">{counters && <div className="anki-queue-counts" role="group" aria-live="polite" aria-label={`${counters.new} novas, ${counters.learn} aprendendo, ${counters.due} para revisar`}><span className={`anki-new ${card.state === 0 ? 'anki-count-active' : ''}`} title="Novas">{counters.new}</span><span aria-hidden="true">+</span><span className={`anki-learn ${[1,3].includes(card.state) ? 'anki-count-active' : ''}`} title="Aprendendo">{counters.learn}</span><span aria-hidden="true">+</span><span className={`anki-due ${card.state === 2 ? 'anki-count-active' : ''}`} title="Revisão">{counters.due}</span></div>}<button className="primary" onClick={onReveal}>Mostrar resposta <kbd>Espaço</kbd></button></div>}
      </div>
      <div className="anki-card-side anki-card-back" aria-hidden={!back} inert={!back}>
        <div className="anki-card-topline"><span className="anki-card-eyebrow">RESPOSTA</span>{onEdit && <button className="icon-button" title="Editar nota" aria-label="Editar nota" onClick={onEdit}><Pencil size={14} /></button>}</div>
        {(back || preview) && <Surface {...{ a, card, typed, onKey, dark }} back active={back} ready={doc => ready('back', doc)} />}
        {answerActions && <div className="anki-card-controls anki-ratings">{answerActions}</div>}
      </div>
    </div>
  </div>;
}
