import { api, loadPieces, drawCircle } from '../shared.js';
import { Mandala, decode } from '../mandala.js';

const $ = id => document.getElementById(id);
const canvas = $('mandala');
const mandala = new Mandala(canvas);
const POLL_MS = 2000;

let rev;                       // the server's change counter we last saw
const cache = new Map();       // design id -> { pixels, name, image }
let shown = [];                // design ids in the rangoli, in place order
let queue = [];                // new arrivals (ids) waiting to bloom in, after `shown`
let blooming = false;

/* ---------- join link ---------- */

const drawUrl = new URL('../', location.href).href;
$('url').textContent = drawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
if (window.qrcode) {
  const qr = window.qrcode(0, 'M');
  qr.addData(drawUrl);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/* ---------- sizing ---------- */

function resize() {
  const css = canvas.clientWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(css * dpr);
  if (canvas.width === px) return;
  canvas.width = canvas.height = px;
  mandala.rebuild();
}
new ResizeObserver(resize).observe(canvas);

/* ---------- the count ---------- */

function updateCount() {
  const people = mandala.people.filter(Boolean).length;
  $('count').textContent = String(people);
  if (!people) {
    $('countText').textContent = 'Be the first to add a rangoli.';
    return;
  }
  $('countText').textContent = `${people === 1 ? 'rangoli' : 'rangolis'} so far`;
}

/* ---------- arrivals ---------- */

function bloomNext() {
  const id = queue.shift();
  if (!id) {
    blooming = false;
    return;
  }
  blooming = true;
  const d = cache.get(id);
  const i = shown.length;
  shown.push(id);
  const animated = mandala.add([{ i, id, pixels: d.pixels, name: d.name }], { animate: true });
  updateCount();
  showToast(d);
  if (!animated) {
    setTimeout(bloomNext, 2600);
    return;
  }
  const start = performance.now(), dur = 1400;
  const step = now => {
    const t = Math.min(1, (now - start) / dur);
    mandala.draw(1 - Math.pow(1 - t, 3));
    if (t < 1) requestAnimationFrame(step);
    else {
      mandala.settle();
      setTimeout(bloomNext, 1200);
    }
  };
  requestAnimationFrame(step);
}

/** Lays the rangoli out again from scratch, e.g. after a deletion moved everyone along. */
function relayout(ids) {
  queue = [];
  shown = ids.slice();
  mandala.people = shown.map(id => ({ id, pixels: cache.get(id).pixels, name: cache.get(id).name }));
  mandala.hover = null;
  hideTip();
  mandala.rebuild();
  updateCount();
}

let toastTimer;
function showToast({ name, image }) {
  $('toastImg').src = image;
  $('toastText').innerHTML = '';
  if (name) {
    const b = document.createElement('b');
    b.textContent = name;
    $('toastText').append(b, ' added a rangoli');
  } else {
    $('toastText').textContent = 'A new rangoli was added';
  }
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
}

/* ---------- polling ---------- */

async function poll(first) {
  try {
    const idx = await api.index(rev);
    if (!idx.same) {
      rev = idx.rev;
      for (const it of idx.items) if (cache.has(it.id)) Object.assign(cache.get(it.id), { name: it.name, reflection: it.reflection });
      const missing = idx.items.filter(it => !cache.has(it.id));
      await loadPieces(missing, async batch => {
        for (const e of batch) {
          try {
            cache.set(e.id, { pixels: await decode(e.image), name: e.name, reflection: e.reflection || '', image: e.image });
          } catch (err) {
            // a broken image is left out rather than stopping the display
          }
        }
      });
      const ids = idx.items.map(it => it.id).filter(id => cache.has(id));
      const accounted = shown.concat(queue);
      const appendedOnly = !first && accounted.every((id, k) => ids[k] === id);
      if (appendedOnly) {
        queue.push(...ids.slice(accounted.length));
        if (!blooming && queue.length) bloomNext();
      } else {
        relayout(ids);
      }
    }
  } catch (err) {
    // keep showing what we have; the next poll will try again
  }
  setTimeout(() => poll(false), POLL_MS);
}

/* ---------- who made this: hover on a computer, tap on a phone ---------- */

const tip = $('tip');

function showTip(who, clientX, clientY) {
  const box = canvas.parentElement.getBoundingClientRect();
  tip.textContent = who.name || 'Anonymous';
  tip.hidden = false;
  const x = clientX - box.left, y = clientY - box.top;
  const flip = x > box.width * 0.6;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.transform = `translate(${flip ? 'calc(-100% - 14px)' : '14px'}, -130%)`;
  mandala.setHover(who.i);
}

function hideTip() {
  tip.hidden = true;
  mandala.setHover(null);
}

canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !preview.hidden) return;
  const who = mandala.personAtClient(e.clientX, e.clientY);
  who ? showTip(who, e.clientX, e.clientY) : hideTip();
});
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && preview.hidden) hideTip(); });

