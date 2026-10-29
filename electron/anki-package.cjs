const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inflateRawSync, zstdDecompressSync, crc32 } = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const LIMIT = 512 * 1024 * 1024;

// Read members without extracting user-supplied paths. Bound both compressed and expanded data.
function archive(bytes) {
  if (bytes.length > LIMIT) throw new Error('Pacote Anki excede 512 MiB.');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw new Error('Pacote ZIP inválido.');
  const count = bytes.readUInt16LE(end + 10), entries = new Map();
  let cursor = bytes.readUInt32LE(end + 16), total = 0;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Diretório ZIP inválido.');
    const method = bytes.readUInt16LE(cursor + 10), size = bytes.readUInt32LE(cursor + 24), compressed = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28), name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    total += size;
    if (total > LIMIT || entries.has(name) || bytes.readUInt16LE(cursor + 8) & 1) throw new Error('Pacote excede os limites, é criptografado ou tem entradas duplicadas.');
    entries.set(name, { method, size, compressed, crc: bytes.readUInt32LE(cursor + 16), offset: bytes.readUInt32LE(cursor + 42) });
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  return { has: name => entries.has(name), read(name) {
    const e = entries.get(name); if (!e) throw new Error(`Arquivo ausente no pacote: ${name}`);
    if (bytes.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('Entrada ZIP inválida.');
    const start = e.offset + 30 + bytes.readUInt16LE(e.offset + 26) + bytes.readUInt16LE(e.offset + 28);
    const raw = bytes.subarray(start, start + e.compressed);
    const out = e.method === 0 ? raw : e.method === 8 ? inflateRawSync(raw, { maxOutputLength: LIMIT }) : null;
    if (!out || out.length !== e.size || crc32(out) !== e.crc) throw new Error('Compressão ZIP não suportada ou entrada incompleta.');
    return out;
  } };
}

