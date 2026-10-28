"""Generate small, original EPUB and uncompressed MOBI fixtures; no external books."""
from pathlib import Path
import struct
import zipfile

root = Path(__file__).parent / 'fixtures'
root.mkdir(exist_ok=True)
chapters = []
for chapter in range(1, 5):
    paragraphs = ''.join(f'<p id="p{line}">Chapter {chapter}, paragraph {line}. Original Organon reading fixture. '
                         'Font changes must preserve the text position and offline reading progress.</p>' for line in range(1, 101))
    chapters.append(f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter {chapter}</title></head>'
                    f'<body><h1>Chapter {chapter}</h1>{paragraphs}</body></html>')

with zipfile.ZipFile(root / 'reading.epub', 'w') as archive:
    archive.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    archive.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    manifest = ''.join(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1, 5))
    spine = ''.join(f'<itemref idref="c{i}"/>' for i in range(1, 5))
    archive.writestr('OEBPS/book.opf', f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">organon-synthetic-fixture</dc:identifier><dc:title>Original EPUB fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-28T00:00:00Z</meta></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>')
    for i, chapter in enumerate(chapters, 1):
        # Deliberate active-content attempts: the reader must remove/block all of these.
        active = '<script>parent.__ebookExecuted = true</script><img src="https://example.invalid/organon-test" onerror="parent.__ebookExecuted=true"/>' if i == 1 else ''
        archive.writestr(f'OEBPS/c{i}.xhtml', chapter.replace('</body>', active + '</body>'), compress_type=zipfile.ZIP_DEFLATED)

text = ('<html><head><title>MOBI fixture</title></head><body>' + '<mbp:pagebreak/>'.join(chapters) + '</body></html>').encode()
records = [text[offset:offset + 4096] for offset in range(0, len(text), 4096)]
title = b'Original MOBI fixture'
first = bytearray(248 + len(title))
struct.pack_into('>H', first, 0, 1)  # uncompressed PalmDOC
struct.pack_into('>I', first, 4, len(text))
struct.pack_into('>HH', first, 8, len(records), 4096)
first[16:20] = b'MOBI'
for offset, value in [(20, 232), (24, 2), (28, 65001), (32, 1234), (36, 6),
                      (84, 248), (88, len(title)), (108, len(records) + 1), (244, 0xffffffff)]:
    struct.pack_into('>I', first, offset, value)
first[95] = 9
first[248:] = title
records.insert(0, bytes(first))
pdb = bytearray(78)
pdb[:17] = b'Organon synthetic'
pdb[60:68] = b'BOOKMOBI'
struct.pack_into('>H', pdb, 76, len(records))
offset = 78 + len(records) * 8 + 2
table = bytearray()
for i, record in enumerate(records):
    table += struct.pack('>II', offset, i + 1)
    offset += len(record)
(root / 'reading.mobi').write_bytes(bytes(pdb) + table + b'\0\0' + b''.join(records))
