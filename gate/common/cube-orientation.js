// Object-to-camera unit quaternions [x, y, z, w]. Keeping the orientation rather
// than Euler angles avoids poles, pitch limits and accumulated angle overflow.
const normalize=q=>{const length=Math.hypot(...q);return q.map(v=>v/length);};
function multiply([ax,ay,az,aw],[bx,by,bz,bw]) {
  return [aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];
}
export function createOrientation(yaw=-.58,pitch=.42) {
  return normalize(multiply([Math.sin(pitch/2),0,0,Math.cos(pitch/2)],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]));
}
// The delta is measured in screen-relative radians. Pre-multiplication keeps
// right/left around the screen's vertical axis and up/down around its horizontal
// axis, even upside down. A straight diagonal uses one fixed axis, independent of
// pointer position/event spacing; unlike an arcball, there is no rim or roll zone.
export function orbitOrientation(orientation,dx,dy) {
  const angle=Math.hypot(dx,dy);
  if(!angle)return orientation;
  const scale=Math.sin(angle/2)/angle;
  return normalize(multiply([dy*scale,dx*scale,0,Math.cos(angle/2)],orientation));
}
export function transformView(v,[x,y,z,w]) {
  // q v q^-1, using two cross products for a unit quaternion.
  const tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];
}
export function inverseView(v,[x,y,z,w]) {return transformView(v,[-x,-y,-z,w]);}
