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
  return doc.content.filter(node => node.type === 'paragraph').map(node => (node.content || []).map(part => part.type === 'hardBreak' ? '\n' : part.text).join('')).join('\n').trimEnd();
}
export function documentImages(note) {
  return note.document ? note.document.content.filter(node => node.type === 'image').map(node => node.attrs.src) : note.images;
}
export function validNoteDocument(doc) {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content) || !doc.content.length) return false;
  return doc.content.every(node => {
    if (!node || node.marks?.length) return false;
    if (node.type === 'image') return isNoteImage(node.attrs?.src) && !node.content;
    if (node.type !== 'paragraph') return false;
    return node.content === undefined || (Array.isArray(node.content) && node.content.every(part => part && !part.marks?.length && !part.content && ((part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) || part.type === 'hardBreak')));
  });
}
