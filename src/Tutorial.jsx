import { BookOpen, CheckCheck, PenLine, Play, Plus } from 'lucide-react';

export default function Tutorial({ stage, Modal, onStart, onClose, onDone }) {
  const welcome = stage === 'welcome';
  return <Modal title={welcome ? 'Seu primeiro plano de estudo' : 'Seu plano está pronto'} subtitle={welcome ? 'Uma configuração rápida para começar.' : 'O essencial para usar o Organon.'} onClose={onClose} small><div className="tutorial-body"><ol>{welcome ? <>
    <li><BookOpen size={18} /><div><strong>Escolha o que estudar</strong><p>Dê um nome ao plano e escolha os dias da semana.</p></div></li>
    <li><Plus size={18} /><div><strong>Organize seu tempo</strong><p>Comece com Aula 1, descanso e Aula 2. Renomeie e ajuste os minutos como quiser.</p></div></li>
    <li><Play size={18} /><div><strong>Salve para começar</strong><p>Seu plano fica salvo neste computador.</p></div></li>
  </> : <>
    <li><Play size={18} /><div><strong>Play para estudar, pausa quando precisar</strong><p>As aulas aparecem em Meu dia nos dias configurados.</p></div></li>
    <li><CheckCheck size={18} /><div><strong>Terminou o tempo? Check automático</strong><p>Você também pode marcar manualmente. O próximo bloco só começa quando você der play.</p></div></li>
    <li><PenLine size={18} /><div><strong>Guarde o que aprendeu</strong><p>Abra Anotações para escrever, colar prints ou rabiscar. Use o lápis da aula para editar nome e tempo.</p></div></li>
  </>}</ol><div className="modal-actions">{welcome && <button className="secondary" onClick={onClose}>Agora não</button>}<button className="primary" onClick={welcome ? onStart : onDone}>{welcome ? 'Criar meu primeiro plano' : 'Ver meus planos'}</button></div></div></Modal>;
}
