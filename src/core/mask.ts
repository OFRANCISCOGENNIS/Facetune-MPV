import type { Rect } from './image';

/** Per-pixel 0..255 strength map for a brush tool. */
export type Mask = Uint8Array;

export interface Dab {
  x: number;
  y: number;
  radius: number;
  /** 0..1 opacity added per dab. */
  strength: number;
  erase: boolean;
}

/** Paints one soft round dab; returns the touched rect. */
export function paintDab(mask: Mask, width: number, height: number, dab: Dab): Rect {
  const { x, y, radius, strength, erase } = dab;
  const x0 = Math.max(0, Math.floor(x - radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const x1 = Math.min(width, Math.ceil(x + radius + 1));
  const y1 = Math.min(height, Math.ceil(y + radius + 1));
  const r2 = radius * radius;
  for (let py = y0; py < y1; py++) {
    const dy = py - y;
    for (let px = x0; px < x1; px++) {
      const dx = px - x;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      // Smooth quadratic falloff gives a feathered brush edge.
      const t = 1 - d2 / r2;
      const a = strength * t * t;
      const idx = py * width + px;
      const v = mask[idx];
      mask[idx] = erase ? v * (1 - a) : v + (255 - v) * a;
    }
  }
  return { x0, y0, x1, y1 };
}

/** Paints evenly spaced dabs between two points. */
export function paintStroke(
  mask: Mask,
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  brush: Omit<Dab, 'x' | 'y'>,
): Rect {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = Math.max(1, brush.radius * 0.25);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  let rect: Rect = { x0: width, y0: height, x1: 0, y1: 0 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const r = paintDab(mask, width, height, { ...brush, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    rect = { x0: Math.min(rect.x0, r.x0), y0: Math.min(rect.y0, r.y0), x1: Math.max(rect.x1, r.x1), y1: Math.max(rect.y1, r.y1) };
  }
  return rect;
}
