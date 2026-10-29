import React, { useState } from 'react';
import { linkPlanDecks } from './anki-progress.js';

export default function AnkiPlanLinks({ a, plan, Modal, onClose, onSave }) {
  const [selected, setSelected] = useState(a.decks.filter(d => d.planIds?.includes(plan.id)).map(d => d.id));
  return <Modal title={`Anki do plano · ${plan.name}`} small onClose={onClose}><form className="anki-editor" onSubmit={e => { e.preventDefault(); onSave(linkPlanDecks(a, plan.id, selected)); }}><p className="muted">O vínculo é opcional. Um baralho pode acompanhar mais de um plano.</p>{a.decks.map(deck => <label key={deck.id} className="anki-check"><input type="checkbox" checked={selected.includes(deck.id)} onChange={e => setSelected(e.target.checked ? [...selected, deck.id] : selected.filter(id => id !== deck.id))} />{deck.name}</label>)}{!a.decks.length && <p>Nenhum baralho criado. Crie ou importe um baralho para vinculá-lo.</p>}<div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar vínculos</button></div></form></Modal>;
}
