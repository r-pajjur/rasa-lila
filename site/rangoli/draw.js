import {
  COLOURS, GROUND, GOLD, TAU, R_DRAW, R_LOTUS, EXPORT_PX,
  STAMPS, drawLotus, drawKolamDots, placement, ringGeom, slotAngle, api,
} from './shared.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const base = $('base'), ink = $('ink'), guides = $('guides');

/* Strokes are kept in drawing units around the centre, so undo and resizing just redraw them. */
const SIZES = { thin: 3, brush: 7, thick: 13 };
const isStamp = tool => tool === 'dot' || tool in STAMPS;
const EDGE = R_DRAW + 14;               // the circle's rim, with a little border

const state = {
  colour: 'white',
  tool: 'brush',
  lastWidth: SIZES.brush,
  strokes: [],
  history: [],                          // what Undo steps back through: added, erased or cleared strokes
  current: null,
  erasing: false,
  scale: 1,                             // canvas px per drawing unit
  dpr: 1,
};

/* The 4 images of a point: one in each quarter, turned 90° each time. */
function images(x, y) {
  return [[x, y], [-y, x], [-x, -y], [y, -x]];
}

/* ---------- drawing ---------- */

function hexOf(id) {
  return COLOURS.find(c => c.id === id).hex;
}

function withCircle(ctx, scale, cx, cy, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R_DRAW * scale, 0, TAU);
  ctx.arc(cx, cy, R_LOTUS * scale, 0, TAU, true);
  ctx.clip('evenodd');
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  fn();
  ctx.restore();
}

function paintStroke(ctx, s, from = 0) {
  ctx.fillStyle = ctx.strokeStyle = hexOf(s.colour);
  if (isStamp(s.tool)) {
    const [x, y] = s.points[0];
    for (const [px, py] of images(x, y)) {
      if (s.tool === 'dot') {
        ctx.beginPath();
        ctx.arc(px, py, s.width, 0, TAU);
        ctx.fill();
      } else {
        STAMPS[s.tool](ctx, px, py, s.width, Math.atan2(py, px));
      }
    }
    return;
  }
  ctx.lineWidth = s.width;
  ctx.lineCap = ctx.lineJoin = 'round';
  const pts = s.points;
  for (let k = 0; k < 4; k++) {
    const map = p => images(p[0], p[1])[k];
    ctx.beginPath();
    if (pts.length === 1) {
      const [x, y] = map(pts[0]);
      ctx.arc(x, y, s.width / 2, 0, TAU);
      ctx.fill();
      continue;
    }
    // smooth through midpoints, starting from segment `from`
    const start = Math.max(0, from - 1);
    let [x0, y0] = map(pts[start]);
    if (start === 0) {
      ctx.moveTo(x0, y0);
    } else {
      const [xp, yp] = map(pts[start - 1]);
      ctx.moveTo((xp + x0) / 2, (yp + y0) / 2);
    }
    for (let i = start + 1; i < pts.length; i++) {
      const [x1, y1] = map(pts[i]);
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      x0 = x1; y0 = y1;
    }
    ctx.lineTo(x0, y0);
    ctx.stroke();
  }
}

function redrawInk() {
  const ctx = ink.getContext('2d');
  ctx.clearRect(0, 0, ink.width, ink.height);
  withCircle(ctx, state.scale, ink.width / 2, ink.height / 2, () => {
    for (const s of state.strokes) paintStroke(ctx, s);
    if (state.current) paintStroke(ctx, state.current);
  });
}

function drawBase() {
  const ctx = base.getContext('2d');
  const c = base.width / 2, s = state.scale;
  ctx.clearRect(0, 0, base.width, base.height);
  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.arc(c, c, EDGE * s, 0, TAU);
  ctx.fill();
  drawKolamDots(ctx, c, c, R_LOTUS + 6, R_DRAW - 4, s, 0.28);
}

function drawGuides() {
  const ctx = guides.getContext('2d');
  const c = guides.width / 2, s = state.scale;
  ctx.clearRect(0, 0, guides.width, guides.height);
  // the 4 cut lines, on the diagonals
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.4 * s;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * TAU) / 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (R_LOTUS + 4) * s, c + Math.sin(a) * (R_LOTUS + 4) * s);
    ctx.lineTo(c + Math.cos(a) * (EDGE - 1) * s, c + Math.sin(a) * (EDGE - 1) * s);
    ctx.stroke();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.arc(c, c, (EDGE - 1.25) * s, 0, TAU);
  ctx.stroke();
  drawLotus(ctx, c, c, (R_LOTUS - 4) * s);
}

function resize() {
  const css = stage.clientWidth;
  state.dpr = Math.min(window.devicePixelRatio || 1, 3);
  const px = Math.round(css * state.dpr);
  for (const cv of [base, ink, guides]) {
    cv.width = px;
    cv.height = px;
  }
  state.scale = px / 2 / EDGE;
  drawBase();
  drawGuides();
  redrawInk();
}

