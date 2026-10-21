import { describe, expect, it } from 'vitest';
import { boxBlur, sharpen, skinMask, surfaceSmooth, whiten } from '../src/core/filters';
import { createImg } from '../src/core/image';
import { noisySkin, px, solid, variance } from './helpers';

describe('boxBlur', () => {
  it('leaves a flat image unchanged', () => {
    const img = solid(20, 10, [100, 150, 200]);
    expect(px(boxBlur(img, 3), 5, 5)).toEqual([100, 150, 200, 255]);
  });

  it('reduces noise', () => {
    const img = noisySkin(40, 40);
    expect(variance(boxBlur(img, 2))).toBeLessThan(variance(img) / 4);
  });
});

describe('surfaceSmooth', () => {
  it('removes fine skin noise', () => {
    const img = noisySkin(48, 48);
    expect(variance(surfaceSmooth(img, 3))).toBeLessThan(variance(img) / 3);
  });

  it('preserves strong edges', () => {
    const img = createImg(40, 20);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 40; x++) img.data.set(x < 20 ? [20, 20, 20, 255] : [230, 230, 230, 255], (y * 40 + x) * 4);
    const out = surfaceSmooth(img, 4);
    expect(px(out, 18, 10)[0]).toBeLessThan(60);
    expect(px(out, 21, 10)[0]).toBeGreaterThan(190);
  });
});

describe('whiten', () => {
  it('makes yellowish teeth brighter and less saturated', () => {
    const [r, g, b] = px(whiten(solid(2, 2, [220, 200, 140])), 0, 0);
    expect((r + g + b) / 3).toBeGreaterThan((220 + 200 + 140) / 3);
    expect(r - b).toBeLessThan(220 - 140);
  });
});

describe('sharpen', () => {
  it('increases local contrast', () => {
    const img = noisySkin(30, 30);
    expect(variance(sharpen(img, 1.5))).toBeGreaterThan(variance(img));
  });
});

describe('skinMask', () => {
  it('detects skin tones and rejects blue', () => {
    expect(skinMask(solid(1, 1, [210, 160, 135]))[0]).toBe(255);
    expect(skinMask(solid(1, 1, [40, 90, 220]))[0]).toBe(0);
  });
});
