import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import manifest from './scripts/build-manifest.cjs';
export default defineConfig({ base: './', plugins: [react(), {
  name: 'pdf-offline-assets',
  closeBundle() {
    for (const directory of ['cmaps', 'standard_fonts', 'wasm']) fs.cpSync(path.resolve('node_modules/pdfjs-dist', directory), path.resolve('dist/pdf-assets', directory), { recursive: true });
    fs.copyFileSync(path.resolve('node_modules/pdfjs-dist/LICENSE'), path.resolve('dist/pdf-assets/LICENSE'));
    fs.cpSync(path.resolve('assets/licenses'), path.resolve('dist/licenses'), { recursive: true });
    manifest.writeBuildManifest(path.resolve('dist'), JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
  },
}] });
