/**
 * Shared by the draw, display and admin pages: colours, geometry, the lotus, the API.
 *
 * How the rangoli works: each person draws a whole circle, where every stroke repeats in
 * all 4 quarters. It's cut into those 4 quarters, and each quarter is bent into a slot of a
 * ring, 90° apart. Ring k has 8k slots, so it holds 2k people. People fill a ring at
 * alternating positions, so even a half-full ring stays balanced.
 */

/* rangoli powder colours, in two rows of six on a phone */
export const COLOURS = [
  { id: 'marigold', name: 'Marigold', hex: '#F59E0B' },
  { id: 'vermilion', name: 'Vermilion', hex: '#E2452B' },
  { id: 'kumkum', name: 'Kumkum red', hex: '#B3202A' },
  { id: 'rose', name: 'Rose pink', hex: '#F06A9B' },
  { id: 'magenta', name: 'Magenta', hex: '#C2185B' },
  { id: 'violet', name: 'Violet', hex: '#8E5BD0' },
  { id: 'turmeric', name: 'Turmeric', hex: '#FACC15' },
  { id: 'parrot', name: 'Parrot green', hex: '#8BC34A' },
  { id: 'leaf', name: 'Leaf green', hex: '#3E8E3A' },
  { id: 'sky', name: 'Sky blue', hex: '#4FB8E8' },
  { id: 'peacock', name: 'Peacock blue', hex: '#0E7C86' },
  { id: 'white', name: 'White', hex: '#FBF7EE' },
];

/* The rangoli is laid on black, like powder on a dark floor. */
export const GROUND = '#0B0A0A';
export const GOLD = '#F7AD2F';
export const TAU = Math.PI * 2;

/* A person's circle, in drawing units. The lotus in the middle is fixed and never drawn on. */
export const R_DRAW = 200;
export const R_LOTUS = 52;
/* The submitted PNG: R_DRAW maps to half its width. */
export const EXPORT_PX = 480;

/* The community rangoli, in rangoli units (ring radii and widths). */
export const RING_R0 = 70;
export const RING_W = 92;

export function ringGeom(k) {
  const r1 = RING_R0 + (k - 1) * RING_W;
  return { r1, r2: r1 + RING_W, slots: 8 * k, people: 2 * k };
}

/** Ring k starts at person index k(k-1) (0-based). */
export function ringOf(i) {
  let k = 1;
  while (i >= k * (k + 1)) k++;
  return k;
}

/** Group position j within ring k for the g-th person to arrive there: evens first, then odds. */
function positionInRing(k, g) {
  const people = 2 * k;
  const order = [];
  for (let j = 0; j < people; j += 2) order.push(j);
  for (let j = 1; j < people; j += 2) order.push(j);
  return order[g];
}

/** Where person i (0-based) goes: their ring, group position and the 4 slots, one per quarter. */
export function placement(i) {
  const ring = ringOf(i);
  const { slots, people } = ringGeom(ring);
  const j = positionInRing(ring, i - ring * (ring - 1));
  return { ring, j, slotCount: slots, slots: [0, 1, 2, 3].map(m => j + m * people) };
}

/** The reverse of placement: which person (0-based) owns slot `slot` of ring k. */
export function personAt(k, slot) {
  const j = slot % (2 * k);
  const g = j % 2 === 0 ? j / 2 : k + (j - 1) / 2;
  return k * (k - 1) + g;
}

/** Ring and slot under a point given in rangoli units from the centre, or null. */
export function slotAtPoint(x, y, rings) {
  const rho = Math.hypot(x, y);
  const k = Math.floor((rho - RING_R0) / RING_W) + 1;
  if (k < 1 || k > rings) return null;
  const { slots } = ringGeom(k);
  const step = TAU / slots;
  const slot = ((Math.round((Math.atan2(y, x) + Math.PI / 2) / step) % slots) + slots) % slots;
  return { ring: k, slot };
}

/** Centre angle of a slot; slot 0 sits at the top. */
export function slotAngle(slot, slotCount) {
  return -Math.PI / 2 + slot * (TAU / slotCount);
}

/** A teardrop petal from (x, y) pointing along angle a. */
export function petalPath(ctx, x, y, length, width, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const p = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(...p(length * 0.25, width), ...p(length * 0.75, width * 0.9), ...p(length, 0));
  ctx.bezierCurveTo(...p(length * 0.75, -width * 0.9), ...p(length * 0.25, -width), x, y);
}

/*
 * Stamps, drawn at (x, y) pointing outward along angle a, sized by w (the brush width).
 * Each adds to the current path; the flower's centre is punched out so it reads as a flower.
 */