/* ---------- input ---------- */

function toUnits(e) {
  const r = ink.getBoundingClientRect();
  const k = (r.width / 2) / EDGE;
  return [(e.clientX - r.left - r.width / 2) / k, (e.clientY - r.top - r.height / 2) / k];
}

function addStroke(stroke) {
  state.strokes.push(stroke);
  state.history.push({ type: 'add', stroke });
  redrawInk();
  updateButtons();
}

/* ---------- the eraser: a tap removes the whole line or stamp under it ---------- */

const ERASE_REACH = 10;                 // drawing units of slack around what you tap

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(s, point) {
  // the 4 repeats of the tapped point land on the original stroke if any repeat was tapped
  for (const q of images(point[0], point[1])) {
    if (s.tool === 'line') {
      const pts = s.points;
      if (pts.length === 1 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) <= s.width / 2 + ERASE_REACH) return true;
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(q, pts[i - 1], pts[i]) <= s.width / 2 + ERASE_REACH) return true;
      }
    } else {
      const [x, y] = s.points[0];
      const a = Math.atan2(y, x);
      const reach = s.tool === 'dot' ? s.width : s.width * 2.6;
      const cx = s.tool === 'dot' ? x : x + Math.cos(a) * s.width * 1.4;
      const cy = s.tool === 'dot' ? y : y + Math.sin(a) * s.width * 1.4;
      if (Math.hypot(q[0] - cx, q[1] - cy) <= reach + ERASE_REACH) return true;
    }
  }
  return false;
}

function eraseAt(point) {
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    if (hits(state.strokes[i], point)) {
      const [stroke] = state.strokes.splice(i, 1);
      state.history.push({ type: 'erase', stroke, index: i });
      redrawInk();
      updateButtons();
      return;
    }
  }
}

function onDown(e) {
  if (e.button > 0) return;
  e.preventDefault();
  hideError();
  ink.setPointerCapture?.(e.pointerId);
  const p = toUnits(e);
  if (state.tool === 'eraser') {
    state.erasing = true;
    eraseAt(p);
    return;
  }
  if (isStamp(state.tool)) {
    addStroke({ tool: state.tool, colour: state.colour, width: state.tool === 'dot' ? state.lastWidth * 0.9 + 1.5 : state.lastWidth + 1, points: [p] });
    return;
  }
  state.current = { tool: 'line', colour: state.colour, width: SIZES[state.tool], points: [p] };
  redrawInk();
}

function onMove(e) {
  if (state.erasing) {
    e.preventDefault();
    eraseAt(toUnits(e));
    return;
  }
  if (!state.current) return;
  e.preventDefault();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const pts = state.current.points;
  const from = pts.length;
  for (const ev of events.length ? events : [e]) {
    const p = toUnits(ev);
    const last = pts[pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.8) pts.push(p);
  }
  if (pts.length === from) return;
  const ctx = ink.getContext('2d');
  withCircle(ctx, state.scale, ink.width / 2, ink.height / 2, () => paintStroke(ctx, state.current, from - 1));
}

function onUp() {
  state.erasing = false;
  if (!state.current) return;
  const stroke = state.current;
  state.current = null;
  addStroke(stroke);
}

