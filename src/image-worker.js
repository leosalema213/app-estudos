// Encoding is isolated from the editor; the caller queues one image at a time.
self.onmessage = async ({ data: { id, blob } }) => {
  let bitmap;
  try {
    if (blob.size <= 160 * 1024) { self.postMessage({ id, blob }); return; }
    bitmap = await createImageBitmap(blob);
    let best = blob;
    let scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    for (let round = 0; round < 6; round++) {
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.94, 0.86, 0.76]) {
        const candidate = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (candidate.size < best.size) best = candidate;
        if (best.size <= 1024 * 1024) break;
      }
      if (best.size <= 1024 * 1024) break;
      scale *= 0.8;
    }
    if (best.size > 1024 * 1024) throw new Error('Não foi possível reduzir esta imagem para 1 MB. Escolha uma versão menor.');
    self.postMessage({ id, blob: best });
  } catch (error) { self.postMessage({ id, error: error.message }); }
  finally { bitmap?.close(); }
};
