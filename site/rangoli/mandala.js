import {
  INDIGO, GOLD, TAU, R_DRAW, R_LOTUS, EXPORT_PX, RING_W,
  ringGeom, ringOf, placement, slotAngle, drawLotus, drawKolamDots, personAt, slotAtPoint,
} from './shared.js';

/** Decodes a submitted PNG into pixels the renderer can sample. */
export function decode(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = EXPORT_PX;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, EXPORT_PX, EXPORT_PX);
      resolve(ctx.getImageData(0, 0, EXPORT_PX, EXPORT_PX));
    };
    img.onerror = () => reject(new Error('Could not read a rangoli image.'));
    img.src = dataUrl;
  });
}

/**
 * Draws the community mandala onto a square canvas.
 * people: array indexed by arrival order (0-based) of { pixels: ImageData } or undefined for a gap.
 */
export class Mandala {
  constructor(canvas) {
    this.canvas = canvas;
    this.people = [];
    this.layer = null;          // bent pieces, as pixels
    this.layerCanvas = document.createElement('canvas');
    this.fresh = null;          // the newest person's pieces while they bloom in
    this.freshCanvas = document.createElement('canvas');
    this.rings = 1;
    this.hover = null;          // person index whose 4 pieces are outlined
  }

  /** Mandala units to canvas px, leaving room for the next ring's dashed outline. */
  get scale() {
    return this.canvas.width / 2 / (ringGeom(this.rings).r2 + RING_W * 0.55 + 6);
  }

  ringsFor(count) {
    return count ? ringOf(count - 1) : 1;
  }

