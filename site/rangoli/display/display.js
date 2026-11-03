import { ringOf, loadAllSince } from '../shared.js';
import { Mandala, decode } from '../mandala.js';

const $ = id => document.getElementById(id);
const canvas = $('mandala');
const mandala = new Mandala(canvas);
const POLL_MS = 2000;

let count = 0;                 // how many entries we've loaded (1-based numbers up to this)
const names = [];              // by arrival index
const images = [];             // data URLs by arrival index, for the toast and export
const queue = [];              // new arrivals waiting to bloom in
let blooming = false;

/* ---------- join link ---------- */

const drawUrl = new URL('../', location.href).href;
// break the line after the domain, never mid-word
const [host, ...rest] = drawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/');
$('url').append(host, ...(rest.length ? [document.createElement('wbr'), '/' + rest.join('/')] : []));
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
  const ring = ringOf(people - 1);
  const ringEnd = ring * (ring + 1);
  const left = ringEnd - people;
  const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][ring - 1] || `number ${ring}`;
  $('countText').innerHTML = `${people === 1 ? 'rangoli' : 'rangolis'} so far.<br>` +
    (left === 0 ? `The ${ordinal} ring is complete. The next one opens now.` :
      `${left} more and the ${ordinal} ring is complete.`);
}

/* ---------- arrivals ---------- */

async function ingest(entries, animate) {
  const decoded = [];
  for (const e of entries) {
    const i = e.n - 1;
    names[i] = e.name;
    images[i] = e.image;
    try {
      decoded.push({ i, pixels: await decode(e.image), name: e.name, image: e.image });
    } catch (err) {
      // a broken image leaves a gap rather than stopping the display
    }
  }
  if (!animate) {
    mandala.add(decoded);
    updateCount();
    return;
  }
  queue.push(...decoded);
  if (!blooming) bloomNext();
}

function bloomNext() {
  const next = queue.shift();
  if (!next) {
    blooming = false;
    return;
  }
  blooming = true;
  const animated = mandala.add([next], { animate: true });
  updateCount();
  showToast(next);
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
    const result = await loadAllSince(count, async entries => {
      await ingest(entries, !first);
      count = entries[entries.length - 1].n;
    });
    if (result.reset) {
      // the admin cleared the mandala: start over
      count = 0;
      mandala.people = [];
      names.length = images.length = queue.length = 0;
      mandala.rebuild();
      updateCount();
    }
  } catch (err) {
    // keep showing what we have; the next poll will try again
  }
  setTimeout(() => poll(false), POLL_MS);
}

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
    a.download = 'petal-mandala.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    btn.disabled = false;
    btn.textContent = 'Save the mandala as an image';
  }, 'image/png');
});

resize();
updateCount();
poll(true);
