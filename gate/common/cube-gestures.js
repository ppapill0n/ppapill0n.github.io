import { transformView, inverseView } from './cube-orientation.js';
// Black seam picks consistently belong to the row/column on the positive side.
// A .03 tolerance absorbs subpixel pointer rounding for either cube size.
const layerAt=v=>{const snapped=Math.abs(Math.abs(v)-.5)<.03?Math.sign(v)*.5:v;return Math.max(-1,Math.min(1,Math.floor(snapped+.5+1e-8)));};
export const view=transformView;
export function project(v,orientation){const p=view(v,orientation);return [210+p[0]*60,170-p[1]*60,p[2]];}
// Orthographic ray / six planes, including the black seams. Picking never falls
// through a sticker gap into camera orbit, and closest visible face wins at edges.
export function pickSurface(x,y,orientation,size=3){
  const inverse=v=>inverseView(v,orientation);
  const origin=inverse([(x-210)/60,(170-y)/60,10]),direction=inverse([0,0,-1]);
  let best=null;
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const normal=[0,0,0];normal[axis]=sign;
    if(view(normal,orientation)[2]<=.001)continue;
    const t=(sign*1.505-origin[axis])/direction[axis];
    const point=origin.map((v,i)=>v+direction[i]*t);
    if(t<0||point.some((v,i)=>i!==axis&&Math.abs(v)>1.505+1e-8))continue;
    if(!best||t<best.t)best={point,normal,axis,t,cubie:point.map(v=>size===2?(v>=-.03?1:-1):layerAt(v))};
  }
  return best;
}
export function dragCandidates(hit,orientation){
  const origin=project(hit.point,orientation);
  return [0,1,2].filter(axis=>axis!==hit.axis).map(axis=>{
    const a=(axis+1)%3,b=(axis+2)%3,velocity=[0,0,0];// Project the face's row/column tangents, not the picked corner's full
    // angular velocity: its normal component can misleadingly point into another row.
    velocity[a]=-hit.normal[b]*1.505;velocity[b]=hit.normal[a]*1.505;
    const end=project(hit.point.map((v,i)=>v+velocity[i]),orientation);
    return {axis,layer:hit.cubie[axis],velocity:[end[0]-origin[0],end[1]-origin[1]]};
  }).filter(c=>Math.hypot(...c.velocity)>1e-6);
}
export function chooseDrag(hit,dx,dy,orientation){
  const length=Math.hypot(dx,dy);if(!length)return null;
  const candidates=dragCandidates(hit,orientation).map(c=>{
    const speed=Math.hypot(...c.velocity),dot=dx*c.velocity[0]+dy*c.velocity[1];
    return {...c,angle:Math.sign(dot)*Math.PI/2,score:Math.abs(dot)/(length*speed),direction:c.velocity.map(v=>v/speed*Math.sign(dot)),speed};
  }).sort((a,b)=>b.score-a.score||a.axis-b.axis);
  return candidates[0]??null;
}
