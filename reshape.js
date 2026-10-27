/* Original local mesh deformation. No face model, external service or destructive source edits. */
'use strict';
(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function create(width, height) {
    const cols = Math.max(2, Math.ceil((width-1)/6)+1);
    const rows = Math.max(2, Math.ceil((height-1)/6)+1);
    return {width,height,cols,rows,dx:new Float32Array(cols*rows),dy:new Float32Array(cols*rows),effect:false};
  }
  function clone(field) { return {...field,dx:field.dx.slice(),dy:field.dy.slice()}; }
  function sample(field, x, y, result) {
    const gx=clamp(x/Math.max(1,field.width-1)*(field.cols-1),0,field.cols-1);
    const gy=clamp(y/Math.max(1,field.height-1)*(field.rows-1),0,field.rows-1);
    const x0=Math.min(field.cols-2,Math.floor(gx)), y0=Math.min(field.rows-2,Math.floor(gy));
    const fx=gx-x0,fy=gy-y0,i=y0*field.cols+x0;
    const a=(1-fx)*(1-fy),b=fx*(1-fy),c=(1-fx)*fy,d=fx*fy;
    result[0]=field.dx[i]*a+field.dx[i+1]*b+field.dx[i+field.cols]*c+field.dx[i+field.cols+1]*d;
    result[1]=field.dy[i]*a+field.dy[i+1]*b+field.dy[i+field.cols]*c+field.dy[i+field.cols+1]*d;
  }
  function stamp(field, {x,y,dx=0,dy=0,radius,mode='push',strength}) {
    if (!(strength>0) || !(radius>0) || (mode==='push' && dx===0 && dy===0)) return false;
    const sx=(field.width-1)/(field.cols-1),sy=(field.height-1)/(field.rows-1);
    const x0=clamp(Math.floor((x-radius)/Math.max(sx,1)),0,field.cols-1);
    const x1=clamp(Math.ceil((x+radius)/Math.max(sx,1)),0,field.cols-1);
    const y0=clamp(Math.floor((y-radius)/Math.max(sy,1)),0,field.rows-1);
    const y1=clamp(Math.ceil((y+radius)/Math.max(sy,1)),0,field.rows-1);
    const changes=[],offset=[0,0];
    for(let row=y0;row<=y1;row++) for(let col=x0;col<=x1;col++) {
      const px=col*sx,py=row*sy,vx=px-x,vy=py-y,d2=(vx*vx+vy*vy)/(radius*radius);
      if(d2>=1) continue;
      // Freeze the outer border and fade smoothly at the brush boundary.
      const edge=clamp(Math.min(px,py,field.width-1-px,field.height-1-py)/radius,0,1);
      const weight=(1-d2)**2*edge;
      if(!weight)continue;
      let tx=px,ty=py;
      if(mode==='push'){tx-=dx*strength*weight;ty-=dy*strength*weight;}
      else {const direction=mode==='shrink'?1:-1;tx+=vx*strength*.18*weight*direction;ty+=vy*strength*.18*weight*direction;}
      // Compose inverse maps against the old grid. Apply all writes after reading.
      sample(field,tx,ty,offset);
      changes.push([row*field.cols+col,tx-px+offset[0],ty-py+offset[1]]);
    }
    for(const [index,dx,dy] of changes){field.dx[index]=dx;field.dy[index]=dy;}
    if(changes.length)field.effect=true;
    return changes.length>0;
  }
  function warp(source, width, height, field, scale=1) {
    const outWidth=Math.max(1,Math.round(width*scale)),outHeight=Math.max(1,Math.round(height*scale));
    const data=new Uint8ClampedArray(outWidth*outHeight*4),offset=[0,0];
    for(let y=0;y<outHeight;y++)for(let x=0;x<outWidth;x++) {
      const px=(x+.5)*width/outWidth-.5,py=(y+.5)*height/outHeight-.5;
      sample(field,px,py,offset);
      const tx=clamp(px+offset[0],0,width-1),ty=clamp(py+offset[1],0,height-1);
      const x0=Math.floor(tx),y0=Math.floor(ty),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
      const fx=tx-x0,fy=ty-y0;
      const a=(1-fx)*(1-fy),b=fx*(1-fy),c=(1-fx)*fy,d=fx*fy;
      const i0=(y0*width+x0)*4,i1=(y0*width+x1)*4,i2=(y1*width+x0)*4,i3=(y1*width+x1)*4;
      const aa=source[i0+3]*a,ab=source[i1+3]*b,ac=source[i2+3]*c,ad=source[i3+3]*d,alpha=aa+ab+ac+ad;
      const out=(y*outWidth+x)*4;data[out+3]=alpha;
      if(alpha)for(let channel=0;channel<3;channel++)data[out+channel]=(source[i0+channel]*aa+source[i1+channel]*ab+source[i2+channel]*ac+source[i3+channel]*ad)/alpha;
    }
    return {data,width:outWidth,height:outHeight};
  }
  globalThis.PortraitReshape={create,clone,stamp,warp};
})();
