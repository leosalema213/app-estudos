import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export { TextLayer } from 'pdfjs-dist';
export function loadPdf(bytes) {
  const assets = new URL('./pdf-assets/', document.baseURI).href;
  return getDocument({ data: new Uint8Array(bytes), cMapUrl: assets + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/', isEvalSupported: false, enableXfa: false });
}
