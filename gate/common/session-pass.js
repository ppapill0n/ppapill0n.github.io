// A same-tab convenience gate, not authentication or protection of static source.
export const PASS_KEY='personal-gate-pass';
export const PASS_TTL=60*60*1000;
export function validPass(pass,now=Date.now()) {
  return !!pass && pass.version===1 && Number.isSafeInteger(pass.issuedAt) && Number.isSafeInteger(pass.expiresAt)
    && pass.issuedAt>0 && pass.issuedAt<=now && pass.expiresAt===pass.issuedAt+PASS_TTL && now<pass.expiresAt;
}
export function readPass(now=Date.now(),getStorage=()=>globalThis.sessionStorage) {
  try {const raw=getStorage().getItem(PASS_KEY);if(raw===null)return {status:'missing'};
    let pass;try{pass=JSON.parse(raw);}catch{return {status:'invalid'};}
    return validPass(pass,now)?{status:'valid',pass}:{status:'invalid'};
  } catch {return {status:'unavailable'};}
}
export function clearPass(getStorage=()=>globalThis.sessionStorage) {
  try {const storage=getStorage();storage.removeItem(PASS_KEY);return storage.getItem(PASS_KEY)===null;}catch{return false;}
}
export function issuePass(now=Date.now(),getStorage=()=>globalThis.sessionStorage) {
  const pass={version:1,issuedAt:now,expiresAt:now+PASS_TTL};
  try {if(!validPass(pass,now))return false;const storage=getStorage();const raw=JSON.stringify(pass);storage.setItem(PASS_KEY,raw);return storage.getItem(PASS_KEY)===raw;}catch{return false;}
}
