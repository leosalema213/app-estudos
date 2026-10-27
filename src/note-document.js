export const isNoteImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

// Legacy notes keep their text and attachments, in the order previously displayed.
export function noteDocument(note) {
  if (note.document) return note.document;
  const content = note.text.split('\n').map(text => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }));
  for (const src of note.images) content.push({ type: 'image', attrs: { src } });
  if (note.images.length) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}
export function documentText(doc) {
  const text = node => node.type === 'text' ? node.text : node.type === 'hardBreak' ? '\n' : (node.content || []).filter(child => child.type !== 'image').map(text).join(['doc', 'bulletList', 'orderedList', 'listItem'].includes(node.type) ? '\n' : '');
  return text(doc).trimEnd();
}
export function documentImages(note) {
  if (!note.document) return note.images;
  const images = [];
  const visit = node => { if (node.type === 'image') images.push(node.attrs.src); for (const child of node.content || []) visit(child); };
  visit(note.document); return images;
}
export function validNoteDocument(doc) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content) || !doc.content.length) return false;
  const inline = part => part && !part.content && ((part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) || part.type === 'hardBreak') && (!part.marks || (Array.isArray(part.marks) && part.marks.every(mark => mark && (['bold', 'italic'].includes(mark.type) || (mark.type === 'fontSize' && fontSizes.includes(mark.attrs?.size))))));
  const block = (node, depth = 0) => {
    if (!node || depth > 256 || node.marks?.length) return false;
    if (node.type === 'image') return isNoteImage(node.attrs?.src) && !node.content;
    if (['paragraph', 'heading'].includes(node.type)) return (node.type !== 'heading' || [1, 2, 3].includes(node.attrs?.level)) && (node.content === undefined || (Array.isArray(node.content) && node.content.every(inline)));
    if (['bulletList', 'orderedList'].includes(node.type)) return (node.type !== 'orderedList' || node.attrs?.start === undefined || Number.isSafeInteger(node.attrs.start)) && Array.isArray(node.content) && node.content.length > 0 && node.content.every(child => child?.type === 'listItem' && block(child, depth + 1));
    return node.type === 'listItem' && Array.isArray(node.content) && node.content.length > 0 && node.content[0].type === 'paragraph' && node.content.every(child => child.type !== 'listItem' && block(child, depth + 1));
  };
  return doc.content.every(node => node?.type !== 'listItem' && block(node));
}
export const fontSizes = ['12', '14', '16', '18', '20', '24', '28', '32'];
export function documentHeadings(doc) {
  const headings = [];
  const visit = node => { if (node.type === 'heading') headings.push({ level: node.attrs.level, text: (node.content || []).map(n => n.text || '').join('') }); for (const child of node.content || []) visit(child); };
  if (doc) visit(doc);
  return headings;
}
