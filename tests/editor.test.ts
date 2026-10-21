import { describe, expect, it } from 'vitest';
import { Editor } from '../src/core/editor';
import { noisySkin, px, solid, variance } from './helpers';

describe('Editor', () => {
  it('renders the original untouched', () => {
    const img = noisySkin(30, 30);
    expect(Array.from(new Editor(img).render().data)).toEqual(Array.from(img.data));
  });

  it('smooth brush reduces noise only where painted, and undo/redo works', () => {
    const img = noisySkin(60, 60);
    const ed = new Editor(img);
    ed.beginStroke('smooth');
    for (let i = 0; i < 6; i++) ed.strokeSegment('smooth', { x: 10, y: 30 }, { x: 50, y: 30 }, 25, 1);
    ed.endStroke();
    expect(variance(ed.render())).toBeLessThan(variance(img));
    expect(px(ed.render(), 0, 0)).toEqual(px(img, 0, 0));

    expect(ed.undo()).toBe(true);
    expect(Array.from(ed.render().data)).toEqual(Array.from(img.data));
    expect(ed.redo()).toBe(true);
    expect(variance(ed.render())).toBeLessThan(variance(img));
  });

  it('eraser restores the original', () => {
    const img = noisySkin(40, 40);
    const ed = new Editor(img);
    ed.autoSmooth(1);
    ed.beginStroke('smooth');
    for (let i = 0; i < 20; i++) ed.strokeSegment('smooth', { x: 0, y: 20 }, { x: 40, y: 20 }, 60, 1, true);
    ed.endStroke();
    expect(Array.from(ed.render().data)).toEqual(Array.from(img.data));
  });

  it('auto smooth targets skin', () => {
    const img = noisySkin(50, 50);
    const ed = new Editor(img);
    ed.autoSmooth();
    expect(variance(ed.render())).toBeLessThan(variance(img) / 2);
  });

  it('adjustments, filters and their undo', () => {
    const img = solid(10, 10, [100, 100, 100]);
    const ed = new Editor(img);
    ed.checkpointLook();
    ed.setLook({ brightness: 50 });
    expect(px(ed.render(), 5, 5)[0]).toBeGreaterThan(100);
    ed.checkpointLook();
    ed.setLook({ filter: 'mono' });
    expect(ed.getLook().filter).toBe('mono');
    ed.undo();
    expect(ed.getLook().filter).toBe('none');
    ed.undo();
    expect(px(ed.render(), 5, 5)[0]).toBe(100);
  });

  it('reshape is undoable and clearable', () => {
    const img = noisySkin(40, 40);
    const ed = new Editor(img);
    ed.beginStroke('reshape');
    ed.strokeSegment('reshape', { x: 20, y: 20 }, { x: 26, y: 20 }, 10, 1);
    ed.endStroke();
    expect(Array.from(ed.render().data)).not.toEqual(Array.from(img.data));
    ed.undo();
    expect(Array.from(ed.render().data)).toEqual(Array.from(img.data));
    ed.redo();
    ed.clearTool('reshape');
    expect(Array.from(ed.render().data)).toEqual(Array.from(img.data));
  });
});

describe('Editor heal', () => {
  it('removes a blemish and is undoable', () => {
    const img = solid(80, 80, [210, 160, 135]);
    // Dark spot in the middle.
    for (let y = 37; y < 43; y++) for (let x = 37; x < 43; x++) img.data.set([120, 60, 50, 255], (y * 80 + x) * 4);
    const ed = new Editor(img);
    expect(ed.heal({ x: 40, y: 40 }, 6)).toBe(true);
    const [r, g, b] = px(ed.render(), 40, 40);
    expect(Math.abs(r - 210) + Math.abs(g - 160) + Math.abs(b - 135)).toBeLessThan(10);
    ed.undo();
    expect(px(ed.render(), 40, 40)).toEqual([120, 60, 50, 255]);
    ed.redo();
    expect(px(ed.render(), 40, 40)[0]).toBeGreaterThan(200);
    // "Before" view still shows the untouched original.
    expect(px(ed.original, 40, 40)).toEqual([120, 60, 50, 255]);
  });

  it('refuses to heal at the image border', () => {
    const ed = new Editor(solid(20, 20, [200, 150, 130]));
    expect(ed.heal({ x: 1, y: 1 }, 6)).toBe(false);
  });
});