// Minimal wire decoder: data only, no generated Anki code or executable templates.
function proto(bytes) {
  const result = {}; let i = 0;
  const integer = () => { let n = 0, shift = 0; for (let j = 0; j < 10; j++) { if (i >= bytes.length) throw new Error('Protobuf incompleto.'); const b = bytes[i++]; n += (b & 127) * 2 ** shift; if (!(b & 128)) return n; shift += 7; } throw new Error('Protobuf inválido.'); };
  while (i < bytes.length) {
    const tag = integer(), wire = tag & 7, field = Math.floor(tag / 8); let value;
    if (wire === 0) value = integer();
    else if (wire === 2) { const length = integer(); if (i + length > bytes.length) throw new Error('Protobuf incompleto.'); value = bytes.subarray(i, i + length); i += length; }
    else if (wire === 5) { value = bytes.readFloatLE(i); i += 4; }
    else if (wire === 1) { value = bytes.readDoubleLE(i); i += 8; }
    else throw new Error('Wire Protobuf não suportado.');
    (result[field] ||= []).push(value);
  }
  return result;
}
const first = (p, n, fallback = 0) => p[n]?.[0] ?? fallback;
const text = (p, n) => Buffer.from(first(p, n, [])).toString();
const floats = (p, n) => (p[n] || []).flatMap(value => Buffer.isBuffer(value) ? Array.from({ length: value.length / 4 }, (_, i) => value.readFloatLE(i * 4)) : [value]);
function withDatabase(file, read) {
  const zip = archive(fs.readFileSync(file));
  const modern = zip.has('collection.anki21b');
  const raw = zip.read(modern ? 'collection.anki21b' : zip.has('collection.anki21') ? 'collection.anki21' : 'collection.anki2');
  const bytes = modern ? zstdDecompressSync(raw, { maxOutputLength: LIMIT }) : raw;
  if (bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('Coleção SQLite inválida.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-anki-'));
  let db;
  try {
    const target = path.join(dir, 'collection.sqlite'); fs.writeFileSync(target, bytes);
    db = new DatabaseSync(target, { readOnly: true, allowExtension: false });
    // Anki defines a custom text collation absent from Node/Electron SQLite. Recent
    // SQLite versions reject even numeric lookups on affected WITHOUT ROWID tables.
    // Normalize ONLY the disposable copy, then reopen it read-only. Text indexes
    // retain their original ordering, so field/template lookups bypass them below.
    const customCollation = db.prepare("select sql from sqlite_master where sql is not null").all().some(row => /\bcollate\s+(?:unicase|"unicase"|`unicase`|\[unicase\])/i.test(row.sql));
    if (customCollation) {
      db.close(); db = null;
      const copy = new DatabaseSync(target, { allowExtension: false });
      try {
        copy.enableDefensive?.(false);
        copy.function('organon_read_collation', sql => sql.replace(/\bcollate\s+(?:"unicase"|`unicase`|\[unicase\]|unicase\b)/gi, 'COLLATE BINARY'));
        copy.exec('PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=organon_read_collation(sql) WHERE sql IS NOT NULL; PRAGMA writable_schema=OFF;');
      } finally { copy.close(); }
      db = new DatabaseSync(target, { readOnly: true, allowExtension: false });
    }
    return read(db, zip, modern);
  } finally { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
function modernOptions(bytes) {
  const p = proto(Buffer.from(bytes)), out = {};
  const numbers = { newPerDay: 9, reviewsPerDay: 10, initialEase: 11, easyBonus: 12, hardInterval: 13, newInterval: 14, intervalModifier: 15, maxInterval: 16, minInterval: 17, graduating: 18, easyInterval: 19, insertion: 20, leechThreshold: 22, maxAnswerSeconds: 24, newMix: 30, interdayMix: 31, newSort: 32, reviewOrder: 33, gather: 34, questionAction: 36, retention: 37, questionSeconds: 41, answerSeconds: 42, answerAction: 43 };
  for (const [key, field] of Object.entries(numbers)) out[key] = first(p, field);
  for (const [key, field] of Object.entries({ showTimer: 25, skipQuestion: 26, buryNew: 27, buryReview: 28, buryInterday: 29, stopTimer: 38, waitAudio: 44 })) out[key] = !!first(p, field);
  out.autoplay = !first(p, 23); out.leechAction = first(p, 21) === 1 ? 'tag' : 'suspend';
  out.learnSteps = floats(p, 1); out.relearnSteps = floats(p, 2); out.easyDays = floats(p, 4).length === 7 ? floats(p, 4) : [1, 1, 1, 1, 1, 1, 1];
  if (!p[37]) out.retention = 0.9;
  out.weights = floats(p, 6).length ? floats(p, 6) : floats(p, 5).length ? floats(p, 5) : floats(p, 3);
  out.sourceConfig = Buffer.from(bytes).toString('base64');
  return out;
}
function legacyOptions(c) {
  return { newPerDay: c.new?.perDay ?? 20, reviewsPerDay: c.rev?.perDay ?? 200, learnSteps: c.new?.delays || [1, 10], relearnSteps: c.lapse?.delays || [10],
    graduating: c.new?.ints?.[0] || 1, easyInterval: c.new?.ints?.[1] || 4, initialEase: (c.new?.initialFactor || 2500) / 1000,
    easyBonus: c.rev?.ease4 ?? 1.3, hardInterval: c.rev?.hardFactor ?? 1.2, intervalModifier: c.rev?.ivlFct ?? 1, newInterval: c.lapse?.mult ?? 0,
    maxInterval: c.rev?.maxIvl || 36500, minInterval: c.lapse?.minInt || 1, leechThreshold: c.lapse?.leechFails ?? 8,
    leechAction: c.lapse?.leechAction === 0 ? 'suspend' : 'tag', autoplay: c.autoplay !== false, skipQuestion: c.replayq === false,
    buryNew: !!c.new?.bury, buryReview: !!c.rev?.bury, insertion: c.new?.order === 0 ? 1 : 0, sourceConfig: c };
}
function importPackage(file, mediaFiles, externalMedia) {
  if (!/\.(apkg|colpkg)$/i.test(file)) throw new Error('Selecione um arquivo .apkg ou .colpkg.');
  return withDatabase(file, (db, zip, modern) => {
    const col = db.prepare('select * from col').get(), has = name => !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name);
    const modernSchema = has('notetypes'), globals = modernSchema ? Object.fromEntries(db.prepare('select KEY,val from config').all().map(x => [x.KEY, JSON.parse(Buffer.from(x.val).toString())])) : JSON.parse(col.conf || '{}');
    const rollover = globals.rollover ?? 4, warnings = new Set();
    const prefix = 'anki:' + col.crt + ':', id = x => prefix + x;
    const settings = { fsrs: !!(globals.fsrs || globals.fsrsEnabled), rollover, newIgnoreReview: !!globals.newCardsIgnoreReviewLimit, limitsFromTop: !!globals.applyAllParentLimits, source: globals };
    const presets = modernSchema ? db.prepare('select * from deck_config').all().map(c => ({ id: id('preset:' + c.id), name: c.name, options: modernOptions(c.config) })) : Object.values(JSON.parse(col.dconf || '{}')).map(c => ({ id: id('preset:' + c.id), name: c.name, options: legacyOptions(c) }));
    const decks = modernSchema ? db.prepare('select * from decks').all().map(d => {
      const kind = proto(Buffer.from(d.kind)), normal = proto(first(kind, 1, Buffer.alloc(0))), common = proto(Buffer.from(d.common));
      if (kind[2]) warnings.add('Baralhos filtrados: cards retornam ao baralho original quando disponível.');
      const options = {}; if (normal[6]) options.reviewsPerDay = first(normal, 6); if (normal[7]) options.newPerDay = first(normal, 7);
      return { id: id(d.id), name: d.name.replaceAll('\x1f', '::'), presetId: id('preset:' + first(normal, 1, 1)), options, source: { kind: Buffer.from(d.kind).toString('base64'), common: Buffer.from(d.common).toString('base64') }, sourceDaily: { day: first(common, 3), new: first(common, 4), review: first(common, 5) } };
    }) : Object.values(JSON.parse(col.decks || '{}')).map(d => ({ id: id(d.id), name: d.name, presetId: id('preset:' + (d.conf || 1)), source: d }));
    const models = modernSchema ? db.prepare('select * from notetypes').all().map(m => {
      const p = proto(Buffer.from(m.config));
      return { id: id('model:' + m.id), name: m.name, kind: first(p, 1), css: text(p, 3), sourceConfig: Buffer.from(m.config).toString('base64'),
        fields: db.prepare('select name from fields NOT INDEXED where ntid=? order by ord').all(m.id).map(f => f.name),
        templates: db.prepare('select * from templates NOT INDEXED where ntid=? order by ord').all(m.id).map(t => { const p = proto(Buffer.from(t.config)); return { name: t.name, q: text(p, 1), a: text(p, 2) }; }) };
    }) : Object.values(JSON.parse(col.models || '{}')).map(m => ({ id: id('model:' + m.id), name: m.name, kind: m.type, css: m.css || '', fields: m.flds.map(f => f.name), templates: m.tmpls.map(t => ({ name: t.name, q: t.qfmt, a: t.afmt })) }));
    const notes = db.prepare('select * from notes').all().map(n => ({ id: id('note:' + n.id), guid: n.guid, modelId: id('model:' + n.mid), fields: n.flds.split('\x1f'), tags: n.tags.trim().split(/\s+/).filter(Boolean), source: n }));
    const logs = db.prepare('select * from revlog order by id').all(), last = new Map(); for (const l of logs) last.set(l.cid, l.id);
    const origin = new Date(col.crt * 1000); origin.setHours(rollover, 0, 0, 0);
    const dueDay = day => { const date = new Date(origin); date.setDate(date.getDate() + day); return date.getTime(); };
    const cards = db.prepare('select * from cards').all().map(c => {
      const note = notes.find(n => n.id === id('note:' + c.nid)), model = models.find(m => m.id === note?.modelId), template = model?.templates[model.kind === 1 ? 0 : c.ord];
      const unsupported = !template || /image-occlusion/i.test(template.q) || [...((template?.q || '') + (template?.a || '')).matchAll(/\{\{([^}]+):([^}]+)\}\}/g)].some(m => !['cloze', 'text', 'type'].includes(m[1])) ? 'Modelo de carta requer recurso ainda não compatível (oclusão, TTS ou filtro personalizado).' : null;
      if (unsupported) warnings.add(unsupported);
      if (template && /<script\b|\bon\w+\s*=/i.test(template.q + template.a)) warnings.add('Scripts e eventos dos modelos de carta foram desativados. Revise a aparência antes de estudar.');
      let data = {}; try { data = JSON.parse(c.data || '{}'); } catch { /* preserved below */ }
      const due = c.odid ? c.odue : c.due, state = c.type === 0 ? 0 : c.type === 1 ? 1 : c.type === 3 ? 3 : 2;
      return { id: id('card:' + c.id), noteId: id('note:' + c.nid), deckId: id(c.odid || c.did), ord: c.ord, position: c.id, state,
        due: state === 0 ? 0 : (c.queue === 1 || (c.queue < 0 && due > 1000000000)) ? due * 1000 : dueDay(due), interval: Math.max(0, c.ivl), ease: c.factor > 0 ? c.factor / 1000 : 2.5,
        reps: c.reps, lapses: c.lapses, step: Math.max(0, (state === 3 ? 1 : 2) - c.left % 1000), suspended: c.queue === -1,
        ...(c.queue < -1 ? { buriedUntil: dueDay(Math.floor((Date.now() - origin) / 86400000) + 1) } : {}),
        ...(last.has(c.id) ? { lastReview: last.get(c.id) } : {}), ...(data.s && data.d ? { fsrs: { stability: data.s, difficulty: data.d } } : {}), unsupported, source: c };
    });
    const reviews = logs.map(l => ({ id: id('review:' + l.id), cardId: id('card:' + l.cid), at: l.id, rating: l.ease, previousState: l.type === 0 ? 1 : l.type === 2 ? 3 : 2, interval: l.ivl, elapsedMs: l.time, source: l }));
    const media = {}, manifest = zip.has('media') ? zip.read('media') : null; let decodedMediaBytes = 0;
    const addMedia = (name, bytes) => { decodedMediaBytes += bytes.length; if (decodedMediaBytes > LIMIT) throw new Error('Mídia expandida excede 512 MiB por importação.'); media[name] = mediaFiles.put(bytes, name); };
    let names = [];
    if (manifest) {
      if (modern) names = (proto(zstdDecompressSync(manifest, { maxOutputLength: LIMIT }))[1] || []).map((entry, index) => { const p = proto(entry); return [String(first(p, 255, index)), text(p, 1)]; });
      else names = Object.entries(JSON.parse(manifest.toString()));
    }
    for (const [member, name] of names) {
      if (!mediaFiles.supports(name)) { warnings.add('Mídia não compatível foi preservada apenas no pacote original (ex.: vídeo, SVG, fontes).'); continue; }
      const bytes = zip.read(member); addMedia(name, modern ? zstdDecompressSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }) : bytes);
    }
    // Backups automaticos do Anki não contêm mídia. A pasta é escolhida explicitamente no diálogo.
    const required = new Set();
    for (const n of notes) for (const field of n.fields) {
      for (const match of field.matchAll(/\[sound:([^\]]+)\]|<(?:img|audio|source)\b[^>]*?src\s*=\s*["']([^"']+)["']/gi)) required.add(match[1] || match[2]);
    }
    for (const name of required) {
      if (media[name]) continue;
      if (externalMedia && path.basename(name) === name && mediaFiles.supports(name)) {
        const source = path.join(externalMedia, name);
        if (fs.existsSync(source) && fs.lstatSync(source).isFile() && !fs.lstatSync(source).isSymbolicLink()) { const size = fs.statSync(source).size; if (size > 32 * 1024 * 1024 || decodedMediaBytes + size > LIMIT) throw new Error('Mídia excede 32 MiB por recurso ou 512 MiB por importação.'); addMedia(name, fs.readFileSync(source)); continue; }
      }
      warnings.add('Há mídia ausente ou não suportada. Selecione collection.media ou importe um pacote exportado com mídia.');
    }
    // Name collisions across independent packages must never play a different file.
    const sourceMedia = Object.fromEntries(Object.entries(media).map(([name, meta]) => [name, meta.hash + path.extname(name).toLowerCase()]));
    function remap(source) {
      return source.replace(/\[sound:([^\]]+)\]/g, (token, name) => sourceMedia[name] ? `[sound:${sourceMedia[name]}]` : token)
        .replace(/(\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (token, before, name, after) => { let decoded = name; try { decoded = decodeURIComponent(name); } catch { /* literal */ } return sourceMedia[decoded] ? before + sourceMedia[decoded] + after : token; });
    }
    for (const n of notes) n.fields = n.fields.map(remap);
    for (const m of models) { m.sourceTemplates = m.templates; m.templates = m.templates.map(t => ({ ...t, q: remap(t.q), a: remap(t.a) })); }
    const canonicalMedia = Object.fromEntries(Object.entries(media).map(([name, meta]) => [sourceMedia[name], meta]));
    return { collection: { version: 1, decks, notes, cards, models, presets, media: canonicalMedia, sourceMedia: { [prefix]: sourceMedia }, reviews, settings }, warnings: [...warnings], sourceHash: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  });
}
module.exports = { archive, proto, first, text, floats, withDatabase, importPackage, modernOptions, LIMIT };
