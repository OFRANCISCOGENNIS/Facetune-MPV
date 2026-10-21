import './styles.css';
import { type Adjustments, FILTERS } from './core/adjust';
import { type BrushTool, Editor, type Point } from './core/editor';
import { fitSize } from './core/image';

type Tool = BrushTool | 'heal' | 'adjust' | 'filters';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d')!;
const cursor = $('cursor');
const panel = $('panel');
const stage = $('stage');
const undoBtn = $<HTMLButtonElement>('undo');
const redoBtn = $<HTMLButtonElement>('redo');
const compareBtn = $<HTMLButtonElement>('compare');
const exportBtn = $<HTMLButtonElement>('export');

const BRUSH_HINT: Record<BrushTool | 'heal', string> = {
  heal: 'Toque sobre espinhas e manchas para removê-las.',
  smooth: 'Pinte sobre a pele para suavizar.',
  whiten: 'Pinte sobre dentes ou olhos para clarear.',
  details: 'Pinte para realçar olhos, cabelo e texturas.',
  reshape: 'Arraste para empurrar e remodelar traços.',
};

const state = {
  editor: null as Editor | null,
  tool: 'smooth' as Tool,
  /** Brush diameter in screen pixels, remembered per tool. */
  sizes: { smooth: 60, heal: 24, whiten: 24, details: 40, reshape: 70 } as Record<BrushTool | 'heal', number>,
  strength: 0.6,
  erase: false,
  showingOriginal: false,
  renderQueued: false,
};

// ---- loading ---------------------------------------------------------------

async function loadFile(file: File | undefined) {
  if (!file || !file.type.startsWith('image/')) return;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d')!;
  octx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = octx.getImageData(0, 0, width, height);
  state.editor = new Editor(pixels);
  canvas.width = width;
  canvas.height = height;
  $('empty').hidden = true;
  $('canvasWrap').hidden = false;
  $('tools').hidden = false;
  panel.hidden = false;
  compareBtn.disabled = false;
  exportBtn.disabled = false;
  selectTool(state.tool);
  requestRender();
}

for (const id of ['file', 'file2']) {
  $<HTMLInputElement>(id).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    loadFile(input.files?.[0]);
    input.value = '';
  });
}

stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  stage.classList.add('dragover');
});
stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.classList.remove('dragover');
  loadFile(e.dataTransfer?.files[0]);
});

// ---- rendering -------------------------------------------------------------

function requestRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    const ed = state.editor;
    if (!ed) return;
    const img = state.showingOriginal ? ed.original : ed.render();
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    undoBtn.disabled = !ed.canUndo;
    redoBtn.disabled = !ed.canRedo;
  });
}

// ---- tools & panel ---------------------------------------------------------

function isBrush(tool: Tool): tool is BrushTool {
  return tool !== 'adjust' && tool !== 'filters' && tool !== 'heal';
}

/** Tools that show a circular cursor sized by the brush slider. */
function usesCursor(tool: Tool): tool is BrushTool | 'heal' {
  return isBrush(tool) || tool === 'heal';
}

function selectTool(tool: Tool) {
  state.tool = tool;
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool === 'reshape') state.erase = false;
  renderPanel();
}

document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) =>
  b.addEventListener('click', () => selectTool(b.dataset.tool as Tool)),
);

function slider(label: string, min: number, max: number, value: number, onInput: (v: number) => void, onStart?: () => void) {
  const row = document.createElement('div');
  row.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  const out = document.createElement('output');
  out.textContent = String(value);
  if (onStart) input.addEventListener('pointerdown', onStart);
  if (onStart) input.addEventListener('keydown', onStart);
  input.addEventListener('input', () => {
    out.textContent = input.value;
    onInput(Number(input.value));
  });
  row.append(lab, input, out);
  return row;
}

