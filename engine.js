/* Original SDR processing shared by preview and full-resolution export. */
'use strict';
(() => {
  function color(pixels,softPixels,w,h,v,{local=false,box={x:.5,y:.4,width:.4,height:.5},filter='natural'}={}){
    const data=new Uint8ClampedArray(pixels.length);
    const gain = 2 ** v.exposure, contrast = 1 + v.contrast * .75;
    const applyFilter=v.intensity && filter!=='natural'?globalThis.PortraitFilters.get(filter).apply:null,filtered=[0,0,0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const distance = local ? Math.hypot((x / w - box.x) / (box.width / 2), (y / h - box.y) / (box.height / 2)) : 0;
        const mask = local ? Math.max(0, Math.min(1, (1 - distance) * 4)) : 1;
        // Original SDR algorithms, not copies of any commercial application's pipeline.
        const difference = Math.abs(pixels[i] - softPixels[i]) + Math.abs(pixels[i+1] - softPixels[i+1]) + Math.abs(pixels[i+2] - softPixels[i+2]);
        const blend = v.smooth * mask * Math.max(0, 1 - difference / 100) * .85;
        let r = pixels[i] * (1-blend) + softPixels[i] * blend + (pixels[i]-softPixels[i]) * v.sharpness * .7 * (1-blend);
        let g = pixels[i+1] * (1-blend) + softPixels[i+1] * blend + (pixels[i+1]-softPixels[i+1]) * v.sharpness * .7 * (1-blend);
        let b = pixels[i+2] * (1-blend) + softPixels[i+2] * blend + (pixels[i+2]-softPixels[i+2]) * v.sharpness * .7 * (1-blend);
        if(v.clarity){r+=(pixels[i]-softPixels[i])*v.clarity*.65;g+=(pixels[i+1]-softPixels[i+1])*v.clarity*.65;b+=(pixels[i+2]-softPixels[i+2])*v.clarity*.65;}
        const light = local ? 1 + (gain-1) * mask : gain;
        r = r * light + v.warmth * 22; g = g * light + v.warmth * 4; b = b * light - v.warmth * 20;
        if(v.tint){r+=v.tint*10;g-=v.tint*15;b+=v.tint*10;}
        const luminance = Math.max(0, Math.min(1, (.2126*r+.7152*g+.0722*b)/255));
        const tone = v.shadows * 50 * (1-luminance)**2 + v.highlights * 50 * luminance**2 + (v.blacks||0)*42*(1-luminance)**4 + (v.whites||0)*42*luminance**4;
        r = (r+tone-128)*contrast+128; g = (g+tone-128)*contrast+128; b = (b+tone-128)*contrast+128;
        if(v.dehaze){const factor=1+v.dehaze*.35,offset=v.dehaze*(1-luminance)*10;r=(r-128)*factor+128-offset;g=(g-128)*factor+128-offset;b=(b-128)*factor+128-offset;}
        let luma = .2126*r+.7152*g+.0722*b;
        const chroma = (Math.max(r,g,b)-Math.min(r,g,b))/255;
        const saturation = 1 + v.saturation + v.vibrance * (1-Math.min(1,chroma)) * .8;
        r = luma+(r-luma)*saturation; g = luma+(g-luma)*saturation; b = luma+(b-luma)*saturation;
        if (local && v.whiten) {
          const amount = v.whiten * mask * .65;
          luma = .2126*r+.7152*g+.0722*b;
          r = r*(1-amount)+luma*amount+amount*25;
          g = g*(1-amount)+luma*amount+amount*25;
          b = b*(1-amount)+luma*amount+amount*35;
        }
        if(applyFilter){
          applyFilter(r,g,b,luminance,filtered);
          if(v.intensity===1){r=filtered[0];g=filtered[1];b=filtered[2];}else{r+=(filtered[0]-r)*v.intensity;g+=(filtered[1]-g)*v.intensity;b+=(filtered[2]-b)*v.intensity;}
        }
        if(v.glow){const amount=v.glow*.35*luminance*luminance;r+=(255-r)*(softPixels[i]/255)*amount;g+=(255-g)*(softPixels[i+1]/255)*amount;b+=(255-b)*(softPixels[i+2]/255)*amount;}
        if (v.vignette) {
          const radius = ((x/w-.5)**2+(y/h-.5)**2)*2;
          const factor = 1-v.vignette*Math.min(1,radius)*.65;
          r*=factor; g*=factor; b*=factor;
        }
        if (v.grain) {
          // Stable per-pixel noise: changing controls never randomizes the photo.
          const seed = (Math.imul(x+1,374761393)^Math.imul(y+1,668265263))>>>0;
          const noise = ((seed%1024)/1023-.5)*v.grain*28;
          r+=noise; g+=noise; b+=noise;
        }
        data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=pixels[i+3];
      }
    }
    return data;
  }
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function makeCanvas(width,height){const c=typeof document==='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');c.width=width;c.height=height;return c;}
  function fromPixels(data,width,height){const c=makeCanvas(width,height);c.getContext('2d').putImageData(new ImageData(data,width,height),0,0);return c;}
  function soften(image,radius){
    const {width,height}=image,pad=Math.ceil(radius*3),padded=makeCanvas(width+pad*2,height+pad*2),p=padded.getContext('2d');
    p.drawImage(image,pad,pad);p.drawImage(image,0,0,width,1,pad,0,width,pad);p.drawImage(image,0,height-1,width,1,pad,pad+height,width,pad);
    p.drawImage(image,0,0,1,height,0,pad,pad,height);p.drawImage(image,width-1,0,1,height,pad+width,pad,pad,height);
    for(const [sx,sy,dx,dy] of [[0,0,0,0],[width-1,0,pad+width,0],[0,height-1,0,pad+height],[width-1,height-1,pad+width,pad+height]])p.drawImage(image,sx,sy,1,1,dx,dy,pad,pad);
    const c=makeCanvas(width,height),ctx=c.getContext('2d');ctx.filter=`blur(${radius}px)`;ctx.drawImage(padded,-pad,-pad);ctx.filter='none';padded.width=padded.height=1;return c;
  }
  function composite(data,width,height,mask,{mode='none',strength=.7,color:backgroundColor='#c9d7c4'}={}){
    if(!mask || mode==='none' || !strength)return data;
    const output=data,studio=[.16,.12,.09];let blurred;
    if(mode==='blur'){
      const input=fromPixels(data,width,height),soft=soften(input,Math.max(1,width/1600*(3+strength*26)));
      blurred=soft.getContext('2d').getImageData(0,0,width,height).data;input.width=input.height=soft.width=soft.height=1;
    }
    const hex=backgroundColor.replace('#',''),bg=[0,2,4].map(n=>parseInt(hex.slice(n,n+2),16));
    for(let i=0;i<data.length;i+=4){
      const t=clamp((mask[i]/255-.06)/.88,0,1),person=t*t*(3-2*t),amount=(1-person)*strength;
      if(mode==='remove'){output[i+3]=data[i+3]*(1-strength+person*strength);continue;}
      const gray=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      for(let c=0;c<3;c++){
        if(mode==='blur')output[i+c]=data[i+c]*(1-amount)+blurred[i+c]*amount;
        if(mode==='mono')output[i+c]=data[i+c]*(1-amount)+gray*amount;
        if(mode==='color')output[i+c]=data[i+c]*(1-amount)+bg[c]*amount;
        if(mode==='studio')output[i+c]=data[i+c]*(1-amount*.25)+(255-data[i+c])*person*strength*studio[c];
      }
    }
    return output;
  }
  function histogram(data){
    const red=new Uint32Array(256),green=new Uint32Array(256),blue=new Uint32Array(256),light=new Uint32Array(256),stride=Math.max(1,Math.floor(data.length/4/50000));let samples=0;
    for(let i=0;i<data.length;i+=4*stride){if(!data[i+3])continue;red[data[i]]++;green[data[i+1]]++;blue[data[i+2]]++;light[Math.round(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])]++;samples++;}
    const percentile=p=>{let sum=0;for(let i=0;i<256;i++){sum+=light[i];if(sum>=samples*p)return i;}return 0;};
    return {red,green,blue,light,samples,median:percentile(.5),low:percentile(.1),high:percentile(.9),clipped:samples?(light[0]+light[255])/samples:0};
  }
  function geometry(source,config,width,height,field){
    let image=source;
    if(field?.effect){
      const input=makeCanvas(source.width,source.height);input.getContext('2d').drawImage(source,0,0);
      const scaled={...field,width:source.width,height:source.height,dx:Float32Array.from(field.dx,v=>v*source.width/config.masterWidth),dy:Float32Array.from(field.dy,v=>v*source.height/config.masterHeight)};
      const warped=globalThis.PortraitReshape.warp(input.getContext('2d').getImageData(0,0,source.width,source.height).data,source.width,source.height,scaled);
      image=fromPixels(warped.data,warped.width,warped.height);
    }
    const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.scale(width/config.width,height/config.height);ctx.translate(-config.left,-config.top);ctx.translate(config.rw/2,config.rh/2);ctx.scale(config.flipped?-1:1,1);ctx.rotate(config.rotation*Math.PI/2);
    ctx.drawImage(image,-config.masterWidth/2,-config.masterHeight/2,config.masterWidth,config.masterHeight);return canvas;
  }
  async function exportPhoto(source,{width,height,geometry:config,field,values,local,box,filter,mask,ai,mime='image/jpeg',quality=.95}){
    const photo=geometry(source,config,width,height,field);
    source.close?.();
    let data=photo.getContext('2d').getImageData(0,0,width,height).data,soft=data;
    if(values.smooth||values.sharpness||values.clarity||values.glow){const blurred=soften(photo,Math.max(1.2,width/450));soft=blurred.getContext('2d').getImageData(0,0,width,height).data;blurred.width=blurred.height=1;}
    photo.width=photo.height=1;
    let output=color(data,soft,width,height,values,{local,box,filter});
    data=soft=null;
    if(mask && ai.mode!=='none'){
      const selection=geometry(fromPixels(mask.data,mask.width,mask.height),config,width,height,field),m=selection.getContext('2d').getImageData(0,0,width,height).data;selection.width=selection.height=1;
      output=composite(output,width,height,m,ai);
    }
    const target=fromPixels(output,width,height),tc=target.getContext('2d');output=null;
    if(mime==='image/jpeg'){tc.globalCompositeOperation='destination-over';tc.fillStyle='#fff';tc.fillRect(0,0,width,height);tc.globalCompositeOperation='source-over';}
    if(target.convertToBlob)return target.convertToBlob({type:mime,quality});
    return new Promise((resolve,reject)=>target.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível criar o arquivo.')),mime,quality));
  }
  globalThis.PortraitEngine={color,composite,histogram,geometry,exportPhoto,makeCanvas,fromPixels,soften};
})();
