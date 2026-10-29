const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const LIMIT = 32 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
class AnkiMedia {
  constructor(profile) { this.directory = path.join(profile, 'anki-media'); }
  supports(name) { return !!TYPES[path.extname(name).toLowerCase()]; }
  file(hash) { if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Hash de mídia inválido.'); return path.join(this.directory, hash); }
  check(bytes, meta) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > LIMIT || bytes.length !== meta.size || digest(bytes) !== meta.hash || !Object.values(TYPES).includes(meta.mime)) throw new Error('Mídia Anki inválida ou incompleta.');
    const s = bytes.subarray(0, 16);
    const valid = { 'image/png': s.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'image/jpeg': s[0] === 255 && s[1] === 216,
      'image/webp': s.toString('ascii', 0, 4) === 'RIFF' && s.toString('ascii', 8, 12) === 'WEBP', 'image/gif': /^GIF8[79]a/.test(s.toString()),
      'audio/wav': s.toString('ascii', 0, 4) === 'RIFF' && s.toString('ascii', 8, 12) === 'WAVE', 'audio/ogg': s.toString('ascii', 0, 4) === 'OggS',
      'audio/flac': s.toString('ascii', 0, 4) === 'fLaC', 'audio/mp4': s.toString('ascii', 4, 8) === 'ftyp',
      'audio/mpeg': s.toString('ascii', 0, 3) === 'ID3' || (s[0] === 255 && (s[1] & 224) === 224) }[meta.mime];
    if (!valid) throw new Error('O conteúdo da mídia não corresponde ao formato declarado.');
  }
  put(bytes, name) {
    const meta = { hash: digest(bytes), size: bytes.length, mime: TYPES[path.extname(name).toLowerCase()] };
    this.check(bytes, meta); this.install(bytes, meta); return meta;
  }
  install(bytes, meta) {
    this.check(bytes, meta); const file = this.file(meta.hash); fs.mkdirSync(this.directory, { recursive: true });
    if (fs.existsSync(file) && digest(fs.readFileSync(file)) === meta.hash) return;
    const temp = file + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temp, bytes); fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  import(file) { if (fs.statSync(file).size > LIMIT) throw new Error('Mídia deve ter até 32 MiB.'); return this.put(fs.readFileSync(file), path.basename(file)); }
  read(meta) { const bytes = fs.readFileSync(this.file(meta.hash)); this.check(bytes, meta); return bytes; }
  verifyBackup(data) {
    const files = new Map();
    for (const meta of Object.values(data.anki?.media || {})) {
      if (files.has(meta.hash)) continue;
      const encoded = data.ankiFiles?.[meta.hash];
      if (typeof encoded !== 'string' || encoded.length > Math.ceil(LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Backup sem toda a mídia Anki.');
      const bytes = Buffer.from(encoded, 'base64'); this.check(bytes, meta); files.set(meta.hash, { bytes, meta });
    }
    return files;
  }
}
module.exports = { AnkiMedia, TYPES, LIMIT };
