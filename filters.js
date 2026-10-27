/* Original SDR filter recipes, shared by the editor and its thumbnail previews. */
'use strict';
(() => {
  function grade({saturation=1,contrast=1,lift=0,gain=[1,1,1],offset=[0,0,0],shadows=[0,0,0],highlights=[0,0,0]}={}) {
    return (r,g,b,luminance,out) => {
      const gray=.2126*r+.7152*g+.0722*b, shadow=(1-luminance)**2, light=luminance**2;
      out[0]=((gray+(r-gray)*saturation-128)*contrast+128)*gain[0]+lift+offset[0]+shadows[0]*shadow+highlights[0]*light;
      out[1]=((gray+(g-gray)*saturation-128)*contrast+128)*gain[1]+lift+offset[1]+shadows[1]*shadow+highlights[1]*light;
      out[2]=((gray+(b-gray)*saturation-128)*contrast+128)*gain[2]+lift+offset[2]+shadows[2]*shadow+highlights[2]*light;
    };
  }
  const presets = [
    {id:'natural',name:'Natural',description:'Essencialmente você',category:'portrait',apply:(r,g,b,l,out)=>{out[0]=r;out[1]=g;out[2]=b;}},
    {id:'warm',name:'Dourado',description:'Um pouco de sol',category:'portrait',apply:(r,g,b,l,out)=>{out[0]=r*1.04+8;out[1]=g*1.01+3;out[2]=b*.94;}},
    {id:'film',name:'Filme',description:'Memórias em cores',category:'vintage',apply:(r,g,b,l,out)=>{out[0]=r*.85+24;out[1]=g*.86+20;out[2]=b*.84+22;}},
    {id:'mono',name:'P&B',description:'Um clássico atemporal',category:'mono',apply:(r,g,b,l,out)=>{out[0]=out[1]=out[2]=.2126*r+.7152*g+.0722*b;}},
    {id:'portrait',name:'Retrato',description:'Tons delicados',category:'portrait',apply:(r,g,b,l,out)=>{out[0]=r*.98+8;out[1]=g*.96+6;out[2]=b*.94+5;}},
    {id:'cinema',name:'Cinema',description:'Sombras mais frias',category:'cinema',apply:(r,g,b,l,out)=>{const shadow=1-l;out[0]=r*1.03+5-shadow*7;out[1]=g*.97+4;out[2]=b*.94+shadow*18;}},
    {id:'rosy',name:'Rosé',description:'Luz com um toque rosa',category:'portrait',apply:grade({saturation:.92,contrast:.96,offset:[10,2,5],shadows:[3,-1,3]})},
    {id:'pearl',name:'Pérola',description:'Claro e delicado',category:'portrait',apply:grade({saturation:.8,contrast:.92,lift:10,gain:[.98,1,1.03],offset:[0,2,2]})},
    {id:'sunset',name:'Pôr do sol',description:'Calor de fim de tarde',category:'portrait',apply:grade({saturation:1.08,contrast:1.04,gain:[1.06,1,.92],offset:[8,2,5],shadows:[4,0,8]})},
    {id:'arctic',name:'Ártico',description:'Fresco e cristalino',category:'cinema',apply:grade({saturation:.88,contrast:1.04,gain:[.92,1.02,1.08],offset:[-3,3,8]})},
    {id:'ocean',name:'Oceano',description:'Azuis com profundidade',category:'cinema',apply:grade({saturation:1.05,contrast:1.08,gain:[.92,1.02,1.04],shadows:[-12,8,17],highlights:[7,2,-2]})},
    {id:'copper',name:'Cobre',description:'Contraste e calor',category:'cinema',apply:grade({saturation:.88,contrast:1.12,gain:[1.08,1,.91],offset:[4,0,-3],shadows:[-5,4,3]})},
    {id:'retro',name:'Retrô',description:'Cor suave de outro tempo',category:'vintage',apply:grade({saturation:.78,contrast:.8,lift:13,gain:[1.02,1.03,.94],offset:[5,3,0]})},
    {id:'amber',name:'Âmbar',description:'Tons de mel e nostalgia',category:'vintage',apply:grade({saturation:.9,contrast:1.06,gain:[1.07,1.01,.86],offset:[6,2,-2],shadows:[5,0,-3]})},
    {id:'olive',name:'Oliva',description:'Verdes discretos',category:'vintage',apply:grade({saturation:.72,contrast:.94,lift:5,gain:[1,1.04,.9],shadows:[3,6,-2]})},
    {id:'sepia',name:'Sépia',description:'Um retrato de época',category:'vintage',apply:(r,g,b,l,out)=>{out[0]=.393*r+.769*g+.189*b;out[1]=.349*r+.686*g+.168*b;out[2]=.272*r+.534*g+.131*b;}},
    {id:'noir',name:'Noir',description:'P&B marcante',category:'mono',apply:grade({saturation:0,contrast:1.32,lift:-3})},
    {id:'aura',name:'Aura',description:'Rosa e luz suave',category:'social',apply:grade({saturation:.86,contrast:.86,lift:13,offset:[9,0,9]})},
    {id:'flash',name:'Soft Flash',description:'Luz direta, cor suave',category:'social',apply:grade({saturation:.82,contrast:1.13,lift:9,highlights:[8,8,8]})},
    {id:'clean',name:'Clean',description:'Branco e cor equilibrados',category:'social',apply:grade({saturation:.9,contrast:1.04,lift:6,gain:[1,1.01,1.02]})},
    {id:'editorial',name:'Editorial',description:'Cor contida, presença forte',category:'social',apply:grade({saturation:.55,contrast:1.17,shadows:[-3,2,6],highlights:[7,3,-2]})},
    {id:'pop',name:'Pop',description:'Cores vivas para o feed',category:'social',apply:grade({saturation:1.35,contrast:1.1,offset:[3,0,3]})},
    {id:'dream',name:'Dream',description:'Pastel com sombra lavanda',category:'social',apply:grade({saturation:.66,contrast:.79,lift:18,shadows:[12,1,16]})},
    {id:'silver',name:'Prata',description:'P&B suave e luminoso',category:'mono',apply:grade({saturation:0,contrast:.88,lift:11})}
  ];
  const byId = new Map(presets.map(preset=>[preset.id,preset]));
  const categories = [{id:'all',name:'Todos'}, {id:'portrait',name:'Retratos'}, {id:'cinema',name:'Cinema'}, {id:'vintage',name:'Vintage'}, {id:'mono',name:'P&B'}, {id:'social',name:'Social'}];
  globalThis.PortraitFilters = {presets,categories,get:id=>byId.get(id)||byId.get('natural')};
})();
