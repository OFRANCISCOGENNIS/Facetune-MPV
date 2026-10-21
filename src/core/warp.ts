import type { Img } from './image';

/**
 * Backward-mapping displacement field: output pixel p samples the source at
 * p + (dx[p], dy[p]). Drives the Reshape (liquify) tool.
 */
export interface Displacement {
  width: number;
  height: number;
  dx: Float32Array;
  dy: Float32Array;
}

export function createDisplacement(width: number, height: number): Displacement {
  return { width, height, dx: new Float32Array(width * height), dy: new Float32Array(width * height) };
}

export function isIdentity(d: Displacement): boolean {
  for (let i = 0; i < d.dx.length; i++) if (d.dx[i] !== 0 || d.dy[i] !== 0) return false;
  return true;
}

function sampleField(f: Float32Array, w: number, h: number, x: number, y: number): number {
  x = Math.min(Math.max(x, 0), w - 1);
  y = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = f[y0 * w + x0] + (f[y0 * w + x1] - f[y0 * w + x0]) * fx;
  const b = f[y1 * w + x0] + (f[y1 * w + x1] - f[y1 * w + x0]) * fx;
  return a + (b - a) * fy;
}

/**
 * Forward "push" warp: content under the brush moves along the drag vector.
 * Composes with the existing field so repeated strokes accumulate correctly.
 */
export function pushWarp(
  d: Displacement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  strength = 1,
): void {
  const { width: w, height: h } = d;
  const mx = to.x - from.x;
  const my = to.y - from.y;
  if (mx === 0 && my === 0) return;
  const x0 = Math.max(0, Math.floor(to.x - radius));
  const y0 = Math.max(0, Math.floor(to.y - radius));
  const x1 = Math.min(w, Math.ceil(to.x + radius + 1));
  const y1 = Math.min(h, Math.ceil(to.y + radius + 1));
  // Snapshot only the neighbourhood the samples can reach (brush + drag).
  const pad = Math.ceil(Math.hypot(mx, my)) + 2;
  const bx0 = Math.max(0, x0 - pad);
  const by0 = Math.max(0, y0 - pad);
  const bw = Math.min(w, x1 + pad) - bx0;
  const bh = Math.min(h, y1 + pad) - by0;
  const oldDx = new Float32Array(bw * bh);
  const oldDy = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const off = (by0 + y) * w + bx0;
    oldDx.set(d.dx.subarray(off, off + bw), y * bw);
    oldDy.set(d.dy.subarray(off, off + bw), y * bw);
  }
  const r2 = radius * radius;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ex = x - to.x;
      const ey = y - to.y;
      const d2 = ex * ex + ey * ey;
      if (d2 >= r2) continue;
      const t = 1 - d2 / r2;
      const f = t * t * strength;
      const sx = x - mx * f - bx0;
      const sy = y - my * f - by0;
      const i = y * w + x;
      d.dx[i] = sampleField(oldDx, bw, bh, sx, sy) - mx * f;
      d.dy[i] = sampleField(oldDy, bw, bh, sx, sy) - my * f;
    }
  }
}

/** Applies the displacement with bilinear sampling. */
export function applyWarp(src: Img, d: Displacement): Img {
  const { width: w, height: h } = src;
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const ddx = d.dx[i];
      const ddy = d.dy[i];
      if (ddx === 0 && ddy === 0) {
        out[o] = s[o];
        out[o + 1] = s[o + 1];
        out[o + 2] = s[o + 2];
        out[o + 3] = s[o + 3];
        continue;
      }
      const sx = Math.min(Math.max(x + ddx, 0), w - 1);
      const sy = Math.min(Math.max(y + ddy, 0), h - 1);
      const xa = Math.floor(sx);
      const ya = Math.floor(sy);
      const xb = Math.min(xa + 1, w - 1);
      const yb = Math.min(ya + 1, h - 1);
      const fx = sx - xa;
      const fy = sy - ya;
      const p00 = (ya * w + xa) * 4;
      const p10 = (ya * w + xb) * 4;
      const p01 = (yb * w + xa) * 4;
      const p11 = (yb * w + xb) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[p00 + c] + (s[p10 + c] - s[p00 + c]) * fx;
        const bot = s[p01 + c] + (s[p11 + c] - s[p01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return { width: w, height: h, data: out };
}
