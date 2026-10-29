import React from 'react';
import { Copy, Clock3, CalendarDays, CheckCheck } from 'lucide-react';
import { ankiProgress } from './anki-progress.js';

export default function AnkiProgress({ anki, from, to, Stat, onOpen }) {
  const summary = ankiProgress(anki, from, to);
  return <section className="anki-progress-section"><div className="section-heading"><h2>Revisões Anki</h2><button className="secondary" onClick={onOpen}>Abrir Anki</button></div><div className="stats-grid metrics-stats"><Stat icon={Copy} color="violet" label="REVISÕES" value={summary.reviews} detail="Respostas registradas no período" /><Stat icon={Clock3} color="blue" label="TEMPO DE REVISÃO" value={`${(summary.elapsedMs / 60000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`} detail="Tempo registrado nas respostas" /><Stat icon={CalendarDays} color="orange" label="DIAS COM REVISÃO" value={summary.days} detail="Dias com pelo menos uma resposta" /><Stat icon={CheckCheck} color="green" label="ACERTOS" value={`${summary.accuracy}%`} detail="Respostas corretas entre as revisões" /></div><p className="metrics-help">O tempo das respostas do Anki é exibido separadamente do cronômetro dos planos.</p></section>;
}
