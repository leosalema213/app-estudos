const fields = { Front: 'Frente', Back: 'Verso', Text: 'Texto', 'Back Extra': 'Complemento', 'Add Reverse': 'Adicionar inversa', Header: 'Cabeçalho', Image: 'Imagem', Occlusion: 'Oclusão', Comments: 'Comentários' };
const models = { Basic: 'Básico', 'Basic (and reversed card)': 'Básico e invertido', 'Basic (optional reversed card)': 'Básico com inversa opcional', 'Basic (type in the answer)': 'Básico com resposta digitada', Cloze: 'Omissão de texto', 'Omissão (cloze)': 'Omissão de texto', 'Image Occlusion': 'Oclusão de imagem' };
export const fieldLabel = name => Object.hasOwn(fields, name) ? fields[name] : name;
export const modelLabel = name => Object.hasOwn(models, name) ? models[name] : name;
export const presetLabel = name => name.replace(/^Default(?=$| \(\d+\)$)/i, 'Padrão');
export function presetLabels(presets) {
  const used = new Set();
  return new Map(presets.map(p => { const base = presetLabel(p.name); let label = base, i = 2; while (used.has(label.toLocaleLowerCase())) label = `${base} (${i++})`; used.add(label.toLocaleLowerCase()); return [p.id, label]; }));
}
