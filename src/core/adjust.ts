import type { Img, Rect } from './image';

export interface Adjustments {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  warmth: number; // -100..100
  vignette: number; // 0..100
}

export const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };

export type FilterId = 'none' | 'glow' | 'vivid' | 'vintage' | 'cool' | 'mono' | 'drama';

/** 3x4 colour matrices (row-major, last column is an offset in 0..255). */
const FILTER_MATRICES: Record<Exclude<FilterId, 'none'>, number[]> = {
  glow: [1.08, 0.04, 0, 8, 0.02, 1.04, 0, 6, 0, 0, 0.98, 4],
  vivid: [1.25, -0.15, -0.1, 0, -0.08, 1.2, -0.12, 0, -0.08, -0.15, 1.23, 0],
  vintage: [0.6, 0.35, 0.12, 18, 0.28, 0.6, 0.1, 10, 0.22, 0.3, 0.42, 6],
  cool: [0.94, 0, 0, 0, 0, 1.0, 0.04, 0, 0, 0.04, 1.12, 10],
  mono: [0.299, 0.587, 0.114, 0, 0.299, 0.587, 0.114, 0, 0.299, 0.587, 0.114, 0],
  drama: [1.35, -0.1, -0.05, -30, -0.05, 1.3, -0.05, -30, -0.05, -0.1, 1.35, -30],
};

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'glow', label: 'Glow' },
  { id: 'vivid', label: 'Vívido' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'cool', label: 'Frio' },
  { id: 'mono', label: 'P&B' },
  { id: 'drama', label: 'Drama' },
];

export function isNeutral(a: Adjustments, filter: FilterId): boolean {
  return filter === 'none' && a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.warmth === 0 && a.vignette === 0;
}

/** Applies global adjustments then the filter, in place, inside `rect`. */
export function applyAdjustments(img: Img, a: Adjustments, filter: FilterId, filterIntensity: number, rect: Rect): void {
  if (isNeutral(a, filter)) return;
  const { width: w, height: h, data } = img;
  if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return;
  // Brightness + contrast folded into a single tone LUT.
  const lut = new Float32Array(256);
  const b = a.brightness * 1.28;
  const c = 1 + a.contrast / 100;
  for (let v = 0; v < 256; v++) lut[v] = (v + b - 128) * c + 128;
  const sat = 1 + a.saturation / 100;
  const warmR = a.warmth * 0.3;
  const warmB = -a.warmth * 0.3;
  const m = filter === 'none' ? null : FILTER_MATRICES[filter];
  const fi = Math.min(Math.max(filterIntensity, 0), 1);
  const vig = a.vignette / 100;
  const cx = w / 2;
  const cy = h / 2;
  const maxD2 = cx * cx + cy * cy;
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * w + x) * 4;
      let r = lut[data[i]];
      let g = lut[data[i + 1]];
      let bl = lut[data[i + 2]];
      if (sat !== 1) {
        const l = r * 0.299 + g * 0.587 + bl * 0.114;
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        bl = l + (bl - l) * sat;
      }
      r += warmR;
      bl += warmB;
      if (m) {
        const fr = m[0] * r + m[1] * g + m[2] * bl + m[3];
        const fg = m[4] * r + m[5] * g + m[6] * bl + m[7];
        const fb = m[8] * r + m[9] * g + m[10] * bl + m[11];
        r += (fr - r) * fi;
        g += (fg - g) * fi;
        bl += (fb - bl) * fi;
      }
      if (vig > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const t = (dx * dx + dy * dy) / maxD2;
        const k = 1 - vig * t * t * 1.4;
        r *= k;
        g *= k;
        bl *= k;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = bl;
    }
  }
}
