import type { Img } from './image';

/** Separable box blur (running sum). Three passes approximate a gaussian. */
export function boxBlur(src: Img, radius: number, passes = 3): Img {
  const { width: w, height: h } = src;
  const r = Math.max(0, Math.round(radius));
  let a = new Uint8ClampedArray(src.data);
  if (r === 0) return { width: w, height: h, data: a };
  let b = new Uint8ClampedArray(a.length);
  for (let p = 0; p < passes; p++) {
    blurPass(a, b, w, h, r, true);
    blurPass(b, a, w, h, r, false);
  }
  return { width: w, height: h, data: a };
}

function blurPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const norm = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      // Edge-clamped running window sum.
      let sum = src[base + c] * (r + 1);
      for (let i = 1; i <= r; i++) sum += src[base + Math.min(i, len - 1) * step + c];
      for (let i = 0; i < len; i++) {
        dst[base + i * step + c] = sum * norm;
        const add = Math.min(i + r + 1, len - 1);
        const rem = Math.max(i - r, 0);
        sum += src[base + add * step + c] - src[base + rem * step + c];
      }
    }
  }
}

/**
 * Edge-preserving "surface blur": blends toward a blurred copy only where the
 * local difference is small, so pores/blemishes soften but eyes, lips and hair
 * edges stay crisp. This is the core of the Smooth tool.
 */
export function surfaceSmooth(src: Img, radius: number, threshold = 28): Img {
  const blurred = boxBlur(src, radius);
  const out = new Uint8ClampedArray(src.data.length);
  const s = src.data;
  const bl = blurred.data;
  const inv = 1 / (2 * threshold * threshold);
  for (let i = 0; i < s.length; i += 4) {
    const dr = bl[i] - s[i];
    const dg = bl[i + 1] - s[i + 1];
    const db = bl[i + 2] - s[i + 2];
    const d = (dr * 0.299 + dg * 0.587 + db * 0.114);
    const wgt = Math.exp(-d * d * inv);
    out[i] = s[i] + dr * wgt;
    out[i + 1] = s[i + 1] + dg * wgt;
    out[i + 2] = s[i + 2] + db * wgt;
    out[i + 3] = s[i + 3];
  }
  return { width: src.width, height: src.height, data: out };
}

/** Unsharp mask, used by the Details tool. */
export function sharpen(src: Img, amount = 1.2, radius = 1): Img {
  const blurred = boxBlur(src, radius, 1);
  const out = new Uint8ClampedArray(src.data.length);
  const s = src.data;
  const bl = blurred.data;
  for (let i = 0; i < s.length; i += 4) {
    out[i] = s[i] + (s[i] - bl[i]) * amount;
    out[i + 1] = s[i + 1] + (s[i + 1] - bl[i + 1]) * amount;
    out[i + 2] = s[i + 2] + (s[i + 2] - bl[i + 2]) * amount;
    out[i + 3] = s[i + 3];
  }
  return { width: src.width, height: src.height, data: out };
}

/** Teeth/eye whitening: strips yellow cast and lifts lightness. */
export function whiten(src: Img, desaturate = 0.75, lift = 0.22): Img {
  const out = new Uint8ClampedArray(src.data.length);
  const s = src.data;
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i];
    const g = s[i + 1];
    const b = s[i + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    // Desaturate, then pull a little extra toward blue to cancel yellow.
    let nr = r + (l - r) * desaturate;
    let ng = g + (l - g) * desaturate;
    let nb = b + (l - b) * desaturate + 4;
    nr += (255 - nr) * lift;
    ng += (255 - ng) * lift;
    nb += (255 - nb) * lift;
    out[i] = nr;
    out[i + 1] = ng;
    out[i + 2] = nb;
    out[i + 3] = s[i + 3];
  }
  return { width: src.width, height: src.height, data: out };
}

/**
 * Heuristic skin detector in YCbCr space (Chai & Ngan ranges). Returns a
 * 0..255 mask; used by "Auto" smoothing so no ML model download is needed.
 */
export function skinMask(src: Img): Uint8Array {
  const n = src.width * src.height;
  const mask = new Uint8Array(n);
  const s = src.data;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = s[i];
    const g = s[i + 1];
    const b = s[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) mask[p] = 255;
  }
  return mask;
}