ink.addEventListener('pointerdown', onDown);
ink.addEventListener('pointermove', onMove);
ink.addEventListener('pointerup', onUp);
ink.addEventListener('pointercancel', onUp);
ink.addEventListener('lostpointercapture', onUp);
// keep the page still while drawing (older iOS ignores touch-action on its own)
stage.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
stage.addEventListener('touchstart', e => { if (e.touches.length === 1) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- controls ---------- */

const swatchBox = $('swatches');
for (const c of COLOURS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.style.setProperty('--c', c.hex);
  b.setAttribute('aria-label', c.name);
  b.setAttribute('aria-pressed', String(c.id === state.colour));
  b.addEventListener('click', () => {
    state.colour = c.id;
    for (const el of swatchBox.children) el.setAttribute('aria-pressed', String(el === b));
  });
  swatchBox.append(b);
}

const toolBox = $('tools');
const eraser = $('eraser');
function selectTool(tool) {
  state.tool = tool;
  if (SIZES[tool]) state.lastWidth = SIZES[tool];
  for (const el of toolBox.children) el.setAttribute('aria-pressed', String(el.dataset.tool === tool));
  eraser.setAttribute('aria-pressed', String(tool === 'eraser'));
}
toolBox.addEventListener('click', e => {
  const b = e.target.closest('.tool');
  if (b) selectTool(b.dataset.tool);
});
eraser.addEventListener('click', () => selectTool(state.tool === 'eraser' ? 'brush' : 'eraser'));
// picking a colour means you want to draw again
swatchBox.addEventListener('click', () => { if (state.tool === 'eraser') selectTool('brush'); });

let clearArmed = false;
$('undo').addEventListener('click', () => {
  const last = state.history.pop();
  if (!last) return;
  if (last.type === 'add') {
    const i = state.strokes.lastIndexOf(last.stroke);
    if (i >= 0) state.strokes.splice(i, 1);
  } else if (last.type === 'erase') {
    state.strokes.splice(Math.min(last.index, state.strokes.length), 0, last.stroke);
  } else if (last.type === 'clear') {
    state.strokes = last.strokes;
  }
  redrawInk();
  updateButtons();
});
$('clear').addEventListener('click', () => {
  if (!clearArmed) {
    clearArmed = true;
    $('clear').textContent = 'Tap again to clear';
    setTimeout(() => { clearArmed = false; $('clear').textContent = 'Start over'; }, 3000);
    return;
  }
  clearArmed = false;
  $('clear').textContent = 'Start over';
  if (state.strokes.length) state.history.push({ type: 'clear', strokes: state.strokes });
  state.strokes = [];
  redrawInk();
  updateButtons();
});

function updateButtons() {
  $('undo').disabled = state.history.length === 0;
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = false;
}
function hideError() {
  $('error').hidden = true;
}

/* ---------- submitting ---------- */

function exportPng() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = EXPORT_PX;
  const ctx = cv.getContext('2d');
  withCircle(ctx, EXPORT_PX / 2 / R_DRAW, EXPORT_PX / 2, EXPORT_PX / 2, () => {
    for (const s of state.strokes) paintStroke(ctx, s);
  });
  return cv.toDataURL('image/png');
}

function previewPng() {
  // what they drew, on the template, for the done screen
  const cv = document.createElement('canvas');
  cv.width = cv.height = 240;
  const ctx = cv.getContext('2d');
  const s = 120 / EDGE;
  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.arc(120, 120, EDGE * s, 0, TAU);
  ctx.fill();
  withCircle(ctx, s, 120, 120, () => { for (const st of state.strokes) paintStroke(ctx, st); });
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(120, 120, EDGE * s - 1, 0, TAU);
  ctx.stroke();
  drawLotus(ctx, 120, 120, (R_LOTUS - 4) * s);
  return cv.toDataURL('image/png');
}

$('submit').addEventListener('click', async () => {
  if (!state.strokes.length) {
    showError('Draw something first. Even a few dots make a rangoli.');
    return;
  }
  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const { n } = await api.submit($('name').value.trim(), exportPng());
    const mine = previewPng();
    try { localStorage.setItem('petal-mandala', JSON.stringify({ n, mine })); } catch (e) {}
    showDone(n, mine);
  } catch (err) {
    showError(`${err.message} Your drawing is still here, so try again in a moment.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add my rangoli';
  }
});

/* ---------- done view ---------- */

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function showDone(n, mine) {
  const place = placement(n - 1);
  $('drawView').hidden = true;
  $('doneView').hidden = false;
  $('doneMine').src = mine;
  const ring = ORDINALS[place.ring - 1] || `number ${place.ring}`;
  $('doneText').textContent = `Your rangoli was split into four pieces and placed in the ${ring} ring at the highlighted spots below.`;
  drawMap($('doneMap'), place);
  window.scrollTo(0, 0);
}

function drawMap(cv, place) {
  const css = cv.clientWidth || 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(css * dpr);
  const ctx = cv.getContext('2d');
  const rings = place.ring;
  const outer = ringGeom(rings).r2;
  const s = cv.width / 2 / (outer + 8);
  const c = cv.width / 2;
  for (let k = 1; k <= rings; k++) {
    const { r1, r2, slots } = ringGeom(k);
    const step = TAU / slots;
    for (let i = 0; i < slots; i++) {
      const a = slotAngle(i, slots);
      const isMine = k === place.ring && place.slots.includes(i);
      ctx.fillStyle = isMine ? '#C2185B' : (k < place.ring ? 'rgba(30, 27, 75, .22)' : 'rgba(30, 27, 75, .07)');
      ctx.beginPath();
      ctx.arc(c, c, r2 * s, a - step / 2, a + step / 2);
      ctx.arc(c, c, r1 * s, a + step / 2, a - step / 2, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#FBF4E4';
      ctx.lineWidth = Math.max(2, 4 * s);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(30, 27, 75, .22)';
  ctx.beginPath();
  ctx.arc(c, c, (ringGeom(1).r1 - 2) * s, 0, TAU);
  ctx.fill();
}

$('again').addEventListener('click', () => {
  state.strokes = [];
  state.history = [];
  $('name').value = '';
  $('doneView').hidden = true;
  $('drawView').hidden = false;
  resize();
  updateButtons();
});

/* ---------- start ---------- */

new ResizeObserver(() => resize()).observe(stage);
resize();
updateButtons();

// someone who already added one sees their result, with the option to draw another
try {
  const saved = JSON.parse(localStorage.getItem('petal-mandala') || 'null');
  if (saved && saved.n) showDone(saved.n, saved.mine);
} catch (e) {}

