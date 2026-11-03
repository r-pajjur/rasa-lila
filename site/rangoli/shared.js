/**
 * Shared by the draw, display and admin pages: colours, geometry, the lotus, the API.
 *
 * How the mandala works: each person draws a whole circle with 8-way mirror symmetry.
 * It's cut into 4 quarters, and each quarter is bent into a slot of a ring, 90° apart.
 * Ring k has 8k slots, so it holds 2k people. People fill a ring at alternating positions,
 * so even a half-full ring stays balanced.
 */

export const COLOURS = [
  { id: 'marigold', name: 'Marigold', hex: '#F59E0B' },
  { id: 'vermilion', name: 'Vermilion', hex: '#E2452B' },
  { id: 'turmeric', name: 'Turmeric', hex: '#FACC15' },
  { id: 'magenta', name: 'Magenta', hex: '#C2185B' },
  { id: 'peacock', name: 'Peacock blue', hex: '#0E7C86' },
  { id: 'leaf', name: 'Leaf green', hex: '#4D9A3A' },
  { id: 'white', name: 'White', hex: '#FBF7EE' },
];

export const INDIGO = '#1E1B4B';
export const GOLD = '#F7AD2F';
export const TAU = Math.PI * 2;

/* A person's circle, in drawing units. The lotus in the middle is fixed and never drawn on. */
export const R_DRAW = 200;
export const R_LOTUS = 52;
/* The submitted PNG: R_DRAW maps to half its width. */
export const EXPORT_PX = 480;

/* The community mandala, in mandala units. */
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

/** Ring and slot under a point given in mandala units from the centre, or null. */
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

/** The fixed lotus at the centre of every circle and of the mandala. */
export function drawLotus(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = INDIGO;
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

/** Faint kolam guide dots on rings between rMin and rMax. */
export function drawKolamDots(ctx, cx, cy, rMin, rMax, scale, alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(251, 247, 238, ${alpha})`;
  for (let i = 1; i < 7; i++) {
    const r = rMin + ((rMax - rMin) * i) / 7;
    const n = Math.floor((TAU * r) / 22);
    for (let j = 0; j < n; j++) {
      const a = (j * TAU) / n;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale, 1.3 * scale, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
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
  submit: (name, image) => call('submit', { method: 'POST', body: { name, image } }),
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
