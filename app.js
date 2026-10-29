'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('edited'), original = $('original');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const sourceContext = original.getContext('2d', { willReadFrequently: true });
  const blurred = document.createElement('canvas');
  const blurContext = blurred.getContext('2d', { willReadFrequently: true });
  const defaults = { exposure:0, warmth:0, saturation:0, smooth:0, contrast:0, highlights:0,
    shadows:0, vibrance:0, sharpness:0, whiten:0, intensity:100, grain:0, vignette:0,
    tint:0,blacks:0,whites:0,clarity:0,dehaze:0,glow:0 };
  const controls = Object.keys(defaults);
  const master = document.createElement('canvas');
  const fullSource=document.createElement('canvas');
  let nativeSize={width:0,height:0},photoGeneration=0,aiRequest=0,aiBusy=false,aiError='',aiMask=null,aiViewMask=null,aiMode='none',exporting=false;
  const exportAssetURLs=new Map();
  let hasImage = false, rotation = 0, flipped = false;
  let history = [], historyIndex = -1;
  const reshape = globalThis.PortraitReshape;
  const filters = globalThis.PortraitFilters;
  let shapeField, masterPixels, shapeId=0, nextShapeId=1, shapeVersion=0;
  let shapeStates=new Map(), shapeStroke=null, shapeFrame=0;
  let brushCenter={x:.5,y:.5}, view=null, warpedVersion='', warpedCanvas=document.createElement('canvas');
  const demoSource = document.querySelector('#demo img').src;
  $('pane-filters').style.setProperty('--filter-image', `url("${demoSource}")`);
  let pixels, softPixels, imageName = 'retrato', filter = 'natural', frame = 0, importRevision = 0;
  let center = { x: .5, y: .4 }, exportURL;
  let filterCategory = 'all';
  buildFilterGallery();
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
    if(shapeStroke)finishShapeStroke();
    document.querySelectorAll('.tool-tab').forEach(tab => {
      const selected = tab.dataset.tab === name;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(`pane-${tab.dataset.tab}`).hidden = !selected;
      if (selected && focus) tab.focus();
    });
    syncShapeUI();
  }
  document.querySelectorAll('.tool-tab').forEach(tab => {
    tab.onclick = () => setTab(tab.dataset.tab);
    tab.onkeydown = event => {
      const names = [...document.querySelectorAll('.tool-tab')].map(tab => tab.dataset.tab);
      const index = names.indexOf(tab.dataset.tab);
      const next = { ArrowRight: (index + 1) % names.length, ArrowLeft: (index + names.length - 1) % names.length, Home: 0, End: names.length - 1 }[event.key];
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
    return { x: center.x, y: center.y, width, height: Math.min(.95, width * canvas.width / canvas.height * Number($('aspect').value) / 10) };
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
    syncShapeUI();
  }
  function buildFilterGallery() {
    for(const preset of filters.presets){
      const button=document.createElement('button');button.type='button';button.className='filter';
      button.dataset.filter=preset.id;button.dataset.category=preset.category;
      button.setAttribute('aria-pressed',String(preset.id==='natural'));
      button.classList.toggle('selected',preset.id==='natural');
      button.innerHTML='<span class="filter-art" aria-hidden="true"><span class="filter-check"><svg class="icon"><use href="#i-check"/></svg></span></span><span class="filter-name"></span>';
      const name=button.querySelector('.filter-name');name.textContent=preset.name;
      const description=document.createElement('small');description.textContent=preset.description;name.append(description);
      $('filter-gallery').append(button);
    }
    for(const category of filters.categories){
      const button=document.createElement('button');button.type='button';button.className='filter-category';
      button.dataset.category=category.id;button.textContent=category.name;
      button.onclick=()=>setFilterCategory(category.id);$('filter-categories').append(button);
    }
    setFilterCategory('all');
  }
  function setFilterCategory(name) {
    filterCategory=name;
    document.querySelectorAll('.filter-category').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===filterCategory)));
    let count=0;
    document.querySelectorAll('.filter').forEach(button=>{
      button.hidden=filterCategory!=='all' && button.dataset.category!==filterCategory;
      if(!button.hidden)count++;
    });
    $('filter-count').textContent=`${count} filtros disponíveis`;
  }
  function updateFilterPreviews(image) {
    // One source crop, the same recipes as export, always at 100% before other adjustments.
    const thumbnail=document.createElement('canvas');thumbnail.width=128;thumbnail.height=96;
    const tc=thumbnail.getContext('2d',{willReadFrequently:true});
    const scale=Math.max(128/image.width,96/image.height),width=128/scale,height=96/scale;
    tc.drawImage(image,(image.width-width)/2,(image.height-height)*.28,width,height,0,0,128,96);
    const input=tc.getImageData(0,0,128,96),output=tc.createImageData(128,96),rgb=[0,0,0];
    $('pane-filters').style.setProperty('--filter-image',`url("${thumbnail.toDataURL('image/jpeg',.8)}")`);
    for(const preset of filters.presets){
      for(let i=0;i<input.data.length;i+=4){
        const r=input.data[i],g=input.data[i+1],b=input.data[i+2];
        preset.apply(r,g,b,(.2126*r+.7152*g+.0722*b)/255,rgb);
        output.data[i]=rgb[0];output.data[i+1]=rgb[1];output.data[i+2]=rgb[2];output.data[i+3]=input.data[i+3];
      }
      tc.putImageData(output,0,0);
      document.querySelector(`[data-filter="${preset.id}"] .filter-art`).style.backgroundImage=`url("${thumbnail.toDataURL('image/png')}")`;
    }
  }
  function aiSettings(){return {mode:aiMode,strength:Number($('ai-strength').value)/100,color:$('ai-color').value};}
  function geometrySettings(){return {...view,rotation,flipped,masterWidth:master.width,masterHeight:master.height};}
  function syncAIUI(){
    $('analyze-ai').disabled=!hasImage||aiBusy;$('analyze-ai').setAttribute('aria-busy',String(aiBusy));
    $('analyze-ai').textContent=aiBusy?'Analisando no dispositivo…':aiMask?'Analisar novamente':'Analisar retrato com IA';
    $('ai-mode').disabled=!aiMask;$('ai-strength').disabled=!aiMask||aiMode==='none';$('ai-color').disabled=!aiMask||aiMode!=='color';$('ai-mask-preview').disabled=!aiMask;
    $('ai-strength-value').value=$('ai-strength').value;updateRange($('ai-strength'));
    $('ai-status').dataset.state=aiError?'error':'ready';
    $('ai-status').textContent=aiBusy?'Carregando o modelo e identificando pessoa/fundo. Nenhuma foto é enviada.':aiError|| (aiMask?'Seleção IA pronta. Escolha um efeito ou confira a seleção.':'Pronto para analisar. Sua foto permanece neste navegador.');
  }
  async function analyzePortrait(){
    if(!hasImage||aiBusy)return;
    const generation=photoGeneration,request=++aiRequest,snapshot=document.createElement('canvas'),scale=Math.min(1,512/Math.max(master.width,master.height));
    snapshot.width=Math.max(1,Math.round(master.width*scale));snapshot.height=Math.max(1,Math.round(master.height*scale));snapshot.getContext('2d').drawImage(master,0,0,snapshot.width,snapshot.height);
    aiBusy=true;aiError='';syncAIUI();status('Analisando retrato com IA no seu navegador…');
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const result=await PortraitAI.analyze(snapshot);
      if(generation!==photoGeneration||request!==aiRequest)return;
      recordHistory();aiMask=result;aiMode=aiMode==='none'?'blur':aiMode;$('ai-mode').value=aiMode;
      rebuildGeometry();recordHistory();status('Retrato analisado com IA. Experimente os efeitos de pessoa e fundo.');
    }catch(error){if(generation===photoGeneration&&request===aiRequest){aiError=error.message;status(aiError,'error');}}
    finally{aiBusy=false;syncAIUI();}
  }
  function updateHistogram(data){
    const histogram=PortraitEngine.histogram(data),canvas=$('histogram'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const peak=Math.max(1,...histogram.red,...histogram.green,...histogram.blue);
    for(const [bins,color] of [[histogram.red,'#c47b73'],[histogram.green,'#5a8464'],[histogram.blue,'#6a8eb5']]){
      ctx.beginPath();ctx.moveTo(0,canvas.height);
      for(let x=0;x<256;x++)ctx.lineTo(x*canvas.width/255,canvas.height-Math.sqrt(bins[x]/peak)*(canvas.height-4));
      ctx.lineTo(canvas.width,canvas.height);ctx.closePath();ctx.fillStyle=color+'55';ctx.fill();ctx.strokeStyle=color;ctx.stroke();
    }
    $('histogram-summary').textContent=`Luz mediana ${histogram.median}/255 · extremos recortados ${(histogram.clipped*100).toFixed(1)}%`;
  }
  function outputDimensions(){
    if(!view)return {width:0,height:0,upscaled:false};
    const selected=$('export-resolution').value,ratio=Number($('crop-ratio').value);
    const rw=rotation%2?fullSource.height:fullSource.width,rh=rotation%2?fullSource.width:fullSource.height;
    let sourceWidth=rw,sourceHeight=rh;
    if(ratio>0){if(rw/rh>ratio)sourceWidth=Math.max(1,Math.round(rh*ratio));else sourceHeight=Math.max(1,Math.round(rw/ratio));}
    let width=sourceWidth,height=sourceHeight;
    if(selected==='preview'){width=view.width;height=view.height;}
    if(selected==='4k'){const aspect=ratio>0?ratio:rw/rh;if(aspect>=1){width=3840;height=Math.max(1,Math.round(3840/aspect));}else{height=3840;width=Math.max(1,Math.round(3840*aspect));}}
    return {width,height,upscaled:width>sourceWidth+1||height>sourceHeight+1};
  }
  function updateExportInfo(){
    $('export').disabled=!hasImage||exporting;$('export-4k').disabled=!hasImage||exporting;
    const size=outputDimensions(),png=$('export-format').value==='image/png';
    $('export-quality-control').hidden=png;$('export-quality-value').value=$('export-quality').value;updateRange($('export-quality'));
    $('export-dimensions').textContent=hasImage?`${size.width} × ${size.height} px`:'—';
    $('export-note').textContent=size.upscaled?'Ampliação por interpolação. Não reconstrói detalhes com IA.':aiMode==='remove'&&!png?'Escolha PNG para manter o fundo transparente.':'O enquadramento e os efeitos serão preservados.';
    if(hasImage)$('source-info').textContent=`Entrada: ${nativeSize.width} × ${nativeSize.height} px. Fonte de exportação: ${fullSource.width} × ${fullSource.height} px. A prévia leve não reduz a fonte guardada para exportar.`;
  }
  function exportAsset(name){
    const embedded=globalThis.PortraitEmbeddedExport?.[name];
    if(!embedded)return new URL(name,location.href).href;
    if(!exportAssetURLs.has(name))exportAssetURLs.set(name,URL.createObjectURL(new Blob([embedded],{type:'text/javascript'})));
    return exportAssetURLs.get(name);
  }
  async function exportPhoto(){
    if(!pixels||exporting)return;
    if(shapeStroke)finishShapeStroke();if(frame){cancelAnimationFrame(frame);render();}
    const generation=photoGeneration,name=imageName,mime=$('export-format').value,extension=mime==='image/png'?'png':'jpg',size=outputDimensions();
    const options={...size,geometry:geometrySettings(),field:shapeField?.effect?reshape.clone(shapeField):null,
      values:Object.fromEntries(controls.map(id=>[id,Number($(id).value)/100])),local:$('local').checked,box:regionGeometry(),filter,mask:aiMask,ai:aiSettings(),mime,quality:Number($('export-quality').value)/100};
    exporting=true;updateExportInfo();status(`Preparando ${size.width} × ${size.height} px…`);
    let worker,timer,source;
    try{
      await new Promise(resolve=>requestAnimationFrame(resolve));
      let blob;
      if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'){
        source=await createImageBitmap(fullSource);worker=new Worker(exportAsset('export-worker.js'));
        blob=await new Promise((resolve,reject)=>{
          timer=setTimeout(()=>reject(new Error('A exportação demorou demais. Tente a prévia leve ou um enquadramento menor.')),90000);
          worker.onmessage=event=>event.data.error?reject(new Error(event.data.error)):resolve(event.data.blob);
          worker.onerror=()=>reject(new Error('Não foi possível iniciar a exportação neste navegador. Tente a prévia leve.'));
          worker.postMessage({source,options,assets:{filters:exportAsset('filters.js'),reshape:exportAsset('reshape.js'),engine:exportAsset('engine.js')}},[source]);source=null;
        });
      }else{blob=await PortraitEngine.exportPhoto(fullSource,options);}
      if(generation!==photoGeneration)return;
      if(exportURL)URL.revokeObjectURL(exportURL);exportURL=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=exportURL;anchor.download=`${name}-portrait.${extension}`;document.body.append(anchor);anchor.click();anchor.remove();
      status(`Foto exportada em ${mime==='image/png'?'PNG':'JPEG'} · ${size.width} × ${size.height} px.`);
    }catch(error){if(generation===photoGeneration)status(error.message||'Não foi possível exportar. Tente uma resolução menor.','error');}
    finally{clearTimeout(timer);source?.close?.();worker?.terminate();exporting=false;updateExportInfo();}
  }
  function render() {
    frame = 0;
    if (!pixels) return;
    const v = Object.fromEntries(controls.map(id => [id, Number($(id).value) / 100]));
    const local = $('local').checked;
    const box = regionGeometry(), w = canvas.width, h = canvas.height;
    const output = context.createImageData(w, h), data = output.data;
    data.set(PortraitEngine.color(pixels,softPixels,w,h,v,{local,box,filter}));
    if(aiViewMask){
      data.set(PortraitEngine.composite(data,w,h,aiViewMask,aiSettings()));
    }
    updateHistogram(data);
    if(aiViewMask&&$('ai-mask-preview').checked)for(let i=0;i<data.length;i+=4){const amount=aiViewMask[i]/255*.5;data[i]=data[i]*(1-amount)+35*amount;data[i+1]=data[i+1]*(1-amount)+190*amount;data[i+2]=data[i+2]*(1-amount)+210*amount;}
    context.putImageData(output,0,0);
    updateExportInfo();
    updateHistoryButtons();
  }
  function settingsSnapshot() {
    return JSON.stringify({shape:shapeId,ai:aiSettings(),values:Object.fromEntries(controls.map(id=>[id,$(id).value])),filter,rotation,flipped,
      crop:$('crop-ratio').value,cropX:$('crop-x').value,cropY:$('crop-y').value,
      local:$('local').checked,size:$('size').value,aspect:$('aspect').value,center:{...center}});
  }
  function updateHistoryButtons() {
    const pending = hasImage && settingsSnapshot()!==history[historyIndex];
    $('undo').disabled = !hasImage || (historyIndex<=0 && !pending);
    $('redo').disabled = !hasImage || Boolean(shapeStroke) || pending || historyIndex>=history.length-1;
    $('clear-reshape').disabled=!hasImage || !shapeField?.effect || Boolean(shapeStroke);
  }
  function recordHistory() {
    if (!hasImage) return;
    const snapshot=settingsSnapshot();
    if (snapshot!==history[historyIndex]) {
      history=history.slice(0,historyIndex+1);history.push(snapshot);
      if(history.length>30)history.shift();historyIndex=history.length-1;
    }
    const keep=new Set([0,shapeId,...history.map(snapshot=>JSON.parse(snapshot).shape||0)]);
    for(const key of shapeStates.keys())if(!keep.has(key))shapeStates.delete(key);
    updateHistoryButtons();
  }
  function restoreSnapshot(index) {
    const state=JSON.parse(history[index]);historyIndex=index;
    restoreShape(state.shape||0);
    for(const id of controls)$(id).value=state.values[id];
    rotation=state.rotation;flipped=state.flipped;filter=state.filter;center={...state.center};
    aiMode=state.ai?.mode||'none';$('ai-mode').value=aiMode;$('ai-strength').value=Math.round((state.ai?.strength??.7)*100);$('ai-color').value=state.ai?.color||'#c9d7c4';
    $('crop-ratio').value=state.crop;$('crop-x').value=state.cropX;$('crop-y').value=state.cropY;
    $('local').checked=state.local;$('size').value=state.size;$('aspect').value=state.aspect;
    syncLocalControls();setFilter(filter);rebuildGeometry();updateHistoryButtons();
  }
  function syncLocalControls() {
    $('region').hidden=!$('local').checked;$('region-options').hidden=!$('local').checked;
    $('whiten').disabled=!$('local').checked;
  }
  function shapedMaster(scale) {
    if(!shapeField?.effect)return master;
    const key=shapeVersion+':'+scale;
    if(key!==warpedVersion){
      const image=reshape.warp(masterPixels,master.width,master.height,shapeField,scale);
      warpedCanvas.width=image.width;warpedCanvas.height=image.height;
      warpedCanvas.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
      warpedVersion=key;
    }
    return warpedCanvas;
  }
  function rebuildGeometry() {
    if(!hasImage)return;
    const rw=rotation%2?master.height:master.width,rh=rotation%2?master.width:master.height;
    const ratio=Number($('crop-ratio').value);
    let width=rw,height=rh;
    if(ratio>0){if(width/height>ratio)width=Math.max(1,Math.round(height*ratio));else height=Math.max(1,Math.round(width/ratio));}
    const left=Math.round((rw-width)*Number($('crop-x').value)/100);
    const top=Math.round((rh-height)*Number($('crop-y').value)/100);
    view={width,height,left,top,rw,rh};
    // A lighter drag preview; a committed stroke and every export use the full working resolution.
    const scale=shapeStroke?Math.min(1,900/Math.max(master.width,master.height)):1;
    const outWidth=Math.max(1,Math.round(width*scale)),outHeight=Math.max(1,Math.round(height*scale));
    const rotated=document.createElement('canvas');
    rotated.width=Math.max(1,Math.round(rw*scale));rotated.height=Math.max(1,Math.round(rh*scale));
    const rc=rotated.getContext('2d');
    function drawView(image,target){
      rc.setTransform(1,0,0,1,0,0);rc.clearRect(0,0,rotated.width,rotated.height);
      rc.translate(rotated.width/2,rotated.height/2);
      rc.scale(rotated.width/rw*(flipped?-1:1),rotated.height/rh);rc.rotate(rotation*Math.PI/2);
      rc.drawImage(image,-master.width/2,-master.height/2,master.width,master.height);
      target.drawImage(rotated,left*rotated.width/rw,top*rotated.height/rh,width*rotated.width/rw,height*rotated.height/rh,0,0,outWidth,outHeight);
    }
    for(const c of [canvas,original,blurred]){c.width=outWidth;c.height=outHeight;}
    drawView(master,sourceContext);
    const working=document.createElement('canvas');working.width=outWidth;working.height=outHeight;
    const wc=working.getContext('2d',{willReadFrequently:true});
    if(shapeField?.effect)drawView(shapedMaster(scale),wc);else wc.drawImage(original,0,0);
    pixels=wc.getImageData(0,0,outWidth,outHeight).data;
    aiViewMask=aiMask?PortraitEngine.geometry(PortraitEngine.fromPixels(aiMask.data,aiMask.width,aiMask.height),geometrySettings(),outWidth,outHeight,shapeField).getContext('2d').getImageData(0,0,outWidth,outHeight).data:null;
    const pad=Math.max(3,Math.round(outWidth/300));
    const padded=document.createElement('canvas');padded.width=outWidth+pad*2;padded.height=outHeight+pad*2;
    const pc=padded.getContext('2d');pc.drawImage(working,pad,pad);
    pc.drawImage(working,0,0,outWidth,1,pad,0,outWidth,pad);
    pc.drawImage(working,0,outHeight-1,outWidth,1,pad,pad+outHeight,outWidth,pad);
    pc.drawImage(working,0,0,1,outHeight,0,pad,pad,outHeight);
    pc.drawImage(working,outWidth-1,0,1,outHeight,pad+outWidth,pad,pad,outHeight);
    blurContext.filter=`blur(${Math.max(1.2,outWidth/450)}px)`;blurContext.drawImage(padded,-pad,-pad);blurContext.filter='none';
    softPixels=blurContext.getImageData(0,0,outWidth,outHeight).data;
    // Filter thumbnails refresh at stroke boundaries, rather than on every pointer event.
    if(!shapeStroke){
      updateFilterPreviews(working);
    }
    $('dimensions').textContent=`${width} × ${height} px`;
    $('crop-position').hidden=!ratio;$('rotation-value').textContent=`${rotation*90}°`;
    for(const id of ['crop-x','crop-y','size','aspect'])updateRange($(id));
    placeRegion();compare();syncAIUI();updateExportInfo();scheduleRender();
  }
  function restoreShape(id) {
    if(!shapeStates.has(id))throw new Error('Missing reshape history state');
    shapeField=reshape.clone(shapeStates.get(id));shapeId=id;shapeVersion++;
  }
  function syncShapeUI() {
    const selected=!$('pane-reshape').hidden;
    const enabled=hasImage && selected && $('reshape-enabled').checked && (!$('compare').checked || Number($('split').value)<100);
    $('reshape-layer').hidden=!enabled;$('reshape-layer').tabIndex=enabled?0:-1;
    $('reshape-layer').style.clipPath=$('compare').checked?`inset(0 0 0 ${$('split').value}%)`:'none';
    $('region').hidden=!$('local').checked || selected;
    $('open-reshape').disabled=!hasImage;$('open-reshape').hidden=selected;
    $('reshape-layer').dataset.mode=$('reshape-mode').value;
    $('reshape-axis-control').hidden=!$('reshape-symmetry').checked;
    $('reshape-axis').hidden=!enabled||!$('reshape-symmetry').checked;
    $('reshape-axis').style.left=$('reshape-axis-x').value+'%';
    for(const id of ['reshape-size','reshape-strength','reshape-axis-x']){
      $(id+'-value').value=$(id).value;updateRange($(id));
    }
    positionBrush();
  }
  function brushRadius(){return Math.max(6,Number($('reshape-size').value)/100*Math.min(view?.width||1,view?.height||1)/2);}
  function positionBrush(){
    if(!view)return;
    const rect=$('photo-frame').getBoundingClientRect();
    const cursor=$('reshape-cursor');
    cursor.style.left=brushCenter.x*100+'%';cursor.style.top=brushCenter.y*100+'%';
    cursor.style.width=brushRadius()*2/view.width*rect.width+'px';
    cursor.style.height=brushRadius()*2/view.height*rect.height+'px';
    const mirror=$('reshape-mirror-cursor'),mx=2*Number($('reshape-axis-x').value)/100-brushCenter.x;
    mirror.style.left=mx*100+'%';mirror.style.top=cursor.style.top;mirror.style.width=cursor.style.width;mirror.style.height=cursor.style.height;
    mirror.hidden=!$('reshape-symmetry').checked||cursor.hidden||mx<0||mx>1;
  }
  function toMaster(point){
    const x=(point.x*(view.width-1)+view.left-(view.rw-1)/2)*(flipped?-1:1);
    const y=point.y*(view.height-1)+view.top-(view.rh-1)/2;
    const delta=[[x,y],[y,-x],[-x,-y],[-y,x]][rotation];
    return {x:delta[0]+(master.width-1)/2,y:delta[1]+(master.height-1)/2};
  }
  function pointerPoint(event){
    const rect=$('photo-frame').getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  }
  function beginShapeStroke(pointerId){
    recordHistory();
    shapeStroke={pointerId,before:reshape.clone(shapeField),beforeId:shapeId,changed:false,last:{...brushCenter}};
    $('reshape-layer').classList.add('is-drawing');
  }
  function stampShape(point,dx,dy){
    if(!shapeStroke)return;
    const sign=flipped?-1:1,horizontal=[[sign,0],[0,-sign],[-sign,0],[0,sign]][rotation],vertical=[[0,1],[1,0],[0,-1],[-1,0]][rotation];
    const build=(p,vx,vy)=>{const origin=toMaster(p),to=toMaster({x:p.x+vx,y:p.y+vy});return {...origin,dx:to.x-origin.x,dy:to.y-origin.y,radius:brushRadius(),mode:$('reshape-mode').value,strength:Number($('reshape-strength').value)/100,horizontal,vertical};};
    const brushes=[build(point,dx,dy)];
    if($('reshape-symmetry').checked){const mx=2*Number($('reshape-axis-x').value)/100-point.x;if(mx>=0&&mx<=1)brushes.push(build({x:mx,y:point.y},-dx,dy));}
    const changed=reshape.stamp(shapeField,brushes);
    if(!changed)return;
    if(!shapeStroke.changed){shapeId=nextShapeId++;shapeStroke.changed=true;}
    shapeVersion++;
    if(!shapeFrame)shapeFrame=requestAnimationFrame(()=>{shapeFrame=0;rebuildGeometry();});
  }
  function moveShapeStroke(point){
    const from=toMaster(shapeStroke.last),to=toMaster(point);
    const dx=to.x-from.x,dy=to.y-from.y;
    const distance=Math.hypot(dx,dy);
    const steps=Math.min(256,Math.max(1,Math.ceil(distance/(brushRadius()*.2))));
    if(distance)for(let step=1;step<=steps;step++){
      const t=(step-.5)/steps;
      stampShape({x:shapeStroke.last.x+(point.x-shapeStroke.last.x)*t,y:shapeStroke.last.y+(point.y-shapeStroke.last.y)*t},(point.x-shapeStroke.last.x)/steps,(point.y-shapeStroke.last.y)/steps);
    }
    shapeStroke.last={...point};
  }
  function finishShapeStroke(cancel=false){
    if(!shapeStroke)return;
    const stroke=shapeStroke;shapeStroke=null;
    if(shapeFrame){cancelAnimationFrame(shapeFrame);shapeFrame=0;}
    if(cancel){shapeField=stroke.before;shapeId=stroke.beforeId;shapeVersion++;}
    else if(stroke.changed)shapeStates.set(shapeId,reshape.clone(shapeField));
    $('reshape-layer').classList.remove('is-drawing');
    if(stroke.pointerId!==null && $('reshape-layer').hasPointerCapture(stroke.pointerId))$('reshape-layer').releasePointerCapture(stroke.pointerId);
    if(stroke.changed){rebuildGeometry();if(!cancel)recordHistory();status(cancel?'Traço de remodelação cancelado.':'Remodelação aplicada. Você pode desfazer ou continuar.');}
    updateHistoryButtons();
  }
  function scheduleRender() {
    for (const id of controls) {
      const value = Number($(id).value);
      $(`${id}-value`).value = value > 0 ? `+${value}` : String(value);
      updateRange($(id));
    }
    if (!frame) frame = requestAnimationFrame(render);
    updateHistoryButtons();
  }
  function setFilter(name) {
    const preset=filters.get(name);filter=preset.id;
    $('active-filter-name').textContent=preset.name;
    document.querySelectorAll('.filter').forEach((button) => {
      const selected = button.dataset.filter === filter;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    scheduleRender();
  }
  function reset() {
    if(shapeStroke)finishShapeStroke(true);
    if(hasImage)restoreShape(0);
    aiRequest++;aiError='';aiMode='none';$('ai-mode').value='none';$('ai-strength').value='70';$('ai-color').value='#c9d7c4';$('ai-mask-preview').checked=false;
    for (const id of controls) $(id).value = String(defaults[id]);
    $('local').checked = false; $('region').hidden = true; $('region-options').hidden = true;
    center = { x: .5, y: .4 }; $('size').value='40';$('aspect').value='13';
    rotation=0;flipped=false;$('crop-ratio').value='0';$('crop-x').value=$('crop-y').value='50';
    syncLocalControls();
    $('compare').checked = false; $('split').value = '50';
    setFilter('natural'); rebuildGeometry(); placeRegion(); compare();
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
    if(shapeStroke)finishShapeStroke(true);
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
      nativeSize={width:bitmap.width,height:bitmap.height};
      const sourceScale=Math.min(1,3840/Math.max(bitmap.width,bitmap.height));
      fullSource.width=Math.max(1,Math.round(bitmap.width*sourceScale));fullSource.height=Math.max(1,Math.round(bitmap.height*sourceScale));
      fullSource.getContext('2d').drawImage(bitmap,0,0,fullSource.width,fullSource.height);
      photoGeneration++;aiMask=null;aiViewMask=null;
      master.width=width;master.height=height;
      master.getContext('2d').drawImage(bitmap,0,0,width,height);hasImage=true;
      masterPixels=master.getContext('2d').getImageData(0,0,width,height).data;
      shapeField=reshape.create(width,height);shapeId=0;nextShapeId=1;shapeVersion++;
      shapeStates=new Map([[0,reshape.clone(shapeField)]]);
      history=[];historyIndex=-1;
      imageName = filename.replace(/\.[^.]+$/, '') || 'retrato';
      $('filename').textContent = filename;
      $('dimensions').textContent = `${width} × ${height} px${scale < 1 ? ' · otimizada para edição' : ''}`;
      $('empty').hidden = true; $('photo-frame').hidden = false;
      for (const id of ['tools', 'compare', 'export', 'reset']) $(id).disabled = false;
      reset(); render(); recordHistory(); status(converted ? 'HEIC/HEIF convertido. Sua foto está pronta para editar.' : 'Sua foto está pronta. Experimente as ferramentas.');
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
  for (const id of controls) {
    $(id).addEventListener('input',scheduleRender);
    $(id).addEventListener('change',recordHistory);
  }
  document.querySelectorAll('.filter').forEach(button => button.onclick = () => { setFilter(button.dataset.filter);recordHistory(); });
  $('reset').onclick = () => { reset(); recordHistory(); status('Ajustes restaurados. Sua foto original está intacta.'); };
  $('compare').onchange = compare; $('split').oninput = compare;
  $('local').onchange = () => {
    syncLocalControls();placeRegion();scheduleRender();recordHistory();
  };
  for(const id of ['size','aspect']) {
    $(id).oninput=()=>{updateRange($(id));placeRegion();scheduleRender();};$(id).onchange=recordHistory;
  }
  $('crop-ratio').onchange=()=>{rebuildGeometry();recordHistory();};
  for(const id of ['crop-x','crop-y']) {$(id).oninput=rebuildGeometry;$(id).onchange=recordHistory;}
  $('rotate-left').onclick=()=>{rotation=(rotation+3)%4;rebuildGeometry();recordHistory();};
  $('rotate-right').onclick=()=>{rotation=(rotation+1)%4;rebuildGeometry();recordHistory();};
  $('flip-horizontal').onclick=()=>{flipped=!flipped;rebuildGeometry();recordHistory();};
  $('clear-crop').onclick=()=>{$('crop-ratio').value='0';$('crop-x').value=$('crop-y').value='50';rebuildGeometry();recordHistory();};
  $('undo').onclick=()=>{if(shapeStroke){finishShapeStroke(true);return;}recordHistory();if(historyIndex>0)restoreSnapshot(historyIndex-1);};
  $('redo').onclick=()=>{if(historyIndex<history.length-1)restoreSnapshot(historyIndex+1);};
  document.querySelectorAll('input[type=range]').forEach(updateRange);
  for(const id of ['reshape-size','reshape-strength','reshape-axis-x'])$(id).oninput=syncShapeUI;
  $('reshape-symmetry').onchange=()=>{if(shapeStroke)finishShapeStroke();syncShapeUI();};
  $('open-reshape').onclick=()=>{setTab('reshape',true);$('pane-reshape').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
  const reshapeProfiles={face:{size:55,strength:25,mode:'slim',hint:'Rosto: posicione o pincel sobre o contorno e clique suavemente para afinar a área.'},nose:{size:14,strength:25,mode:'slim',hint:'Nariz: posicione o pincel sobre o nariz e clique suavemente para reduzir a largura.'},eyes:{size:12,strength:20,mode:'expand',hint:'Olhos: posicione o pincel sobre um olho e clique para expandir. A simetria é opcional.'},lips:{size:16,strength:20,mode:'expand',hint:'Lábios: posicione o pincel sobre a boca e clique suavemente para dar volume.'},body:{size:60,strength:25,mode:'push',hint:'Corpo: arraste o contorno suavemente. Use Restaurar para corrigir apenas uma área.'}};
  document.querySelectorAll('[data-reshape-profile]').forEach(button=>button.onclick=()=>{
    if(shapeStroke)finishShapeStroke();const profile=reshapeProfiles[button.dataset.reshapeProfile];
    $('reshape-size').value=profile.size;$('reshape-strength').value=profile.strength;$('reshape-mode').value=profile.mode;$('reshape-enabled').checked=true;
    $('reshape-profile-tip').textContent=profile.hint+' A seleção é manual.';
    document.querySelectorAll('[data-reshape-profile]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));syncShapeUI();
  });
  $('reshape-enabled').onchange=()=>{if(shapeStroke)finishShapeStroke();syncShapeUI();};
  $('reshape-mode').onchange=()=>{if(shapeStroke)finishShapeStroke();syncShapeUI();};
  $('clear-reshape').onclick=()=>{if(shapeStroke)finishShapeStroke(true);restoreShape(0);rebuildGeometry();recordHistory();status('Remodelação removida. Os demais ajustes foram mantidos.');};
  const layer=$('reshape-layer');
  layer.onpointerdown=event=>{
    if(!hasImage || shapeStroke || (event.pointerType==='mouse' && event.button!==0))return;
    event.preventDefault();layer.focus({preventScroll:true});brushCenter=pointerPoint(event);$('reshape-cursor').hidden=false;positionBrush();
    beginShapeStroke(event.pointerId);layer.setPointerCapture(event.pointerId);
    if($('reshape-mode').value!=='push')stampShape(brushCenter,0,0);
  };
  layer.onpointermove=event=>{
    if(shapeStroke && shapeStroke.pointerId!==event.pointerId)return;
    brushCenter=pointerPoint(event);$('reshape-cursor').hidden=false;positionBrush();
    if(shapeStroke)moveShapeStroke(brushCenter);
  };
  layer.onpointerup=event=>{if(shapeStroke?.pointerId===event.pointerId){moveShapeStroke(pointerPoint(event));finishShapeStroke();}};
  layer.onpointercancel=event=>{if(shapeStroke?.pointerId===event.pointerId)finishShapeStroke(true);};
  layer.onlostpointercapture=()=>{if(shapeStroke)finishShapeStroke(true);};
  layer.onpointerleave=()=>{if(!shapeStroke){$('reshape-cursor').hidden=true;$('reshape-mirror-cursor').hidden=true;}};
  layer.onfocus=()=>{$('reshape-cursor').hidden=false;positionBrush();};
  layer.onblur=()=>{if(!shapeStroke){$('reshape-cursor').hidden=true;$('reshape-mirror-cursor').hidden=true;}};
  layer.onkeydown=event=>{
    if(event.key==='Escape'){if(shapeStroke)finishShapeStroke(true);event.preventDefault();return;}
    if(shapeStroke)return;
    const delta={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[event.key];
    if(delta){
      event.preventDefault();
      if(event.shiftKey && $('reshape-mode').value==='push'){
        const next={x:Math.max(0,Math.min(1,brushCenter.x+delta[0])),y:Math.max(0,Math.min(1,brushCenter.y+delta[1]))};
        beginShapeStroke(null);moveShapeStroke(next);brushCenter=next;finishShapeStroke();
      }else{brushCenter.x=Math.max(0,Math.min(1,brushCenter.x+delta[0]));brushCenter.y=Math.max(0,Math.min(1,brushCenter.y+delta[1]));}
      $('reshape-cursor').hidden=false;positionBrush();
    }else if(event.key==='Enter' && $('reshape-mode').value!=='push'){
      event.preventDefault();beginShapeStroke(null);stampShape(brushCenter,0,0);finishShapeStroke();
    }
  };
  window.addEventListener('resize',positionBrush);
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
  region.onpointerup = region.onpointercancel = () => { drag = null;recordHistory(); };
  region.onkeydown = event => {
    const delta = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] }[event.key];
    if (!delta) return;
    event.preventDefault(); center.x = Math.max(0, Math.min(1, center.x + delta[0])); center.y = Math.max(0, Math.min(1, center.y + delta[1]));
    placeRegion(); scheduleRender();recordHistory();
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
  $('analyze-ai').onclick=analyzePortrait;
  $('ai-mode').onchange=()=>{aiMode=$('ai-mode').value;if(aiMode==='remove'){$('ai-strength').value='100';$('export-format').value='image/png';}syncAIUI();scheduleRender();recordHistory();};
  $('ai-strength').oninput=()=>{syncAIUI();scheduleRender();};$('ai-strength').onchange=recordHistory;
  $('ai-color').oninput=scheduleRender;$('ai-color').onchange=recordHistory;$('ai-mask-preview').onchange=scheduleRender;
  for(const id of ['export-resolution','export-format','export-quality']){$(id).oninput=updateExportInfo;$(id).onchange=updateExportInfo;}
  $('export').onclick=exportPhoto;$('export-4k').onclick=()=>{$('export-resolution').value='4k';exportPhoto();};
  $('auto-tone').onclick=()=>{
    if(!pixels)return;recordHistory();const h=PortraitEngine.histogram(pixels),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const values={exposure:h.median?Math.round(clamp(Math.log2(120/h.median)*100,-40,50)):0,contrast:h.high>h.low?Math.round(clamp((155/(h.high-h.low)-1)*100,-20,25)):0,
      shadows:h.low<55?Math.round((55-h.low)*.45):0,highlights:h.high>215?-Math.round((h.high-215)*.6):0,vibrance:15};
    for(const [id,value] of Object.entries(values))$(id).value=value;scheduleRender();recordHistory();status('Luz e cor equilibradas por análise tonal. Você pode ajustar ou desfazer.');
  };
  syncAIUI();updateExportInfo();
  window.addEventListener('pagehide', () => { if(exportURL)URL.revokeObjectURL(exportURL);for(const url of exportAssetURLs.values())URL.revokeObjectURL(url);exportAssetURLs.clear(); });
})();