  /** Bends one person's 4 quarters into their 4 slots, writing into `target` pixels. */
  paintPerson(i, target) {
    const src = this.people[i]?.pixels;
    if (!src) return;
    const W = this.canvas.width, c = W / 2, s = this.scale;
    const place = placement(i);
    const { r1, r2, slots } = ringGeom(place.ring);
    const step = TAU / slots;
    const sd = src.data, td = target.data;
    const half = EXPORT_PX / 2, srcScale = half / R_DRAW;
    const quarter = Math.PI / 2;

    place.slots.forEach((slot, m) => {
      const aMid = slotAngle(slot, slots);
      const qMid = -Math.PI / 2 + m * quarter;           // this quarter's centre, in the drawing
      // bounding box of the wedge, from points along its edges
      let x0 = W, y0 = W, x1 = 0, y1 = 0;
      for (let t = 0; t <= 8; t++) {
        const a = aMid - step / 2 + (step * t) / 8;
        for (const r of [r1, r2]) {
          const x = c + Math.cos(a) * r * s, y = c + Math.sin(a) * r * s;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
      x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(W - 1, Math.ceil(y1));

      for (let py = y0; py <= y1; py++) {
        const dy = py + 0.5 - c;
        for (let px = x0; px <= x1; px++) {
          const dx = px + 0.5 - c;
          const rho = Math.hypot(dx, dy) / s;
          if (rho < r1 || rho > r2) continue;
          let d = Math.atan2(dy, dx) - aMid;
          d -= TAU * Math.round(d / TAU);
          if (d < -step / 2 || d > step / 2) continue;
          // the slot's angle maps onto the quarter's 90°, and its depth onto lotus-to-rim
          const phi = qMid + d * (quarter / step);
          const rr = R_LOTUS + ((rho - r1) / (r2 - r1)) * (R_DRAW - R_LOTUS);
          const sx = Math.round(half + Math.cos(phi) * rr * srcScale);
          const sy = Math.round(half + Math.sin(phi) * rr * srcScale);
          if (sx < 0 || sy < 0 || sx >= EXPORT_PX || sy >= EXPORT_PX) continue;
          const si = (sy * EXPORT_PX + sx) * 4;
          if (sd[si + 3] === 0) continue;
          const ti = (py * W + px) * 4;
          td[ti] = sd[si]; td[ti + 1] = sd[si + 1]; td[ti + 2] = sd[si + 2]; td[ti + 3] = sd[si + 3];
        }
      }
    });
  }

  /** Rebuilds every piece from scratch (on first load, resize or when a new ring opens). */
  rebuild() {
    const W = this.canvas.width;
    this.rings = this.ringsFor(this.people.length);
    this.layerCanvas.width = this.layerCanvas.height = W;
    this.freshCanvas.width = this.freshCanvas.height = W;
    this.layer = new ImageData(W, W);
    for (let i = 0; i < this.people.length; i++) this.paintPerson(i, this.layer);
    this.layerCanvas.getContext('2d').putImageData(this.layer, 0, 0);
    this.fresh = null;
    this.draw();
  }

  /** Removes a person; their slots go back to placeholders. */
  remove(i) {
    this.people[i] = undefined;
    while (this.people.length && !this.people[this.people.length - 1]) this.people.pop();
    if (this.hover === i) this.hover = null;
    this.rebuild();
  }

  /** The person under a point on the canvas (client coordinates), or null. */
  personAtClient(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / r.width;
    const s = this.scale;
    const x = ((clientX - r.left) * k - this.canvas.width / 2) / s;
    const y = ((clientY - r.top) * k - this.canvas.width / 2) / s;
    const at = slotAtPoint(x, y, this.rings);
    if (!at) return null;
    const i = personAt(at.ring, at.slot);
    return this.people[i] ? { i, name: this.people[i].name } : null;
  }

  setHover(i) {
    if (this.hover === i) return;
    this.hover = i;
    this.draw(this.fresh ? 0 : 1);
  }

  /** Adds people; returns true when the newest should bloom in (i.e. the layout didn't change). */
  add(entries, { animate = false } = {}) {
    for (const { i, pixels, name } of entries) this.people[i] = { pixels, name };
    const rings = this.ringsFor(this.people.length);
    if (rings !== this.rings || !this.layer || !animate) {
      this.rebuild();
      return false;
    }
    const W = this.canvas.width;
    this.fresh = new ImageData(W, W);
    for (const { i } of entries) this.paintPerson(i, this.fresh);
    this.freshCanvas.getContext('2d').putImageData(this.fresh, 0, 0);
    return true;
  }

  /** Folds the bloomed-in person into the main layer. */
  settle() {
    if (!this.fresh) return;
    const ctx = this.layerCanvas.getContext('2d');
    ctx.drawImage(this.freshCanvas, 0, 0);
    this.layer = ctx.getImageData(0, 0, this.canvas.width, this.canvas.width);
    this.fresh = null;
    this.draw();
  }

  /** Paints the whole mandala. bloom: 0..1 opacity for the newest person's pieces. */
  draw(bloom = 1) {
    const cv = this.canvas, ctx = cv.getContext('2d');
    const W = cv.width, c = W / 2, s = this.scale;
    const filled = new Set();
    for (let i = 0; i < this.people.length; i++) {
      if (!this.people[i]) continue;
      const p = placement(i);
      filled.add(`${p.ring}:${p.j}`);
    }

    ctx.fillStyle = INDIGO;
    ctx.fillRect(0, 0, W, W);
    drawKolamDots(ctx, c, c, ringGeom(1).r1 + 6, ringGeom(this.rings).r2 - 6, s, 0.1);

    // faint petals where nobody has drawn yet
    for (let k = 1; k <= this.rings; k++) {
      const { r1, r2, slots, people } = ringGeom(k);
      for (let slot = 0; slot < slots; slot++) {
        if (filled.has(`${k}:${slot % people}`)) continue;
        const a = slotAngle(slot, slots), mid = (r1 + r2) / 2;
        ctx.fillStyle = 'rgba(251, 247, 238, .16)';
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * mid * s, c + Math.sin(a) * mid * s, 3 * s, 0, TAU);
        ctx.fill();
        for (const off of [-0.22, 0.22]) {
          const r = mid + off * RING_W;
          ctx.fillStyle = 'rgba(251, 247, 238, .1)';
          ctx.beginPath();
          ctx.arc(c + Math.cos(a) * r * s, c + Math.sin(a) * r * s, 2 * s, 0, TAU);
          ctx.fill();
        }
      }
    }

    ctx.drawImage(this.layerCanvas, 0, 0);
    if (this.fresh && bloom > 0) {
      ctx.save();
      ctx.globalAlpha = bloom;
      ctx.drawImage(this.freshCanvas, 0, 0);
      ctx.restore();
    }

    // seams: an indigo gutter under a gold line along every cut
    for (let k = 1; k <= this.rings; k++) {
      const { r1, r2, slots } = ringGeom(k);
      const step = TAU / slots;
      for (let slot = 0; slot < slots; slot++) {
        const a = slotAngle(slot, slots) - step / 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const [colour, width] of [[INDIGO, 6], [GOLD, 1.6]]) {
          ctx.strokeStyle = colour;
          ctx.globalAlpha = colour === GOLD ? 0.85 : 1;
          ctx.lineWidth = width * s;
          ctx.beginPath();
          ctx.moveTo(c + ca * r1 * s, c + sa * r1 * s);
          ctx.lineTo(c + ca * r2 * s, c + sa * r2 * s);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // gold rings with a beaded edge, like a kolam border
    for (let k = 1; k <= this.rings; k++) {
      const { r1, r2 } = ringGeom(k);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2 * s;
      for (const r of [r1, r2]) {
        ctx.beginPath();
        ctx.arc(c, c, r * s, 0, TAU);
        ctx.stroke();
      }
      const beadR = r2 + 7, n = Math.floor((TAU * beadR) / 12);
      ctx.fillStyle = 'rgba(247, 173, 47, .6)';
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * beadR * s, c + Math.sin(a) * beadR * s, 1.5 * s, 0, TAU);
        ctx.fill();
      }
    }

    // where the next ring will open
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 247, 238, .16)';
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([3 * s, 9 * s]);
    ctx.beginPath();
    ctx.arc(c, c, (ringGeom(this.rings).r2 + RING_W * 0.5) * s, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // the hovered person's 4 pieces
    if (this.hover !== null && this.people[this.hover]) {
      const place = placement(this.hover);
      const { r1, r2, slots } = ringGeom(place.ring);
      const step = TAU / slots;
      ctx.save();
      ctx.strokeStyle = '#FBF7EE';
      ctx.lineWidth = 4 * s;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(251, 247, 238, .6)';
      ctx.shadowBlur = 10 * s;
      for (const slot of place.slots) {
        const a = slotAngle(slot, slots);
        ctx.beginPath();
        ctx.arc(c, c, r2 * s, a - step / 2, a + step / 2);
        ctx.arc(c, c, r1 * s, a + step / 2, a - step / 2, true);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    drawLotus(ctx, c, c, (ringGeom(1).r1 - 6) * s);
  }
}
