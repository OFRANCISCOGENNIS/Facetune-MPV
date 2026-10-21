import { type Adjustments, DEFAULT_ADJUSTMENTS, type FilterId, applyAdjustments } from './adjust';
import { boxBlur, sharpen, skinMask, surfaceSmooth, whiten } from './filters';
import { History } from './history';
import { applyHeal, planHeal } from './heal';
import { type Img, type Rect, clampRect, cloneImg, copyRegion, fullRect, pasteRegion } from './image';
import { type Mask, paintStroke } from './mask';
import { type Displacement, applyWarp, createDisplacement, isIdentity, pushWarp } from './warp';

/** Brush tools that paint a mask over a precomputed effect layer. */
export type MaskTool = 'smooth' | 'whiten' | 'details';
export type BrushTool = MaskTool | 'reshape';
const MASK_TOOLS: MaskTool[] = ['smooth', 'whiten', 'details'];

interface Look {
  adjust: Adjustments;
  filter: FilterId;
  filterIntensity: number;
}

type Snapshot =
  | { kind: 'mask'; tool: MaskTool; data: Mask }
  | { kind: 'warp'; dx: Float32Array; dy: Float32Array }
  | { kind: 'look'; look: Look }
  /** Pixels of base + every layer inside `rect` (heal is a local, destructive op). */
  | { kind: 'region'; rect: Rect; data: Uint8ClampedArray[] };

export interface Point {
  x: number;
  y: number;
}

/**
 * Non-destructive editing engine.
 *
 * State = original pixels + one mask per brush tool + a displacement field +
 * global look (adjustments/filter). The output is always recomposed from the
 * original, so every tool can be erased or undone independently:
 *
 *   original ─► heal patches (base) ─► blend(smooth, whiten, details by mask) ─► adjust+filter ─► warp ─► output
 */
export class Editor {
  readonly width: number;
  readonly height: number;
  readonly original: Img;
  /** Original with blemish patches applied; everything else derives from it. */
  private base: Img;
  private layers: Record<MaskTool, Img>;
  private masks: Record<MaskTool, Mask>;
  private disp: Displacement;
  private warpActive = false;
  private look: Look = { adjust: { ...DEFAULT_ADJUSTMENTS }, filter: 'none', filterIntensity: 1 };
  /** Original + masks + look, before warping. */
  private retouched: Img;
  private history = new History<Snapshot>(25);
  private strokeSnapshot: Snapshot | null = null;

  constructor(original: Img) {
    this.width = original.width;
    this.height = original.height;
    this.original = cloneImg(original);
    this.base = cloneImg(original);
    const radius = Math.max(2, Math.round(Math.max(this.width, this.height) / 160));
    this.layers = {
      smooth: surfaceSmooth(this.original, radius),
      whiten: whiten(this.original),
      details: sharpen(this.original, 1.4),
    };
    const n = this.width * this.height;
    this.masks = { smooth: new Uint8Array(n), whiten: new Uint8Array(n), details: new Uint8Array(n) };
    this.disp = createDisplacement(this.width, this.height);
    this.retouched = cloneImg(this.original);
  }

  // ---- brush strokes -------------------------------------------------------

  beginStroke(tool: BrushTool): void {
    this.strokeSnapshot =
      tool === 'reshape'
        ? { kind: 'warp', dx: this.disp.dx.slice(), dy: this.disp.dy.slice() }
        : { kind: 'mask', tool, data: this.masks[tool].slice() };
  }

  /**
   * Applies one stroke segment. `from`/`to` are in *output* (screen) space;
   * masks live in source space, so points are mapped back through the warp.
   */
  strokeSegment(tool: BrushTool, from: Point, to: Point, radius: number, strength: number, erase = false): void {
    if (tool === 'reshape') {
      pushWarp(this.disp, from, to, radius, strength);
      this.warpActive = true;
      return;
    }
    const a = this.toSource(from);
    const b = this.toSource(to);
    const rect = paintStroke(this.masks[tool], this.width, this.height, a, b, { radius, strength: strength * 0.35, erase });
    this.recomposite(rect);
  }

  endStroke(): void {
    if (this.strokeSnapshot) this.history.push(this.strokeSnapshot);
    this.strokeSnapshot = null;
  }

