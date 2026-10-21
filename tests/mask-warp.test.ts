import { describe, expect, it } from 'vitest';
import { createImg } from '../src/core/image';
import { paintDab, paintStroke } from '../src/core/mask';
import { applyWarp, createDisplacement, isIdentity, pushWarp } from '../src/core/warp';

describe('mask brush', () => {
  it('paints strongest at the centre and nothing outside the radius', () => {
    const m = new Uint8Array(21 * 21);
    paintDab(m, 21, 21, { x: 10, y: 10, radius: 6, strength: 1, erase: false });
    expect(m[10 * 21 + 10]).toBe(255);
    expect(m[10 * 21 + 13]).toBeGreaterThan(0);
    expect(m[10 * 21 + 13]).toBeLessThan(255);
    expect(m[10 * 21 + 17]).toBe(0);
  });

  it('erases', () => {
    const m = new Uint8Array(21 * 21).fill(255);
    paintDab(m, 21, 21, { x: 10, y: 10, radius: 6, strength: 1, erase: true });
    expect(m[10 * 21 + 10]).toBe(0);
    expect(m[0]).toBe(255);
  });

  it('strokes cover the path and report the dirty rect', () => {
    const m = new Uint8Array(50 * 10);
    const r = paintStroke(m, 50, 10, { x: 5, y: 5 }, { x: 45, y: 5 }, { radius: 3, strength: 1, erase: false });
    for (let x = 6; x < 45; x++) expect(m[5 * 50 + x]).toBeGreaterThan(100);
    expect(r.x0).toBeLessThanOrEqual(5);
    expect(r.x1).toBeGreaterThanOrEqual(45);
  });
});

describe('reshape warp', () => {
  it('starts as identity', () => {
    const d = createDisplacement(10, 10);
    expect(isIdentity(d)).toBe(true);
  });

  it('pushes content in the drag direction', () => {
    const w = 40;
    const h = 20;
    const img = createImg(w, h);
    // White vertical bar at x=15.
    for (let y = 0; y < h; y++) img.data.set([255, 255, 255, 255], (y * w + 15) * 4);
    const d = createDisplacement(w, h);
    pushWarp(d, { x: 15, y: 10 }, { x: 19, y: 10 }, 10, 1);
    expect(isIdentity(d)).toBe(false);
    const out = applyWarp(img, d);
    // Bar should now appear near x=19 on the centre row.
    const row = Array.from({ length: w }, (_, x) => out.data[(10 * w + x) * 4]);
    const brightest = row.indexOf(Math.max(...row));
    expect(brightest).toBeGreaterThanOrEqual(18);
    expect(brightest).toBeLessThanOrEqual(20);
  });
});
