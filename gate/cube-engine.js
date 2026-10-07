export const FACES = Object.freeze({
  U:{axis:1,sign:1,color:'#f5f5f0',name:'Up'},
  R:{axis:0,sign:1,color:'#d93636',name:'Right'},
  F:{axis:2,sign:1,color:'#219653',name:'Front'},
  D:{axis:1,sign:-1,color:'#ffd434',name:'Down'},
  L:{axis:0,sign:-1,color:'#f28a25',name:'Left'},
  B:{axis:2,sign:-1,color:'#2468d8',name:'Back'}
});
export function rotate(v,axis,angle) {
  const result=[...v], a=(axis+1)%3,b=(axis+2)%3,c=Math.cos(angle),s=Math.sin(angle);
  result[a]=v[a]*c-v[b]*s;result[b]=v[a]*s+v[b]*c;return result;
}
export function solvedCube() {
  const stickers=[];
  for(const [face,{axis,sign}] of Object.entries(FACES)) for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++) {
    const p=[0,0,0],n=[0,0,0];p[axis]=sign;p[(axis+1)%3]=a;p[(axis+2)%3]=b;n[axis]=sign;
    stickers.push({p,n,color:face});
  }
  return stickers;
}
export function moveSpec(face,inverse=false) { const {axis,sign}=FACES[face];return {axis,sign,angle:-sign*(inverse?-1:1)*Math.PI/2}; }
export function turn(stickers,face,inverse=false) {
  const {axis,sign,angle}=moveSpec(face,inverse);
  return stickers.map(s=>s.p[axis]===sign?{...s,p:rotate(s.p,axis,angle).map(Math.round),n:rotate(s.n,axis,angle).map(Math.round)}:s);
}
export function isSolved(stickers) {
  return Object.values(FACES).every(({axis,sign})=>{
    const side=stickers.filter(s=>s.n[axis]===sign);
    return side.length===9 && side.every(s=>s.color===side[0].color);
  });
}
export function scramble(random=Math.random,length=25) {
  let stickers=solvedCube(),previous=null;const moves=[],faces=Object.keys(FACES);
  for(let i=0;i<length;i++) {
    const choices=faces.filter(face=>face!==previous);
    const face=choices[Math.floor(random()*choices.length)],inverse=random()<.5;
    moves.push({face,inverse});stickers=turn(stickers,face,inverse);previous=face;
  }
  if(isSolved(stickers)) {moves.push({face:'R',inverse:false});stickers=turn(stickers,'R');}
  return {stickers,moves};
}
