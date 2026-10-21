import { type Img, createImg } from '../src/core/image';

export function solid(w: number, h: number, rgb: [number, number, number]): Img {
  const img = createImg(w, h);
  for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
  return img;
}

/** Deterministic noisy "skin" image so smoothing has something to remove. */
export function noisySkin(w: number, h: number, seed = 1): Img {
  const img = createImg(w, h);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  for (let i = 0; i < w * h; i++) {
    const n = rnd() * 12;
    img.data.set([210 + n, 160 + n, 135 + n, 255], i * 4);
  }
  return img;
}

export function px(img: Img, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.slice(i, i + 4));
}

export function variance(img: Img): number {
  let sum = 0;
  let sq = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const v = img.data[i * 4];
    sum += v;
    sq += v * v;
  }
  const mean = sum / n;
  return sq / n - mean * mean;
}
