// Convert the approved, cleaned bitmap to font-independent SVG paths.
const { _electron: electron } = require('playwright');
const tracer = require('imagetracerjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'assets/branding');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
(async () => {
  const app = await electron.launch({ args: [root, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'organon-brand-'))}`], env });
  try {
    const page = await app.firstWindow();
    const png = fs.readFileSync(path.join(folder, 'organon-selected-clean.png')).toString('base64');
    const { pixels, width, height, bounds, symbol } = await page.evaluate(async png => {
      const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      const columns = new Set(); let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4, dark = data[i] + data[i + 1] + data[i + 2] < 384;
        data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255; data[i + 3] = dark ? 255 : 0;
        if (dark) { columns.add(x); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
      let symbolEnd = minX; while (columns.has(symbolEnd + 1)) symbolEnd++;
      let top = image.height, bottom = 0;
      for (let y = 0; y < image.height; y++) for (let x = minX; x <= symbolEnd; x++) if (data[(y * image.width + x) * 4 + 3]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      const encode = values => { let text = ''; for (let i = 0; i < values.length; i += 32768) text += String.fromCharCode(...values.subarray(i, i + 32768)); return btoa(text); };
      return { pixels: encode(data), width: image.width, height: image.height, bounds: [minX - 2, minY - 2, maxX - minX + 5, maxY - minY + 5], symbol: [minX - 2, top - 2, symbolEnd - minX + 5, bottom - top + 5] };
    }, png);
    const svg = tracer.imagedataToSVG({ width, height, data: new Uint8ClampedArray(Buffer.from(pixels, 'base64')) }, { pal: [{ r: 255, g: 255, b: 255, a: 0 }, { r: 0, g: 0, b: 0, a: 255 }], colorsampling: 0, colorquantcycles: 1, pathomit: 30, ltres: .5, qtres: .5, strokewidth: 0, viewbox: true, desc: false, roundcoords: 2 });
    const paths = [...svg.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]).filter(value => !value.includes('opacity="0"')).map(value => value.replace(/fill="[^"]*"/, 'fill="currentColor"')).join('\n');
    const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.join(' ')}">\n${paths}\n</svg>\n`;
    fs.writeFileSync(path.join(folder, 'organon-wordmark.svg'), wordmark);
    const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.join(' ')}">\n${paths}\n</svg>\n`;
    fs.writeFileSync(path.join(folder, 'organon-symbol.svg'), glyph);
    fs.writeFileSync(path.join(root, 'assets/icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="tile" x2=".7" y2="1"><stop stop-color="#303030"/><stop offset="1" stop-color="#101010"/></linearGradient></defs><rect x="9" y="9" width="238" height="238" rx="51" fill="url(#tile)" stroke="#555" stroke-width="1"/><svg x="50" y="47" width="156" height="162" viewBox="${symbol.join(' ')}" color="#f5edd9" overflow="hidden">${paths}</svg></svg>\n`);
    console.log(JSON.stringify({ bounds, symbol, paths: (paths.match(/<path/g) || []).length }));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
