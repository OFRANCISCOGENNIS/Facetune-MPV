/* Local, optional person segmentation using MediaPipe Selfie Segmentation. */
'use strict';
(() => {
  const root=new URL('./',location.href);
  const urls=new Map();let loader,model,busy=false;
  function asset(name){
    const embedded=globalThis.PortraitEmbeddedAI?.[name];
    if(!embedded)return new URL('vendor/mediapipe/'+name,root).href;
    if(!urls.has(name)){
      const raw=atob(embedded.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      urls.set(name,URL.createObjectURL(new Blob([bytes],{type:embedded.type})));
    }
    return urls.get(name);
  }
  async function load(){
    if(!loader)loader=new Promise((resolve,reject)=>{
      if(globalThis.SelfieSegmentation){resolve();return;}
      const script=document.createElement('script');script.src=asset('selfie_segmentation.js');
      script.onload=resolve;script.onerror=()=>{script.remove();loader=null;reject(new Error('Não foi possível carregar a IA local. Reconecte e tente novamente.'));};document.head.append(script);
    });
    await loader;
    if(!model){model=new SelfieSegmentation({locateFile:asset});model.setOptions({modelSelection:0,selfieMode:false});}
    return model;
  }
  async function analyze(image){
    if(busy)throw new Error('A IA ainda está concluindo a análise anterior. Aguarde e tente novamente.');
    if(typeof WebAssembly==='undefined')throw new Error('Este navegador não oferece WebAssembly para a IA. As outras ferramentas continuam disponíveis.');
    busy=true;let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('A análise IA demorou demais. Tente novamente com um retrato menor.')),45000);});
    try{
      const engine=await Promise.race([load(),deadline]),scale=Math.min(1,512/Math.max(image.width,image.height));
      const input=document.createElement('canvas');input.width=Math.max(1,Math.round(image.width*scale));input.height=Math.max(1,Math.round(image.height*scale));input.getContext('2d').drawImage(image,0,0,input.width,input.height);
      let result;
      engine.onResults(value=>{
        const canvas=document.createElement('canvas');canvas.width=input.width;canvas.height=input.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(value.segmentationMask,0,0,canvas.width,canvas.height);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let selected=0;
        for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i]>127)selected++;
        result={width:canvas.width,height:canvas.height,data:pixels.data,coverage:selected/(canvas.width*canvas.height)};
      });
      await Promise.race([engine.send({image:input}),deadline]);
      if(!result || result.coverage<.015)throw new Error('Nenhuma pessoa foi identificada com segurança. Tente um retrato com boa iluminação.');
      return result;
    }catch(error){
      try{model?.close?.()?.catch?.(()=>{});}catch{}model=null;
      if(/pessoa|aguarde|carregar|WebAssembly|demorou/i.test(error.message))throw error;
      throw new Error('A IA não pôde analisar a foto neste navegador. É necessário suporte a WebGL e WebAssembly. Tente novamente ou use os ajustes manuais.');
    }finally{clearTimeout(timer);busy=false;}
  }
  globalThis.PortraitAI={analyze};
  addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();});
})();
