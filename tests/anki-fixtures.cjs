const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { crc32, zstdCompressSync } = require('node:zlib');
const wav = () => { const b = Buffer.alloc(48); b.write('RIFF'); b.writeUInt32LE(40, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(4, 40); return b; };

function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(filename.length, 26);
    local.push(h, filename, data); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(offset, 42); central.push(c, filename); offset += h.length + filename.length + data.length;
  }
  const tail = Buffer.alloc(22); tail.writeUInt32LE(0x06054b50); tail.writeUInt16LE(entries.length, 8); tail.writeUInt16LE(entries.length, 10); tail.writeUInt32LE(Buffer.concat(central).length, 12); tail.writeUInt32LE(offset, 16); return Buffer.concat([...local, ...central, tail]);
}
const varint = n => { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; out.push(b); } while (n); return Buffer.from(out); };
const pb = (n, v) => typeof v === 'number' ? Buffer.concat([varint(n * 8), varint(v)]) : Buffer.concat([varint(n * 8 + 2), varint(Buffer.byteLength(v)), Buffer.from(v)]);
function packageFixture(dir, modern, includeMedia = true) {
  const file = path.join(dir, 'db.sqlite'), db = new DatabaseSync(file);
  const models = { 1: { id: 1, name: 'Basic', type: 0, css: '', flds: [{ name: 'Front' }, { name: 'Back' }], tmpls: [{ name: 'Card', qfmt: '{{Front}}', afmt: '{{Back}}' }] } };
  db.exec('create table col(crt integer,conf text,models text,decks text,dconf text); create table notes(id integer,guid text,mid integer,flds text,tags text); create table cards(id integer,nid integer,did integer,ord integer,type integer,queue integer,due integer,ivl integer,factor integer,reps integer,lapses integer,left integer,odue integer,odid integer,data text); create table revlog(id integer,cid integer,ease integer,type integer,ivl integer,time integer)');
  db.prepare('insert into col values(?,?,?,?,?)').run(1792702800, '{}', JSON.stringify(models), JSON.stringify({ 1: { id: 1, name: 'Fixture', conf: 1 } }), JSON.stringify({ 1: { id: 1, name: 'Default' } }));
  db.prepare('insert into notes values(?,?,?,?,?)').run(1, 'fixture-guid', 1, 'Question [sound:sound.wav]\x1fAnswer', 'tag');
  db.exec("insert into cards values(1,1,1,0,2,2,1,3,2500,4,0,0,0,0,'{}'); insert into revlog values(1792702800000,1,3,1,3,5000)");
  if (modern) {
    db.exec('create table config(KEY text,val blob); create table deck_config(id integer,name text,config blob); create table decks(id integer,name text,common blob,kind blob); create table notetypes(id integer,name text,config blob); create table fields(ntid integer NOT NULL,ord integer NOT NULL,name text NOT NULL COLLATE BINARY,PRIMARY KEY(ntid,ord)) WITHOUT ROWID; create index idx_fields_name_ntid on fields(name,ntid); create table templates(ntid integer NOT NULL,ord integer NOT NULL,name text NOT NULL COLLATE BINARY,config blob,PRIMARY KEY(ntid,ord)) WITHOUT ROWID; create index idx_templates_name_ntid on templates(name,ntid)');
    // Missing numeric proto fields use proto defaults; required nonzero scheduler fields are supplied.
    const config = Buffer.concat([pb(9, 20), pb(10, 200), pb(16, 36500), pb(17, 1), pb(18, 1), pb(19, 4), pb(22, 8), pb(24, 60), ...[11, 12, 13, 15, 37].map((n, i) => { const b = Buffer.alloc(5); b[0] = n * 8 + 5; if (n * 8 + 5 > 255) return Buffer.concat([varint(n * 8 + 5), (() => { const f = Buffer.alloc(4); f.writeFloatLE(0.9); return f; })()]); b.writeFloatLE([2.5, 1.3, 1.2, 1, 0.9][i], 1); return b; }), pb(4, (() => { const b = Buffer.alloc(28); for (let i = 0; i < 7; i++) b.writeFloatLE(1, i * 4); return b; })())]);
    db.prepare('insert into deck_config values(?,?,?)').run(1, 'Default', config);
    db.prepare('insert into decks values(?,?,?,?)').run(1, 'Fixture', Buffer.alloc(0), pb(1, pb(1, 1)));
    db.prepare('insert into notetypes values(?,?,?)').run(1, 'Basic', Buffer.alloc(0));
    db.exec("insert into fields values(1,0,'Front'),(1,1,'Back')"); db.prepare('insert into templates values(?,?,?,?)').run(1, 0, 'Card', Buffer.concat([pb(1, '{{Front}}'), pb(2, '{{Back}}')]));
  }
  if (modern) {
    db.enableDefensive?.(false);
    db.exec("PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=replace(sql,'COLLATE BINARY','COLLATE unicase') WHERE name IN ('fields','templates'); PRAGMA writable_schema=OFF;");
  }
  db.close();
  const database = fs.readFileSync(file), data = modern ? zstdCompressSync(database) : database;
  const manifest = modern ? zstdCompressSync(pb(1, Buffer.concat([pb(1, 'sound.wav'), pb(2, wav().length)]))) : Buffer.from('{"0":"sound.wav"}');
  const members = [[modern ? 'collection.anki21b' : 'collection.anki2', data], ['media', includeMedia ? manifest : modern ? zstdCompressSync(Buffer.alloc(0)) : Buffer.from('{}')]];
  if (includeMedia) members.push(['0', modern ? zstdCompressSync(wav()) : wav()]);
  if (modern) members.push(['collection.anki2', Buffer.from('dummy: never read this')]);
  const target = path.join(dir, modern ? 'modern.colpkg' : 'legacy.apkg'); fs.writeFileSync(target, zip(members)); return target;
}
module.exports = { zip, packageFixture, wav };
