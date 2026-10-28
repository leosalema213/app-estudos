const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const LIMIT = 200 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const formats = ['pdf', 'epub', 'mobi', 'azw', 'azw3'];
const THUMBNAIL_LIMIT = 64 * 1024;
const isWebp = bytes => bytes.length >= 16 && bytes.length <= THUMBNAIL_LIMIT && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';

// Immutable, content-addressed files. Neither original paths nor binaries enter compasso.json.
class BookFiles {
  constructor(profile) { this.directory = path.join(profile, 'books'); }
  file(hash, format = 'pdf') {
    if (!validHash(hash) || !formats.includes(format)) throw new Error('Identificador de livro inválido.');
    return path.join(this.directory, hash + '.' + (['azw', 'azw3'].includes(format) ? 'mobi' : format));
  }
  check(bytes, hash, size, format = 'pdf') {
    const signature = Buffer.isBuffer(bytes) && (format === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
      : format === 'epub' ? bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
      : formats.includes(format) && bytes.length >= 86 && bytes.subarray(60, 68).toString() === 'BOOKMOBI');
    if (!signature || bytes.length < 5 || bytes.length > LIMIT || (size !== undefined && bytes.length !== size) || (hash && digest(bytes) !== hash)) throw new Error('Livro ausente, corrompido ou acima de 200 MiB.');
    if (['mobi', 'azw', 'azw3'].includes(format)) {
      const offset = bytes.readUInt32BE(78);
      if (offset + 16 > bytes.length || bytes.readUInt16BE(offset + 12) !== 0) throw new Error('Este livro Kindle é inválido ou protegido por DRM.');
    }
  }
  put(bytes, hash = digest(bytes), format = 'pdf') {
    this.check(bytes, hash, undefined, format);
    const target = this.file(hash, format);
    fs.mkdirSync(this.directory, { recursive: true });
    if (fs.existsSync(target) && digest(fs.readFileSync(target)) === hash) return;
    const temporary = target + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  import(file) {
    const format = path.extname(file).slice(1).toLowerCase();
    if (!formats.includes(format) || fs.statSync(file).size > LIMIT) throw new Error('Escolha PDF, EPUB, MOBI, AZW ou AZW3 de até 200 MiB.');
    const bytes = fs.readFileSync(file); this.check(bytes, undefined, undefined, format);
    const hash = digest(bytes); this.put(bytes, hash, format);
    return { id: randomUUID(), title: path.basename(file, path.extname(file)).trim().slice(0, 300) || 'Livro sem título', format, hash, size: bytes.length,
      planIds: [], page: 1, pageCount: null, furthestPage: 0, completedAt: null, importedAt: new Date().toISOString(),
      view: { spread: 1, zoom: 1, contrast: 'paper' } };
  }
  read(hash, format = 'pdf') { const bytes = fs.readFileSync(this.file(hash, format)); this.check(bytes, hash, undefined, format); return bytes; }
  thumbnailFile(hash) { this.file(hash); return path.join(this.directory, 'thumbnails-v1', hash + '.webp'); }
  thumbnail(hash) {
    const file = this.thumbnailFile(hash);
    try {
      if (fs.statSync(file).size > THUMBNAIL_LIMIT) return null;
      const bytes = fs.readFileSync(file);
      return isWebp(bytes) ? `data:image/webp;base64,${bytes.toString('base64')}` : null;
    } catch { return null; }
  }
  cacheThumbnail(hash, src) {
    const file = this.thumbnailFile(hash);
    if (typeof src !== 'string' || src.length > 87500 || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) throw new Error('Miniatura inválida.');
    const bytes = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    if (!isWebp(bytes) || !fs.existsSync(this.file(hash))) throw new Error('Miniatura inválida ou livro ausente.');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  // Verify the entire portable manifest before copying anything or replacing personal metadata.
  verifyBackup(data) {
    const files = new Map();
    for (const book of data.books || []) {
      if (!validHash(book.hash) || !Number.isInteger(book.size) || book.size > LIMIT) throw new Error('Livro inválido no backup.');
      if (files.has(book.hash)) continue;
      const encoded = data.bookFiles?.[book.hash];
      if (typeof encoded !== 'string' || encoded.length > Math.ceil(LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('O backup não contém todos os arquivos dos livros.');
      const bytes = Buffer.from(encoded, 'base64'); this.check(bytes, book.hash, book.size, book.format); files.set(book.hash, bytes);
    }
    const { bookFiles, ...metadata } = data;
    return { metadata, files };
  }
  restore(verified) { for (const book of verified.metadata.books || []) this.put(verified.files.get(book.hash), book.hash, book.format); return verified.metadata; }
  export(file, data) {
    const { bookFiles, ...metadata } = data;
    const temporary = file + '.' + randomUUID() + '.tmp';
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx');
      const json = JSON.stringify(metadata);
      fs.writeSync(descriptor, json.slice(0, -1));
      if (metadata.books?.length) {
        fs.writeSync(descriptor, ',"bookFiles":{');
        const seen = new Set();
        for (const book of metadata.books) {
          if (seen.has(book.hash)) continue;
          const bytes = this.read(book.hash, book.format); this.check(bytes, book.hash, book.size, book.format);
          fs.writeSync(descriptor, (seen.size ? ',' : '') + JSON.stringify(book.hash) + ':"');
          // Chunk multiples of three keep base64 padding only at the end.
          for (let offset = 0; offset < bytes.length; offset += 3 * 1024 * 1024) fs.writeSync(descriptor, bytes.subarray(offset, offset + 3 * 1024 * 1024).toString('base64'));
          fs.writeSync(descriptor, '"'); seen.add(book.hash);
        }
        fs.writeSync(descriptor, '}');
      }
      fs.writeSync(descriptor, '}'); fs.closeSync(descriptor); descriptor = undefined;
      fs.renameSync(temporary, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}
module.exports = { BookFiles, LIMIT, digest };
