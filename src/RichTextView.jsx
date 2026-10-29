import React from 'react';
import { fontSizes, validNoteDocument } from './note-document.js';
import { textColor } from './text-format.js';
import './rich-text.css';

export default function RichTextView({ document: doc }) {
  if (!validNoteDocument(doc)) return null;
  function render(node, key) {
    if (node.type === 'text') return <React.Fragment key={key}>{(node.marks || []).reduce((text, mark, i) => {
      if (['bold', 'italic', 'underline'].includes(mark.type)) return React.createElement({ bold: 'strong', italic: 'em', underline: 'u' }[mark.type], { key: i }, text);
      const style = mark.type === 'textColor' ? { color: textColor(mark.attrs.color) } : { fontSize: fontSizes.includes(mark.attrs?.size) ? `${mark.attrs.size}px` : undefined };
      return <span key={i} style={style}>{text}</span>;
    }, node.text)}</React.Fragment>;
    if (node.type === 'hardBreak') return <br key={key} />;
    const tag = { doc: 'div', paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li' }[node.type] || (node.type === 'heading' ? `h${node.attrs.level}` : null);
    return tag ? React.createElement(tag, { key, ...(node.type === 'orderedList' && node.attrs?.start ? { start: node.attrs.start } : {}) }, node.content?.map(render)) : null;
  }
  return <div className="rich-text-view">{doc.content.map(render)}</div>;
}
