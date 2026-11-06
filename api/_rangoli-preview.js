/**
 * Draws the link-preview image (1200×630) for Community Rangoli: the rangoli as it is right now
 * on the left, with the title, handle and logo from og-base.png on the right.
 * It reuses the display's own renderer (site/rangoli/mandala.js) on a server-side canvas.
 * Files starting with _ in api/ aren't routes; api/rangoli.js calls this.
 */
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';

const PIECE_PX = 480;            // EXPORT_PX in shared.js
let ready;

/** mandala.js was written for the browser; give it the two browser pieces it uses. */
function load() {
  ready ||= (async () => {
    globalThis.ImageData ??= ImageData;
    globalThis.document ??= { createElement: () => createCanvas(1, 1) };
    const { Mandala } = await import('../site/rangoli/mandala.js');
    const base = await loadImage(await readFile(new URL('../site/rangoli/og-base.png', import.meta.url)));
    return { Mandala, base };
  })();
  return ready;
}

/** images: the rangolis' PNG data URLs, in arrival order. Returns a JPEG buffer. */
export async function renderPreview(images) {
  const { Mandala, base } = await load();
  const size = 600;
  const cv = createCanvas(size, size);
  const rangoli = new Mandala(cv);
  for (const [i, url] of images.entries()) {
    try {
      const img = await loadImage(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      const piece = createCanvas(PIECE_PX, PIECE_PX);
      const ctx = piece.getContext('2d');
      ctx.drawImage(img, 0, 0, PIECE_PX, PIECE_PX);
      rangoli.people[i] = { pixels: ctx.getImageData(0, 0, PIECE_PX, PIECE_PX) };
    } catch (e) {
      // a broken image leaves a gap rather than breaking the preview
    }
  }
  rangoli.rebuild();

  const out = createCanvas(1200, 630);
  const ctx = out.getContext('2d');
  ctx.drawImage(base, 0, 0);
  ctx.drawImage(cv, 15, 15, size, size);
  return out.encode('jpeg', 86);
}