function button(label: string, onClick: () => void, cls = 'btn') {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderPanel() {
  const ed = state.editor;
  panel.replaceChildren();
  if (!ed) return;
  const tool = state.tool;

  if (usesCursor(tool)) {
    const hint = document.createElement('div');
    hint.className = 'row';
    hint.style.color = 'var(--muted)';
    hint.textContent = BRUSH_HINT[tool];
    panel.append(
      hint,
      slider('Tamanho', 10, 160, state.sizes[tool], (v) => (state.sizes[tool] = v)),
    );
    if (tool === 'heal') return;
    panel.append(slider('Intensidade', 5, 100, Math.round(state.strength * 100), (v) => (state.strength = v / 100)));
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (tool === 'smooth') {
      actions.append(
        button('✨ Auto', () => {
          ed.autoSmooth();
          requestRender();
        }, 'btn primary'),
      );
    }
    if (tool !== 'reshape') {
      const eraseBtn = button('Borracha', () => {
        state.erase = !state.erase;
        eraseBtn.classList.toggle('active', state.erase);
      });
      eraseBtn.classList.toggle('active', state.erase);
      actions.append(eraseBtn);
    }
    actions.append(
      button('Limpar', () => {
        ed.clearTool(tool);
        requestRender();
      }),
    );
    panel.append(actions);
    return;
  }

  const look = ed.getLook();
  if (tool === 'adjust') {
    const defs: [keyof Adjustments, string, number, number][] = [
      ['brightness', 'Brilho', -100, 100],
      ['contrast', 'Contraste', -100, 100],
      ['saturation', 'Saturação', -100, 100],
      ['warmth', 'Temperatura', -100, 100],
      ['vignette', 'Vinheta', 0, 100],
    ];
    for (const [key, label, min, max] of defs) {
      panel.append(
        slider(label, min, max, look.adjust[key], (v) => {
          ed.setLook({ [key]: v });
          requestRender();
        }, () => ed.checkpointLook()),
      );
    }
    return;
  }

  // filters
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const f of FILTERS) {
    const chip = button(f.label, () => {
      ed.checkpointLook();
      ed.setLook({ filter: f.id });
      renderPanel();
      requestRender();
    }, 'btn chip');
    chip.classList.toggle('active', look.filter === f.id);
    chips.append(chip);
  }
  panel.append(
    chips,
    slider('Intensidade', 0, 100, Math.round(look.filterIntensity * 100), (v) => {
      ed.setLook({ filterIntensity: v / 100 });
      requestRender();
    }, () => ed.checkpointLook()),
  );
}

// ---- pointer input ---------------------------------------------------------

/** Screen → image pixel coordinates. */
function toImage(e: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}

function brushSize(): number {
  return usesCursor(state.tool) ? state.sizes[state.tool] : 0;
}

function brushRadiusInImage(): number {
  const r = canvas.getBoundingClientRect();
  return (brushSize() / 2) * (canvas.width / r.width);
}

function updateCursor(e: PointerEvent) {
  const wrap = $('canvasWrap').getBoundingClientRect();
  cursor.hidden = !usesCursor(state.tool) || !state.editor;
  cursor.style.width = cursor.style.height = `${brushSize()}px`;
  cursor.style.left = `${e.clientX - wrap.left}px`;
  cursor.style.top = `${e.clientY - wrap.top}px`;
}

let last: Point | null = null;

canvas.addEventListener('pointerdown', (e) => {
  const ed = state.editor;
  if (ed && state.tool === 'heal') {
    ed.heal(toImage(e), brushRadiusInImage());
    requestRender();
    return;
  }
  if (!ed || !isBrush(state.tool)) return;
  canvas.setPointerCapture(e.pointerId);
  last = toImage(e);
  ed.beginStroke(state.tool);
  if (state.tool !== 'reshape') {
    ed.strokeSegment(state.tool, last, last, brushRadiusInImage(), state.strength, state.erase);
    requestRender();
  }
  updateCursor(e);
});

canvas.addEventListener('pointermove', (e) => {
  updateCursor(e);
  const ed = state.editor;
  if (!ed || !last || !isBrush(state.tool)) return;
  const p = toImage(e);
  ed.strokeSegment(state.tool, last, p, brushRadiusInImage(), state.strength, state.erase);
  last = p;
  requestRender();
});

function endStroke() {
  if (!last) return;
  last = null;
  state.editor?.endStroke();
  requestRender();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', () => (cursor.hidden = true));

// ---- top bar ---------------------------------------------------------------

undoBtn.addEventListener('click', () => {
  state.editor?.undo();
  renderPanel();
  requestRender();
});
redoBtn.addEventListener('click', () => {
  state.editor?.redo();
  renderPanel();
  requestRender();
});

function setCompare(on: boolean) {
  state.showingOriginal = on;
  compareBtn.classList.toggle('active', on);
  requestRender();
}
compareBtn.addEventListener('pointerdown', () => setCompare(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) compareBtn.addEventListener(ev, () => setCompare(false));

exportBtn.addEventListener('click', () => {
  const ed = state.editor;
  if (!ed) return;
  const img = ed.render();
  const out = document.createElement('canvas');
  out.width = img.width;
  out.height = img.height;
  out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  out.toBlob(
    (blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `facetune-mvp-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    'image/jpeg',
    0.92,
  );
});

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) redoBtn.click();
  else undoBtn.click();
});