  /** One-tap skin smoothing driven by a heuristic skin mask. */
  autoSmooth(amount = 0.7): void {
    this.history.push({ kind: 'mask', tool: 'smooth', data: this.masks.smooth.slice() });
    const skin = skinMask(this.original);
    // Feather the binary mask so transitions are invisible.
    const w = this.width;
    const h = this.height;
    const tmp: Img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let i = 0; i < skin.length; i++) tmp.data[i * 4] = skin[i];
    const soft = boxBlur(tmp, Math.max(2, Math.round(Math.max(w, h) / 200)));
    const m = this.masks.smooth;
    for (let i = 0; i < m.length; i++) m[i] = Math.max(m[i], soft.data[i * 4] * amount);
    this.recomposite(fullRect(this));
  }

  /** Removes a blemish under `p` (output space). Returns false if no patch fits. */
  heal(p: Point, radius: number): boolean {
    const s = this.toSource(p);
    const plan = planHeal(this.base, Math.round(s.x), Math.round(s.y), Math.max(2, radius));
    if (!plan) return false;
    const rect = clampRect(plan.rect, this.width, this.height);
    this.history.push(this.captureRegion(rect));
    for (const img of this.healTargets()) applyHeal(img, plan);
    this.recomposite(rect);
    return true;
  }

  private healTargets(): Img[] {
    return [this.base, ...MASK_TOOLS.map((t) => this.layers[t])];
  }

  private captureRegion(rect: Rect): Snapshot {
    return { kind: 'region', rect, data: this.healTargets().map((img) => copyRegion(img, rect)) };
  }

  clearTool(tool: BrushTool): void {
    if (tool === 'reshape') {
      this.history.push({ kind: 'warp', dx: this.disp.dx.slice(), dy: this.disp.dy.slice() });
      this.disp = createDisplacement(this.width, this.height);
      this.warpActive = false;
      return;
    }
    this.history.push({ kind: 'mask', tool, data: this.masks[tool].slice() });
    this.masks[tool].fill(0);
    this.recomposite(fullRect(this));
  }

  // ---- look ---------------------------------------------------------------

  getLook(): Readonly<Look> {
    return this.look;
  }

  /** Call once before a slider drag / filter tap so the change is one undo step. */
  checkpointLook(): void {
    this.history.push({ kind: 'look', look: structuredClone(this.look) });
  }

  setLook(patch: Partial<Adjustments> & { filter?: FilterId; filterIntensity?: number }): void {
    const { filter, filterIntensity, ...adj } = patch;
    this.look = {
      adjust: { ...this.look.adjust, ...adj },
      filter: filter ?? this.look.filter,
      filterIntensity: filterIntensity ?? this.look.filterIntensity,
    };
    this.recomposite(fullRect(this));
  }

  // ---- history ------------------------------------------------------------

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): boolean {
    return this.apply(this.history.undo((t) => this.capture(t)));
  }

  redo(): boolean {
    return this.apply(this.history.redo((t) => this.capture(t)));
  }

  private apply(target: Snapshot | undefined): boolean {
    if (!target) return false;
    this.restore(target);
    return true;
  }

  private capture(like: Snapshot): Snapshot {
    switch (like.kind) {
      case 'mask':
        return { kind: 'mask', tool: like.tool, data: this.masks[like.tool].slice() };
      case 'warp':
        return { kind: 'warp', dx: this.disp.dx.slice(), dy: this.disp.dy.slice() };
      case 'look':
        return { kind: 'look', look: structuredClone(this.look) };
      case 'region':
        return this.captureRegion(like.rect);
    }
  }

  private restore(s: Snapshot): void {
    switch (s.kind) {
      case 'mask':
        this.masks[s.tool] = s.data;
        this.recomposite(fullRect(this));
        break;
      case 'warp':
        this.disp = { width: this.width, height: this.height, dx: s.dx, dy: s.dy };
        this.warpActive = !isIdentity(this.disp);
        break;
      case 'look':
        this.look = s.look;
        this.recomposite(fullRect(this));
        break;
      case 'region':
        this.healTargets().forEach((img, i) => pasteRegion(img, s.rect, s.data[i]));
        this.recomposite(s.rect);
        break;
    }
  }

  // ---- rendering ----------------------------------------------------------

  /** Final image (retouch + look + warp). */
  render(): Img {
    return this.warpActive ? applyWarp(this.retouched, this.disp) : this.retouched;
  }

  getMask(tool: MaskTool): Readonly<Mask> {
    return this.masks[tool];
  }

  private toSource(p: Point): Point {
    if (!this.warpActive) return p;
    const x = Math.min(Math.max(Math.round(p.x), 0), this.width - 1);
    const y = Math.min(Math.max(Math.round(p.y), 0), this.height - 1);
    const i = y * this.width + x;
    return { x: p.x + this.disp.dx[i], y: p.y + this.disp.dy[i] };
  }

  private recomposite(rect: Rect): void {
    const r = clampRect(rect, this.width, this.height);
    const out = this.retouched.data;
    const src = this.base.data;
    const w = this.width;
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const p = y * w + x;
        const i = p * 4;
        let cr = src[i];
        let cg = src[i + 1];
        let cb = src[i + 2];
        for (const tool of MASK_TOOLS) {
          const m = this.masks[tool][p];
          if (m === 0) continue;
          const a = m / 255;
          const l = this.layers[tool].data;
          cr += (l[i] - cr) * a;
          cg += (l[i + 1] - cg) * a;
          cb += (l[i + 2] - cb) * a;
        }
        out[i] = cr;
        out[i + 1] = cg;
        out[i + 2] = cb;
        out[i + 3] = src[i + 3];
      }
    }
    const { adjust, filter, filterIntensity } = this.look;
    applyAdjustments(this.retouched, adjust, filter, filterIntensity, r);
  }
}
