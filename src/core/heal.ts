import type { Img, Rect } from './image';

interface Stats {
  mean: [number, number, number];
  variance: number;
}

/** Colour mean/variance of the ring between r and 1.4r around (cx, cy). */
function ringStats(img: Img, cx: number, cy: number, r: number): Stats | null {
  const { width: w, height: h, data } = img;
  const outer = r * 1.4;
  let n = 0;
  const sum = [0, 0, 0];
  let sq = 0;
  for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r || d > outer) continue;
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      const i = (y * w + x) * 4;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sq += l * l;
      n++;
    }
  }
  if (n === 0) return null;
  const mean: [number, number, number] = [sum[0] / n, sum[1] / n, sum[2] / n];
  const ml = mean[0] * 0.299 + mean[1] * 0.587 + mean[2] * 0.114;
  return { mean, variance: sq / n - ml * ml };
}

/** Colour mean and luminance variance of the disc itself. */
function discStats(img: Img, cx: number, cy: number, r: number): Stats {
  const { width: w, data } = img;
  let n = 0;
  const sum = [0, 0, 0];
  let sq = 0;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x - cx, y - cy) > r) continue;
      const i = (y * w + x) * 4;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sq += l * l;
      n++;
    }
  }
  const mean: [number, number, number] = [sum[0] / n, sum[1] / n, sum[2] / n];
  const ml = mean[0] * 0.299 + mean[1] * 0.587 + mean[2] * 0.114;
  return { mean, variance: sq / n - ml * ml };
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export interface HealPlan {
  /** Source offset to clone from. */
  ox: number;
  oy: number;
  /** Colour correction added to cloned pixels. */
  shift: [number, number, number];
  rect: Rect;
  cx: number;
  cy: number;
  r: number;
}

/**
 * Blemish removal (Facetune's "Patch"): finds the cleanest nearby disc of
 * skin whose surroundings match the target, then clones it in with a
 * feathered edge and colour correction.
 */
export function planHeal(img: Img, cx: number, cy: number, r: number): HealPlan | null {
  const target = ringStats(img, cx, cy, r);
  if (!target) return null;
  let best: { score: number; ox: number; oy: number; stats: Stats } | null = null;
  for (const dist of [2.2, 2.8, 3.6]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const ox = Math.round(Math.cos(a) * r * dist);
      const oy = Math.round(Math.sin(a) * r * dist);
      const sx = cx + ox;
      const sy = cy + oy;
      const s = ringStats(img, sx, sy, r);
      if (!s) continue;
      const disc = discStats(img, sx, sy, r);
      // The patch must look like the skin around the blemish (rejects
      // background, eyes, lips) and be clean (low variance).
      const score =
        colorDist(disc.mean, target.mean) * 2 +
        colorDist(s.mean, target.mean) +
        Math.sqrt(Math.max(0, disc.variance)) * 1.5;
      if (!best || score < best.score) best = { score, ox, oy, stats: s };
    }
  }
  if (!best) return null;
  return {
    ox: best.ox,
    oy: best.oy,
    shift: [target.mean[0] - best.stats.mean[0], target.mean[1] - best.stats.mean[1], target.mean[2] - best.stats.mean[2]],
    rect: { x0: Math.floor(cx - r), y0: Math.floor(cy - r), x1: Math.ceil(cx + r + 1), y1: Math.ceil(cy + r + 1) },
    cx,
    cy,
    r,
  };
}

/** Applies a plan to an image in place (same plan can be replayed on derived layers). */
export function applyHeal(img: Img, plan: HealPlan): void {
  const { width: w, height: h, data } = img;
  const { cx, cy, r, ox, oy, shift } = plan;
  // Source discs sit >= 2.2r away, so they never overlap the target: read in place.
  const src = data;
  for (let y = Math.max(0, plan.rect.y0); y < Math.min(h, plan.rect.y1); y++) {
    for (let x = Math.max(0, plan.rect.x0); x < Math.min(w, plan.rect.x1); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const sx = x + ox;
      const sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      // Solid core, soft outer 40% so the patch blends in.
      const a = d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
      const i = (y * w + x) * 4;
      const j = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = src[i + c] + (src[j + c] + shift[c] - src[i + c]) * a;
    }
  }
}
