import { api, loadPieces, drawCircle } from '../shared.js';
import { Mandala, decode } from '../mandala.js';

const $ = id => document.getElementById(id);
const canvas = $('mandala');
const mandala = new Mandala(canvas);
const POLL_MS = 2000;

let rev;                       // the server's change counter we last saw
const cache = new Map();       // design id -> { pixels, name, image }
let shown = [];                // design ids in the mandala, in place order
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

/** Lays the mandala out again from scratch, e.g. after a deletion moved everyone along. */
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
      for (const it of idx.items) if (cache.has(it.id)) cache.get(it.id).name = it.name;
      const missing = idx.items.filter(it => !cache.has(it.id));
      await loadPieces(missing, async batch => {
        for (const e of batch) {
          try {
            cache.set(e.id, { pixels: await decode(e.image), name: e.name, image: e.image });
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
$('previewDownload').addEventListener('click', () => {
  const name = $('previewName').textContent.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'anonymous';
  $('previewCircle').toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rangoli-${slug}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
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
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'community-rangoli.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    btn.disabled = false;
    btn.textContent = 'Download mandala';
  }, 'image/png');
});

resize();
updateCount();
poll(true);
