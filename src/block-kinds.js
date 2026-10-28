import { notebookIcons } from './book-appearance.js';

export const builtInKinds = [
  { id: 'lesson', name: 'Aula', icon: 'book' },
  { id: 'break', name: 'Descanso', icon: 'coffee' },
];
export const kindNameKey = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function validKind(kind) {
  return kind && typeof kind.id === 'string' && kind.id.length > 0 && kind.id.length <= 100 && !['lesson', 'break'].includes(kind.id)
    && typeof kind.name === 'string' && kind.name === kind.name.trim() && kind.name.length > 0 && kind.name.length <= 40
    && kind.icon !== 'none' && notebookIcons.includes(kind.icon);
}
export function validKinds(kinds) {
  if (!Array.isArray(kinds)) return false;
  const ids = new Set(), names = new Set(builtInKinds.map(kind => kindNameKey(kind.name)));
  return kinds.every(kind => {
    if (!validKind(kind) || ids.has(kind.id) || names.has(kindNameKey(kind.name))) return false;
    ids.add(kind.id); names.add(kindNameKey(kind.name)); return true;
  });
}
export function createKind(name, icon, existing = []) {
  const kind = { id: crypto.randomUUID(), name: name.trim(), icon };
  if (!validKinds([...existing, kind])) throw new Error('Use um nome único de até 40 caracteres e escolha um ícone.');
  return kind;
}
export const blockKind = block => block.kind || builtInKinds.find(kind => kind.id === block.type) || builtInKinds[0];
export function customBlock(kind) {
  if (!validKind(kind)) throw new Error('Tipo de atividade inválido.');
  return { id: crypto.randomUUID(), type: 'lesson', name: kind.name, minutes: 25, kind: { ...kind } };
}
export const planBlockCount = plan => `${plan.blocks.filter(block => block.type === 'lesson').length} ${plan.blocks.some(block => block.kind) ? 'atividades' : 'aulas'}`;
