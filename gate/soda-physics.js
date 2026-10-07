// Millilitres are conserved between bottle, wet lip, ballistic parcels, cup and spills.
// Fixed 240 Hz integration; a damped free-surface mode supplies the slosh head.
export const STEP = 1 / 240;
export const BOTTLE = [[-9,-84],[9,-84],[9,-59],[30,-40],[30,62],[-30,62],[-30,-40],[-9,-59]];
export const CUP = { left:270, right:366, top:290, bottom:412, capacity:420 };
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const area = polygon => Math.abs(polygon.reduce((sum,p,i) => { const q=polygon[(i+1)%polygon.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0))/2;
const bottleArea = area(BOTTLE);
export function submerged(polygon, level, slope=0) {
  const out=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length];
    const da=a[1]-slope*a[0]-level, db=b[1]-slope*b[0]-level;
    if(da>=0) out.push(a);
    if((da>=0)!==(db>=0)) { const t=da/(da-db); out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); }
  }
  return out;
}
export function bottleGeometry(angle, volume, slosh=0) {
  const c=Math.cos(angle), s=Math.sin(angle);
  const points=BOTTLE.map(([x,y])=>[c*x-s*y,s*x+c*y]);
  const slope=Math.tan(clamp(slosh,-.45,.45));
  let low=-150, high=150;
  for(let i=0;i<24;i++) { const mid=(low+high)/2; if(area(submerged(points,mid,slope))>bottleArea*volume/500) low=mid; else high=mid; }
  const level=(low+high)/2, mouth={x:84*s,y:-84*c};
  return {points, liquid:submerged(points,level,slope), mouth, head:Math.max(0,mouth.y-slope*mouth.x-level)};
}
export class SodaPhysics {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this,{x:105,y:165,aimX:105,aimY:165,angle:0,omega:0,slosh:0,sloshSpeed:0,vx:0,vy:0,bottle:450,lip:0,cup:0,spilled:0,particles:[],held:false,accumulator:0,flow:0,cupWave:0,cupSpeed:0,quiet:1});
  }
  grab() { this.held=true; this.quiet=0; }
  move(x,y) { this.aimX=clamp(x,65,290); this.aimY=clamp(y,105,220); }
  release() { this.held=false; }
  get value() { return Math.round(this.cup*10); }
  get stopped() { return !this.held && this.quiet>=.35 && this.particles.length===0 && this.lip===0; }
  get total() { return this.bottle+this.lip+this.cup+this.spilled+this.particles.reduce((v,p)=>v+p.volume,0); }
  advance(seconds) {
    this.accumulator+=seconds;
    while(this.accumulator+1e-10>=STEP) { this.step(); this.accumulator-=STEP; }
  }
  step() {
    const dt=STEP, oldVx=this.vx;
    // A drag to the right lifts the bottle's base: one pointer translates and tips it.
    const desired=this.held?clamp((this.aimX-135)/110,0,1)*2.55:0;
    this.vx+=(100*(this.aimX-this.x)-20*this.vx)*dt;
    this.vy+=(100*(this.aimY-this.y)-20*this.vy)*dt;
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const angularAcceleration=55*(desired-this.angle)-12*this.omega;
    this.omega+=angularAcceleration*dt; this.angle+=this.omega*dt;
    this.sloshSpeed+=(-30*this.slosh-3.4*this.sloshSpeed-(this.vx-oldVx)*.002/dt-angularAcceleration*.018)*dt;
    this.slosh+=this.sloshSpeed*dt;
    const shape=bottleGeometry(this.angle,this.bottle,this.slosh);
    // Torricelli-style head law, with a narrow neck; no target enters the physics.
    this.flow=this.bottle>0?Math.min(38,5*Math.sqrt(shape.head)):0;
    const amount=Math.min(this.bottle,this.flow*dt);
    this.bottle-=amount; this.lip+=amount;
    // Wet neck drains after righting. The final microscopic residue is emitted, never deleted.
    let volume=this.lip*(1-Math.exp(-dt/.11));
    if(amount===0 && this.lip<.00001) volume=this.lip;
    this.lip-=volume;
    if(volume>0) {
      const speed=25+Math.sqrt(shape.head*900);
      this.particles.push({x:this.x+shape.mouth.x,y:this.y+shape.mouth.y,
        vx:this.vx+this.omega*(-shape.mouth.y)+Math.sin(this.angle)*speed,
        vy:this.vy+this.omega*shape.mouth.x-Math.cos(this.angle)*speed,volume,inside:false});
    }
    const remaining=[];
    for(const p of this.particles) {
      const ox=p.x, oy=p.y; p.vy+=650*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(!p.inside && oy<CUP.top && p.y>=CUP.top) {
        const cross=ox+(p.x-ox)*(CUP.top-oy)/(p.y-oy);
        p.inside=cross>CUP.left+4 && cross<CUP.right-4;
      }
      if(p.inside) {
        // Cup wall collisions retain parcels; only crossings through the open rim count.
        if(p.x<CUP.left+4 || p.x>CUP.right-4) { p.x=clamp(p.x,CUP.left+4,CUP.right-4); p.vx*=-.2; }
        const surface=CUP.bottom-(CUP.bottom-CUP.top-8)*this.cup/CUP.capacity;
        if(p.y>=surface) {
          const caught=Math.min(p.volume,CUP.capacity-this.cup);
          this.cup+=caught; this.spilled+=p.volume-caught; this.cupSpeed+=caught*p.vy*.002;
          continue;
        }
      }
      if(p.y>440 || p.x< -100 || p.x>520) this.spilled+=p.volume;
      else remaining.push(p);
    }
    this.particles=remaining;
    this.cupSpeed+=(-45*this.cupWave-5*this.cupSpeed)*dt; this.cupWave+=this.cupSpeed*dt;
    if(!this.held && !this.particles.length && this.lip===0 && this.flow===0 && Math.abs(this.omega)<.005 && Math.abs(this.sloshSpeed)<.008) this.quiet+=dt;
    else this.quiet=0;
  }
}