/* ---------- click or tap a piece: see that person's whole rangoli ---------- */

const preview = $('preview');
let lastFocus = null;

canvas.addEventListener('click', e => {
  const who = mandala.personAtClient(e.clientX, e.clientY);
  if (!who) return;
  const person = mandala.people[who.i];
  const entry = person && cache.get(person.id);
  if (!entry) return;
  const img = new Image();
  img.onload = () => {
    tip.hidden = true;
    mandala.setHover(who.i);
    drawCircle($('previewCircle').getContext('2d'), 720, img);
    $('previewName').textContent = who.name || 'Anonymous';
    $('previewReflection').textContent = entry.reflection || '';
    $('previewReflection').hidden = !entry.reflection;
    previewing = { img, name: who.name || 'Anonymous', reflection: entry.reflection || '' };
    lastFocus = document.activeElement;
    preview.hidden = false;
    $('previewClose').focus();
  };
  img.src = entry.image;
});

function closePreview() {
  if (preview.hidden) return;
  preview.hidden = true;
  mandala.setHover(null);
  lastFocus?.focus?.();
}
$('previewClose').addEventListener('click', closePreview);
$('previewDownload').addEventListener('click', async () => {
  if (!previewing) return;
  const cv = await rangoliCard(previewing);
  const slug = previewing.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'anonymous';
  save(cv, `rangoli-${slug}.png`);
});
preview.addEventListener('click', e => { if (e.target === preview) closePreview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

/* ---------- export ---------- */

$('save').addEventListener('click', async () => {
  const btn = $('save');
  btn.disabled = true;
  btn.textContent = 'Preparing image…';
  await new Promise(r => setTimeout(r, 30));
  const cv = document.createElement('canvas');
  cv.width = cv.height = 3000;
  const big = new Mandala(cv);
  big.people = mandala.people.slice();
  big.rebuild();
  const logo = await watermarkLogo();
  if (logo) {
    const w = cv.width * 0.1, h = w * logo.height / logo.width;
    const ctx = cv.getContext('2d');
    ctx.globalAlpha = 0.6;
    ctx.drawImage(logo, cv.width - w - cv.width * 0.03, cv.height - h - cv.width * 0.03, w, h);
    ctx.globalAlpha = 1;
  }
  save(cv, 'community-rangoli.png');
  btn.disabled = false;
  btn.textContent = 'Download rangoli';
});

/* ---------- downloads ---------- */

let previewing = null;           // the rangoli open in the preview card

function save(cv, filename) {
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

let logoPromise;
/** The CM Niagara logo turned light, so it reads as a watermark on the black ground. */
function watermarkLogo() {
  logoPromise ||= new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < d.data.length; i += 4) {
        // black lines become cream, the pale fills fade into the ground
        const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
        d.data[i] = 251; d.data[i + 1] = 247; d.data[i + 2] = 238;
        d.data[i + 3] = Math.round(d.data[i + 3] * (1 - lum / 255));
      }
      ctx.putImageData(d, 0, 0);
      resolve(cv);
    };
    img.onerror = () => resolve(null);
    img.src = '../logo.png';
  });
  return logoPromise;
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** One person's rangoli as a keepsake: their circle, name and reflection, with the watermark. */
async function rangoliCard({ img, name, reflection }) {
  await Promise.all([
    document.fonts.load("400 64px 'Tiro Devanagari Hindi'"),
    document.fonts.load("400 34px 'Mukta'"),
  ]).catch(() => {});
  const W = 1080, pad = 90, circle = 820;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = "400 34px 'Mukta', sans-serif";
  const lines = reflection ? wrap(measure, reflection, W - pad * 2) : [];
  const lineH = 50;
  const H = pad + circle + 70 + 64 + (lines.length ? 36 + lines.length * lineH : 0) + 190;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0B0A0A';
  ctx.fillRect(0, 0, W, H);

  const circleCv = document.createElement('canvas');
  circleCv.width = circleCv.height = circle;
  drawCircle(circleCv.getContext('2d'), circle, img);
  ctx.drawImage(circleCv, (W - circle) / 2, pad);

  let y = pad + circle + 70 + 50;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FBF7EE';
  ctx.font = "400 64px 'Tiro Devanagari Hindi', Georgia, serif";
  ctx.fillText(name, W / 2, y);
  if (lines.length) {
    y += 36 + 24;
    ctx.fillStyle = 'rgba(251, 247, 238, .78)';
    ctx.font = "400 34px 'Mukta', sans-serif";
    for (const line of lines) {
      y += lineH;
      ctx.fillText(line, W / 2, y - 24);
    }
  }

  const logo = await watermarkLogo();
  if (logo) {
    const w = 120, h = w * logo.height / logo.width;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(logo, W - w - 48, H - h - 44, w, h);
    ctx.globalAlpha = 1;
  }
  return cv;
}

resize();
updateCount();
poll(true);
