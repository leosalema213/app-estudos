import { textColor } from './text-format.js';

export function renderTemplate(model, note, card, back = false, typed = '') {
  const fields = Object.fromEntries(model.fields.map((name, i) => [name, note.fields[i] || '']));
  const cloze = (value, answer) => value.replace(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/gi, (_, number, content, hint) => Number(number) === card.ord + 1 ? answer ? `<strong class="cloze">${content}</strong>` : `<strong class="cloze">[${hint || '…'}]</strong>` : content);
  const expand = (template, front = '') => {
    let result = template;
    for (let i = 0; i < 10 && /\{\{[#^]/.test(result); i++) result = result.replace(/\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, op, name, body) => (!!fields[name]?.trim() === (op === '#')) ? body : '');
    return result.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
      if (token === 'FrontSide') return front;
      if (token === 'Tags') return note.tags.join(' ');
      if (token.startsWith('cloze:')) return cloze(fields[token.slice(6)] || '', back);
      if (token.startsWith('text:')) return (fields[token.slice(5)] || '').replace(/<[^>]*>/g, '');
      if (token.startsWith('type:')) return back ? `<div>Você escreveu: ${escapeHtml(typed)}</div><div>Resposta: ${fields[token.slice(5)] || ''}</div>` : '<div>Digite a resposta no campo abaixo.</div>';
      return fields[token] || '';
    });
  };
  const template = model.templates[model.kind === 1 ? 0 : card.ord];
  if (!template) return 'Modelo de carta indisponível.';
  const front = expand(template.q);
  return back ? expand(template.a, front) : front;
}
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function cardDocument(html, css, media, dark, loadMedia) {
  html = html.replace(/\[sound:([^\]]+)\]/g, (_, name) => { const decoded = new DOMParser().parseFromString(`<textarea>${name.replace(/</g, '&lt;')}</textarea>`, 'text/html').body.textContent; return `<audio data-anki-name="${escapeHtml(decoded)}"></audio>`; });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set('DIV SPAN P BR HR STRONG B EM I U S SMALL SUB SUP H1 H2 H3 H4 H5 H6 UL OL LI TABLE THEAD TBODY TR TD TH BLOCKQUOTE PRE CODE IMG AUDIO SOURCE RUBY RT RP'.split(' '));
  const dangerous = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM INPUT BUTTON TEXTAREA SELECT BASE META LINK TEMPLATE'.split(' '));
  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (!allowed.has(el.tagName)) { if (dangerous.has(el.tagName)) el.remove(); else el.replaceWith(...el.childNodes); continue; }
    const original = Object.fromEntries([...el.attributes].map(a => [a.name, a.value]));
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
    for (const key of ['class', 'title', 'alt', 'colspan', 'rowspan']) if (original[key]) el.setAttribute(key, original[key].slice(0, 500));
    if (original.style && !/url\s*\(|@|expression|behavior|binding/i.test(original.style)) el.setAttribute('style', original.style);
    if (dark) for (const property of Array.from(el.style)) if (property === 'color' || property.startsWith('background')) el.style.removeProperty(property);
    const chosenColor = textColor(original['data-organon-color']);
    if (chosenColor) { el.setAttribute('data-organon-color', chosenColor); el.style.setProperty('color', chosenColor, 'important'); }
    if (['IMG', 'AUDIO', 'SOURCE'].includes(el.tagName)) {
      let name = original['data-anki-name'] || original.src || (el.tagName === 'AUDIO' ? el.querySelector('source')?.getAttribute('src') : '') || ''; try { name = decodeURIComponent(name); } catch { /* literal name */ }
      const meta = Object.hasOwn(media, name) ? media[name] : null;
      if (meta && (el.tagName === 'IMG' ? meta.mime.startsWith('image/') : meta.mime.startsWith('audio/'))) {
        el.setAttribute('src', await loadMedia(meta));
        if (el.tagName === 'AUDIO') {
          el.setAttribute('preload', 'metadata'); el.replaceChildren();
          el.id = `organon-audio-${doc.querySelectorAll('[data-anki-play]').length}`;
          const button = doc.createElement('button'); button.type = 'button'; button.className = 'anki-inline-play'; button.setAttribute('aria-label', 'Reproduzir áudio'); button.title = 'Reproduzir áudio'; button.dataset.ankiPlay = el.id; button.textContent = '▶'; el.after(button);
        }
      } else { el.replaceWith(doc.createTextNode(`[Mídia ausente: ${name}]`)); }
    }
  }
  // Imported CSS is confined to a scriptless frame; remove resource loaders as an extra boundary.
  css = String(css || '').replace(/@import[^;]*;?/gi, '').replace(/url\s*\([^)]*\)/gi, 'none').replace(/<\/?style[^>]*>/gi, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:${dark ? 'dark' : 'light'}}body{margin:12px;font:18px/1.6 'Segoe UI',Arial,sans-serif;text-align:center;color:${dark ? '#eee' : '#242424'};background:transparent;overflow-wrap:anywhere}img{max-width:100%;height:auto}.cloze{color:inherit;font-weight:650}pre{white-space:pre-wrap}${css}${dark ? 'html,body.card{background:transparent!important;color:#ededed!important}body.card *{background-color:transparent!important;color:inherit!important}' : ''}body.card{font-size:22px!important;line-height:1.65}audio{display:none!important}.anki-inline-play{display:inline-flex!important;align-items:center;justify-content:center;vertical-align:middle;position:relative;top:-2px;margin:0 7px;padding:0;width:28px;height:28px;border:1px solid ${dark ? '#444' : '#ddd'};border-radius:50%;background:transparent;color:inherit;font:12px 'Segoe UI',sans-serif;cursor:pointer}.anki-inline-play:hover{background:${dark ? '#ffffff12' : '#00000009'}}.anki-inline-play:focus-visible{outline:2px solid currentColor;outline-offset:3px}</style></head><body class="card">${doc.body.innerHTML}</body></html>`;
}
