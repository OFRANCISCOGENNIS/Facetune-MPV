'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('edited'), original = $('original');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const sourceContext = original.getContext('2d', { willReadFrequently: true });
  const blurred = document.createElement('canvas');
  const blurContext = blurred.getContext('2d', { willReadFrequently: true });
  const controls = ['exposure', 'warmth', 'saturation', 'smooth'];
  const demoSource = document.querySelector('#demo img').src;
  $('pane-filters').style.setProperty('--filter-image', `url("${demoSource}")`);
  let pixels, softPixels, imageName = 'retrato', filter = 'natural', frame = 0, importRevision = 0;
  let center = { x: .5, y: .4 }, exportURL;
  const status = (text, state = 'ready') => {
    $('status-text').textContent = text;
    $('status').dataset.state = state;
    $('dropzone').setAttribute('aria-busy', String(state === 'loading'));
    $('dropzone').dataset.loadingLabel = text;
  };
  function updateRange(input) {
    const amount = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty('--fill', `${amount * 100}%`);
  }
  function setTab(name, focus = false) {
    document.querySelectorAll('.tool-tab').forEach(tab => {
      const selected = tab.dataset.tab === name;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(`pane-${tab.dataset.tab}`).hidden = !selected;
      if (selected && focus) tab.focus();
    });
  }
  document.querySelectorAll('.tool-tab').forEach(tab => {
    tab.onclick = () => setTab(tab.dataset.tab);
    tab.onkeydown = event => {
      const names = ['adjust', 'retouch', 'filters'];
      const index = names.indexOf(tab.dataset.tab);
      const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); setTab(names[next], true);
    };
  });
  const help = $('help-dialog');
  document.querySelectorAll('.help-trigger').forEach(button => button.onclick = () => help.showModal());
  $('close-help').onclick = $('start-editing').onclick = () => help.close();
  help.addEventListener('click', event => {
    const bounds = help.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) help.close();
  });

  function regionGeometry() {
    const width = Number($('size').value) / 100;
    return { x: center.x, y: center.y, width, height: Math.min(.95, width * canvas.width / canvas.height * 1.3) };
  }
  function placeRegion() {
    const box = regionGeometry(), element = $('region');
    element.style.left = `${(box.x - box.width / 2) * 100}%`;
    element.style.top = `${(box.y - box.height / 2) * 100}%`;
    element.style.width = `${box.width * 100}%`;
    element.style.height = `${box.height * 100}%`;
  }
  function compare() {
    const enabled = $('compare').checked;
    original.style.clipPath = `inset(0 ${enabled ? 100 - Number($('split').value) : 100}% 0 0)`;
    $('comparison-line').hidden = !enabled;
    $('comparison-line').style.left = `${$('split').value}%`;
    $('comparison-control').hidden = !enabled;
    $('original-badge').hidden = !enabled;
    $('compare-handle').setAttribute('aria-valuenow', $('split').value);
    $('compare-handle').setAttribute('aria-valuetext', `${$('split').value}% da foto original`);
    updateRange($('split'));
    $('image-badge').textContent = 'EDITADA';
  }
  function render() {
    frame = 0;
    if (!pixels) return;
    const exposure = Number($('exposure').value) / 100;
    const warmth = Number($('warmth').value) / 100;
    const saturation = 1 + Number($('saturation').value) / 100;
    const smooth = Number($('smooth').value) / 100;
    const local = $('local').checked;
    const box = regionGeometry(), w = canvas.width, h = canvas.height;
    const output = context.createImageData(w, h), data = output.data;
    const gain = 2 ** exposure;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = Math.hypot((x / w - box.x) / (box.width / 2), (y / h - box.y) / (box.height / 2));
        const mask = local ? Math.max(0, Math.min(1, (1 - d) * 4)) : 1;
        // Preserve high-frequency edges; this is an approximate smoothing filter, not skin segmentation.
        const difference = Math.abs(pixels[i] - softPixels[i]) + Math.abs(pixels[i + 1] - softPixels[i + 1]) + Math.abs(pixels[i + 2] - softPixels[i + 2]);
        const blend = smooth * mask * Math.max(0, 1 - difference / 100) * .85;
        let r = pixels[i] * (1 - blend) + softPixels[i] * blend;
        let g = pixels[i + 1] * (1 - blend) + softPixels[i + 1] * blend;
        let b = pixels[i + 2] * (1 - blend) + softPixels[i + 2] * blend;
        const light = local ? 1 + (gain - 1) * mask : gain;
        r = r * light + warmth * 22; g = g * light + warmth * 4; b = b * light - warmth * 20;
        const luma = .2126 * r + .7152 * g + .0722 * b;
        r = luma + (r - luma) * saturation; g = luma + (g - luma) * saturation; b = luma + (b - luma) * saturation;
        if (filter === 'mono') r = g = b = .2126 * r + .7152 * g + .0722 * b;
        if (filter === 'warm') { r = r * 1.04 + 8; g = g * 1.01 + 3; b = b * .94; }
        if (filter === 'film') { r = r * .85 + 24; g = g * .86 + 20; b = b * .84 + 22; }
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = pixels[i + 3];
      }
    }
    context.putImageData(output, 0, 0);
  }
  function scheduleRender() {
    for (const id of controls) {
      const value = Number($(id).value);
      $(`${id}-value`).value = value > 0 ? `+${value}` : String(value);
      updateRange($(id));
    }
    if (!frame) frame = requestAnimationFrame(render);
  }
  function setFilter(name) {
    filter = name;
    document.querySelectorAll('.filter').forEach((button) => {
      const selected = button.dataset.filter === name;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    scheduleRender();
  }
  function reset() {
    for (const id of controls) $(id).value = '0';
    $('local').checked = false; $('region').hidden = true; $('region-options').hidden = true;
    center = { x: .5, y: .4 }; $('size').value = '40'; updateRange($('size'));
    $('compare').checked = false; $('split').value = '50';
    setFilter('natural'); placeRegion(); compare();
  }
  async function decodeNativeImage(blob) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* Try the native image element next. */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Image decode failed')); image.src = url; });
      return image;
    } finally { URL.revokeObjectURL(url); }
  }
  // HEIC files from iOS may arrive without a MIME type. Check the ISO-BMFF
  // signature as well as the filename/type instead of relying on file.type alone.
  async function isHeif(blob, filename) {
    if (/^image\/hei[cf](?:-sequence)?$/i.test(blob.type) || /\.hei[cf]$/i.test(filename)) return true;
    const header = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
    if (header.length < 16 || String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') return false;
    const end = Math.min(new DataView(header.buffer).getUint32(0), header.length);
    const brands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
    for (let offset = 8; offset + 4 <= end; offset += 4) {
      if (offset !== 12 && brands.has(String.fromCharCode(...header.slice(offset, offset + 4)))) return true;
    }
    return false;
  }
  // Serialize decoder calls. A late result must never replace a more recent import.
  let heifQueue = Promise.resolve();
  function decodeHeif(blob, token) {
    const task = heifQueue.then(async () => {
      if (token !== importRevision) return null;
      if (typeof window.HeicTo !== 'function') throw new Error('HEIC decoder unavailable');
      let timer;
      const decoding = window.HeicTo({ blob, type: 'image/png' }).then(decodeNativeImage);
      try {
        return await Promise.race([
          decoding,
          new Promise((_, reject) => { timer = setTimeout(() => {
            // Release an eventual late ImageBitmap after a timeout.
            decoding.then(late => late?.close?.(), () => {});
            reject(new Error('HEIC conversion timed out'));
          }, 45000); })
        ]);
      } finally { clearTimeout(timer); }
    });
    heifQueue = task.catch(() => {});
    return task;
  }
  async function load(blob, filename) {
    const token = ++importRevision;
    if (blob.size > 25 * 1024 * 1024) { status('Essa imagem é muito grande. O limite é 25 MB.', 'error'); return; }
    status('Preparando sua foto…', 'loading');
    let bitmap, heif = false, converted = false;
    try {
      heif = await isHeif(blob, filename);
      if (token !== importRevision) return;
      if (!heif && !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type.toLowerCase())) {
        status('Escolha uma imagem JPG, PNG, WebP ou HEIC/HEIF.', 'error'); return;
      }
      // Prefer the browser decoder where available (e.g. compatible Safari).
      try { bitmap = await decodeNativeImage(blob); }
      catch (error) {
        if (!heif) throw error;
        if (token !== importRevision) return;
        status('Convertendo HEIC/HEIF no seu navegador…', 'loading');
        bitmap = await decodeHeif(blob, token);
        converted = true;
      }
      if (token !== importRevision || !bitmap) return;
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      for (const c of [canvas, original, blurred]) { c.width = width; c.height = height; }
      sourceContext.drawImage(bitmap, 0, 0, width, height);
      pixels = sourceContext.getImageData(0, 0, width, height).data;
      // Replicate borders around the blur so the edge pixels do not darken.
      const pad = Math.max(3, Math.round(width / 300));
      const padded = document.createElement('canvas'); padded.width = width + pad * 2; padded.height = height + pad * 2;
      const pc = padded.getContext('2d'); pc.drawImage(original, pad, pad);
      pc.drawImage(original, 0, 0, width, 1, pad, 0, width, pad);
      pc.drawImage(original, 0, height - 1, width, 1, pad, pad + height, width, pad);
      pc.drawImage(original, 0, 0, 1, height, 0, pad, pad, height);
      pc.drawImage(original, width - 1, 0, 1, height, pad + width, pad, pad, height);
      blurContext.filter = `blur(${Math.max(1.2, width / 450)}px)`;
      blurContext.drawImage(padded, -pad, -pad); blurContext.filter = 'none';
      softPixels = blurContext.getImageData(0, 0, width, height).data;
      // Reuse a small local preview for all filter cards; never send the original to a service.
      const thumbnail = document.createElement('canvas'); thumbnail.width = 220;
      thumbnail.height = Math.max(1, Math.round(height * 220 / width));
      thumbnail.getContext('2d').drawImage(original, 0, 0, thumbnail.width, thumbnail.height);
      $('pane-filters').style.setProperty('--filter-image', `url("${thumbnail.toDataURL('image/jpeg', .8)}")`);
      imageName = filename.replace(/\.[^.]+$/, '') || 'retrato';
      $('filename').textContent = filename;
      $('dimensions').textContent = `${width} × ${height} px${scale < 1 ? ' · otimizada para edição' : ''}`;
      $('empty').hidden = true; $('photo-frame').hidden = false;
      for (const id of ['tools', 'compare', 'export', 'reset']) $(id).disabled = false;
      reset(); render(); status(converted ? 'HEIC/HEIF convertido. Sua foto está pronta para editar.' : 'Sua foto está pronta. Experimente as ferramentas.');
    } catch {
      if (token === importRevision) status(heif
        ? 'Não foi possível abrir este HEIC/HEIF. O arquivo pode estar danificado ou usar uma variante não suportada.'
        : 'Não foi possível abrir a foto. Tente outro arquivo JPG, PNG, WebP ou HEIC/HEIF.', 'error');
    }
    finally { bitmap?.close?.(); }
  }
  async function loadDemo() {
    try {
      if (location.protocol === 'file:') {
        // fetch is restricted for file URLs; an HTML image can still be drawn locally.
        const image = new Image(); image.src = demoSource; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        c.getContext('2d').drawImage(image, 0, 0);
        const blob = await new Promise(resolve => c.toBlob(resolve)); await load(blob, 'retrato-demo.png');
      } else {
        const response = await fetch(demoSource);
        if (!response.ok) throw new Error('demo unavailable');
        await load(await response.blob(), 'retrato-demo.png');
      }
    } catch { status('A demonstração não está disponível. Escolha uma foto do seu dispositivo.', 'error'); }
  }
  $('import').onclick = $('replace').onclick = () => $('file').click();
  $('file').onchange = () => { const file = $('file').files[0]; if (file) load(file, file.name); $('file').value = ''; };
  $('demo').onclick = loadDemo;
  for (const id of controls) $(id).addEventListener('input', scheduleRender);
  document.querySelectorAll('.filter').forEach(button => button.onclick = () => setFilter(button.dataset.filter));
  $('reset').onclick = () => { reset(); status('Ajustes restaurados. Sua foto original está intacta.'); };
  $('compare').onchange = compare; $('split').oninput = compare;
  $('local').onchange = () => {
    $('region').hidden = !$('local').checked;
    $('region-options').hidden = !$('local').checked;
    placeRegion(); scheduleRender();
  };
  $('size').oninput = () => { updateRange($('size')); placeRegion(); scheduleRender(); };
  document.querySelectorAll('input[type=range]').forEach(updateRange);
  const handle = $('compare-handle'); let movingComparison = false;
  function moveComparison(clientX) {
    const rect = $('photo-frame').getBoundingClientRect();
    $('split').value = Math.round(Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)));
    compare();
  }
  handle.onpointerdown = event => {
    movingComparison = true; handle.setPointerCapture(event.pointerId); event.preventDefault();
  };
  handle.onpointermove = event => { if (movingComparison) moveComparison(event.clientX); };
  handle.onpointerup = handle.onpointercancel = () => { movingComparison = false; };
  handle.onkeydown = event => {
    const current = Number($('split').value);
    const next = { ArrowLeft: current - 2, ArrowDown: current - 2, ArrowRight: current + 2, ArrowUp: current + 2, Home: 0, End: 100 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); $('split').value = Math.max(0, Math.min(100, next)); compare();
  };
  const region = $('region'); let drag;
  region.onpointerdown = event => {
    drag = { x: event.clientX, y: event.clientY, center: { ...center } };
    region.setPointerCapture(event.pointerId); event.preventDefault();
  };
  region.onpointermove = event => {
    if (!drag) return;
    const rect = $('photo-frame').getBoundingClientRect();
    center.x = Math.max(0, Math.min(1, drag.center.x + (event.clientX - drag.x) / rect.width));
    center.y = Math.max(0, Math.min(1, drag.center.y + (event.clientY - drag.y) / rect.height));
    placeRegion(); scheduleRender();
  };
  region.onpointerup = region.onpointercancel = () => { drag = null; };
  region.onkeydown = event => {
    const delta = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] }[event.key];
    if (!delta) return;
    event.preventDefault(); center.x = Math.max(0, Math.min(1, center.x + delta[0])); center.y = Math.max(0, Math.min(1, center.y + delta[1]));
    placeRegion(); scheduleRender();
  };
  const dropzone = $('dropzone'); let dragDepth = 0;
  dropzone.ondragenter = event => { event.preventDefault(); dragDepth++; dropzone.classList.add('dragover'); };
  dropzone.ondragover = event => event.preventDefault();
  dropzone.ondragleave = event => { event.preventDefault(); if (--dragDepth <= 0) dropzone.classList.remove('dragover'); };
  dropzone.ondrop = event => {
    event.preventDefault(); dragDepth = 0; dropzone.classList.remove('dragover');
    const file = event.dataTransfer.files[0]; if (file) load(file, file.name);
  };
  // Prevent an accidental drop outside the editor from navigating away.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  $('export').onclick = () => {
    if (!pixels) return;
    if (frame) { cancelAnimationFrame(frame); render(); }
    // JPEG has no alpha; composite transparency onto white explicitly.
    const target = document.createElement('canvas'); target.width = canvas.width; target.height = canvas.height;
    const tc = target.getContext('2d'); tc.fillStyle = '#fff'; tc.fillRect(0, 0, target.width, target.height); tc.drawImage(canvas, 0, 0);
    target.toBlob(blob => {
      if (!blob) { status('Não foi possível exportar. Tente novamente.', 'error'); return; }
      if (exportURL) URL.revokeObjectURL(exportURL);
      exportURL = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = exportURL; anchor.download = `${imageName}-portrait.jpg`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      status('Foto exportada em JPEG. Pronta para o próximo capítulo.');
    }, 'image/jpeg', .95);
  };
  window.addEventListener('pagehide', () => { if (exportURL) URL.revokeObjectURL(exportURL); });
})();
