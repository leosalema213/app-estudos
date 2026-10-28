import { EPUB } from 'foliate-js/epub.js';
import { MOBI } from 'foliate-js/mobi.js';
import { unzlibSync } from 'foliate-js/vendor/fflate.js';
import { ZipReader, BlobReader, TextWriter, BlobWriter, configure } from 'foliate-js/vendor/zip.js';
import { SectionProgress } from 'foliate-js/progress.js';
import * as CFI from 'foliate-js/epubcfi.js';
import 'foliate-js/paginator.js';

// Book documents never execute code or load external resources. These restrictions
// are applied before a document is given to the paginator, not after iframe load.
function safeDocument(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  for (const element of doc.querySelectorAll('script,iframe,object,embed,base,form,meta[http-equiv]')) element.remove();
  for (const element of doc.querySelectorAll('*')) for (const attr of [...element.attributes]) {
    if (/^on/i.test(attr.name) || attr.name === 'srcdoc' || (/^(href|src|action|formaction)$/i.test(attr.name) && /^\s*(javascript|vbscript):/i.test(attr.value))) element.removeAttribute(attr.name);
  }
  const policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  doc.head.prepend(policy);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

export async function parseEbook(bytes, format) {
  const file = new File([bytes], 'book.' + format);
  let book, archive;
  if (format === 'epub') {
    configure({ useWebWorkers: false });
    archive = new ZipReader(new BlobReader(file));
    const entries = await archive.getEntries();
    if (entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > 512 * 1024 * 1024 || entries.some(entry => entry.encrypted || entry.uncompressedSize > 64 * 1024 * 1024)) throw new Error('EPUB protegido ou com recursos acima do limite.');
    const map = new Map(entries.map(entry => [entry.filename, entry]));
    book = await new EPUB({ loadText: name => map.get(name)?.getData(new TextWriter()),
      loadBlob: (name, type) => map.get(name)?.getData(new BlobWriter(type)),
      getSize: name => map.get(name)?.uncompressedSize || 0 }).init();
  } else book = await new MOBI({ unzlib: unzlibSync }).open(file);
  if (book.rendition?.layout === 'pre-paginated') { book.destroy?.(); await archive?.close(); throw new Error('EPUB de layout fixo ainda não é suportado. Use PDF para esse tipo de livro.'); }
  if (!book.sections?.length) throw new Error('O livro não contém seções de leitura.');
  const urls = new Set(), destroy = book.destroy?.bind(book);
  book.sections = book.sections.map(section => {
    let safeUrl;
    return { ...section, load: async () => {
      if (safeUrl) return safeUrl;
      const original = await section.load();
      if (typeof original !== 'string' || !original.startsWith('blob:')) throw new Error('Recurso externo de livro não permitido.');
      safeUrl = URL.createObjectURL(new Blob([safeDocument(await (await fetch(original)).text())], { type: 'text/html' }));
      urls.add(safeUrl); return safeUrl;
    }, unload: () => {
      if (safeUrl) { URL.revokeObjectURL(safeUrl); urls.delete(safeUrl); safeUrl = null; }
      section.unload?.();
    } };
  });
  book.destroy = () => { for (const url of urls) URL.revokeObjectURL(url); destroy?.(); archive?.close(); };
  return book;
}

export function createEbookEngine(book, host, { relocate, keydown, wheel, error }) {
  const renderer = document.createElement('foliate-paginator');
  const progress = new SectionProgress(book.sections, 1500, 1600);
  let location, last, configuring = false, navigating = false, destroyed = false, queue = Promise.resolve();
  const resolve = cfi => {
    if (book.resolveCFI) return book.resolveCFI(cfi);
    const parts = CFI.parse(cfi), index = CFI.fake.toIndex((parts.parent ?? parts).shift());
    return { index, anchor: doc => CFI.toRange(doc, parts) };
  };
  const run = fn => { queue = queue.catch(() => {}).then(() => !destroyed && fn()).catch(err => { if (!destroyed) error(err.message); }); return queue; };
  renderer.addEventListener('relocate', ({ detail }) => {
    const { index, range, fraction = 0, size = 0, reason } = detail;
    const base = book.sections[index]?.cfi || CFI.fake.fromIndex(index);
    if (!location || navigating || ['page', 'scroll', 'snap'].includes(reason)) location = range ? CFI.collapse(CFI.joinIndir(base, CFI.fromRange(range))) : base;
    const value = progress.getProgress(index, fraction).fraction;
    const end = progress.getProgress(index, fraction, size).fraction;
    const bounded = number => Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0));
    last = { location, fraction: bounded(value), furthestFraction: bounded(end), section: index };
    if (!configuring) relocate(last);
  });
  renderer.addEventListener('load', ({ detail: { doc, index } }) => {
    doc.defaultView.frameElement?.setAttribute('sandbox', 'allow-same-origin');
    doc.addEventListener('keydown', keydown); doc.addEventListener('wheel', wheel, { passive: false });
    doc.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]'); if (!link) return;
      event.preventDefault();
      const href = book.sections[index]?.resolveHref?.(link.getAttribute('href')) || link.getAttribute('href');
      if (/^(?:https?:|file:|data:|javascript:|\/\/)/i.test(href)) return;
      run(async () => { const target = await book.resolveHref?.(href); if (target) { navigating = true; try { await renderer.goTo(target); } finally { navigating = false; } } });
    });
  });
  host.append(renderer);
  return {
    renderer,
    open: async (view, saved) => {
      configuring = true;
      location = saved || null;
      renderer.open(book);
      renderer.setAttribute('max-column-count', view.spread);
      renderer.setAttribute('max-inline-size', '720px');
      renderer.setAttribute('max-block-size', '1440px');
      renderer.setAttribute('gap', '5%');
      renderer.setStyles?.(styles(view));
      await renderer.goTo(saved ? resolve(saved) : { index: 0 });
      if (saved && last) { location = saved; last.location = saved; }
      configuring = false; if (last) relocate(last);
    },
    configure: view => run(async () => {
      const anchor = location; configuring = true;
      renderer.setAttribute('max-column-count', view.spread);
      renderer.setStyles?.(styles(view));
      await new Promise(requestAnimationFrame);
      if (anchor) await renderer.goTo(resolve(anchor));
      if (anchor && last) { location = anchor; last.location = anchor; }
      configuring = false; if (last) relocate(last);
    }),
    next: () => run(() => renderer.next()), prev: () => run(() => renderer.prev()),
    jump: value => run(async () => { const [index, anchor] = progress.getSection(value); navigating = true; try { await renderer.goTo({ index, anchor }); } finally { navigating = false; } }),
    destroy: () => { destroyed = true; try { renderer.destroy(); } catch {} renderer.remove(); book.destroy(); },
  };
}

function styles(view) {
  const background = view.contrast === 'night' ? '#181818' : view.contrast === 'sepia' ? '#f3e7cf' : '#fff';
  const color = view.contrast === 'night' ? '#e8e8e8' : '#292929';
  return `html{font-size:${view.fontSize || 20}px!important;color:${color}!important;background:${background}!important;color-scheme:${view.contrast === 'night' ? 'dark' : 'light'}}body{font-size:1rem!important;line-height:1.65!important;color:inherit!important;background:inherit!important}p,li{color:inherit!important}a{color:inherit}`;
}
