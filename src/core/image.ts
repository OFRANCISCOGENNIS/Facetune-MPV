/** Minimal RGBA image container, structurally compatible with DOM ImageData. */
export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createImg(width: number, height: number): Img {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImg(src: Img): Img {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

export function fullRect(img: { width: number; height: number }): Rect {
  return { x0: 0, y0: 0, x1: img.width, y1: img.height };
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  return {
    x0: Math.max(0, Math.floor(r.x0)),
    y0: Math.max(0, Math.floor(r.y0)),
    x1: Math.min(width, Math.ceil(r.x1)),
    y1: Math.min(height, Math.ceil(r.y1)),
  };
}

/** Largest dimension the editor works at; keeps brushes interactive on phones. */
export const MAX_WORKING_SIZE = 1280;

export function fitSize(width: number, height: number, max = MAX_WORKING_SIZE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function copyRegion(img: Img, r: Rect): Uint8ClampedArray {
  const w = r.x1 - r.x0;
  const out = new Uint8ClampedArray(w * (r.y1 - r.y0) * 4);
  for (let y = r.y0; y < r.y1; y++) {
    const off = (y * img.width + r.x0) * 4;
    out.set(img.data.subarray(off, off + w * 4), (y - r.y0) * w * 4);
  }
  return out;
}

export function pasteRegion(img: Img, r: Rect, data: Uint8ClampedArray): void {
  const w = r.x1 - r.x0;
  for (let y = r.y0; y < r.y1; y++) {
    img.data.set(data.subarray((y - r.y0) * w * 4, (y - r.y0 + 1) * w * 4), (y * img.width + r.x0) * 4);
  }
}