export const STAMPS = {
  petal(ctx, x, y, w, a) {
    ctx.beginPath();
    petalPath(ctx, x, y, w * 4.2, w * 1.5, a);
    ctx.fill();
  },
  flower(ctx, x, y, w, a) {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) petalPath(ctx, x, y, w * 2.6, w * 1.15, a + Math.PI / 4 + (k * Math.PI) / 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, w * 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, w * 0.28, 0, TAU);
    ctx.fill();
  },
  diya(ctx, x, y, w, a) {
    // the bowl sits inward, the flame points outward
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -w * 1.9);
    ctx.quadraticCurveTo(-w * 2.3, -w * 1.6, -w * 2.1, 0);
    ctx.quadraticCurveTo(-w * 2.3, w * 1.6, -w * 0.2, w * 1.9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    petalPath(ctx, w * 0.35, 0, w * 2.6, w * 0.8, 0);
    ctx.fill();
    ctx.restore();
  },
  mango(ctx, x, y, w, a) {
    // a paisley: round body inward, tip curling to one side as it points outward
    const r = w * 1.35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.bezierCurveTo(-r, -1.35 * r, r * 0.9, -1.4 * r, r * 1.25, -0.35 * r);
    ctx.bezierCurveTo(r * 1.55, r * 0.45, r * 2.3, r * 0.5, r * 2.55, -0.45 * r);
    ctx.bezierCurveTo(r * 2.4, r * 1.05, r * 1.1, r * 1.35, -0.1 * r, r * 1.05);
    ctx.bezierCurveTo(-0.65 * r, r * 0.9, -r, r * 0.5, -r, 0);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(-0.05 * r, 0.05 * r, r * 0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },
};

/** The fixed lotus at the centre of every circle and of the big rangoli. */
export function drawLotus(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  const layers = [
    [0.95, 0.30, '#E2452B', 0],
    [0.78, 0.26, '#F59E0B', Math.PI / 8],
    [0.55, 0.18, '#FBF7EE', 0],
  ];
  for (const [len, wid, colour, off] of layers) {
    ctx.fillStyle = colour;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      petalPath(ctx, cx, cy, len * r, wid * r, off + (i * TAU) / 8 - Math.PI / 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** One person's whole circle as they drew it: their PNG on the black ground, with the rim and lotus. */
export function drawCircle(ctx, size, img) {
  const c = size / 2, edge = R_DRAW + 14, s = c / edge;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.arc(c, c, edge * s, 0, TAU);
  ctx.fill();
  const d = R_DRAW * 2 * s;
  ctx.drawImage(img, c - d / 2, c - d / 2, d, d);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(2, 2.5 * s);
  ctx.beginPath();
  ctx.arc(c, c, edge * s - ctx.lineWidth / 2, 0, TAU);
  ctx.stroke();
  drawLotus(ctx, c, c, (R_LOTUS - 4) * s);
}

/** Faint kolam guide dots on rings between rMin and rMax. */
export function drawKolamDots(ctx, cx, cy, rMin, rMax, scale, alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(251, 247, 238, ${alpha})`;
  for (let i = 1; i < 7; i++) {
    const r = rMin + ((rMax - rMin) * i) / 7;
    // a multiple of 8, offset half a step, so every quarter gets the same dots and none sit on a cut line
    const n = Math.max(8, Math.round((TAU * r) / 22 / 8) * 8);
    for (let j = 0; j < n; j++) {
      const a = ((j + 0.5) * TAU) / n;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale, 1.3 * scale, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---------- downloads: the watermark and the keepsake card ---------- */

let logoPromise;
/** The CM Niagara logo turned light, so it reads as a watermark on the black ground. */
export function watermarkLogo() {
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
    img.src = new URL('./logo.png', import.meta.url).href;
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
export async function rangoliCard({ img, name, reflection }) {
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

/* ---------- the API ---------- */

const API = '/api/rangoli/';

async function call(action, { method = 'GET', body, password, params = {} } = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (password) headers['X-Admin-Password'] = password;
  const res = await fetch(`${API}?${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

export const api = {
  /** Who is where: { rev, items: [{ n, id, name, at }] }, or { rev, same: true } if unchanged since `rev`. */
  index: rev => call('index', { params: rev === undefined ? {} : { rev: String(rev) } }),
  /** The drawings for up to 10 designs, by id. */
  pieces: ids => call('pieces', { params: { ids: ids.join(',') } }),
  submit: (name, image, reflection = '') => call('submit', { method: 'POST', body: { name, reflection, image } }),
  check: password => call('check', { method: 'POST', password }),
  reset: password => call('reset', { method: 'POST', password }),
  remove: (password, id) => call('delete', { method: 'POST', password, params: { id } }),
};

/** Fetches the drawings for the given index items, 10 at a time. */
export async function loadPieces(items, onBatch) {
  for (let k = 0; k < items.length; k += 10) {
    const batch = items.slice(k, k + 10);
    const { entries } = await api.pieces(batch.map(it => it.id));
    const byId = new Map(entries.map(e => [e.id, e.image]));
    await onBatch(batch.filter(it => byId.has(it.id)).map(it => ({ ...it, image: byId.get(it.id) })));
  }
}
