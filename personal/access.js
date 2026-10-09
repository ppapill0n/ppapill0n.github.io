import {readPass,clearPass,PASS_KEY} from '../gate/common/session-pass.js';
const page=document.documentElement,gate=new URL('../gate/',import.meta.url);
let timer=null;
function hide(){page.setAttribute('data-private-pending','');clearTimeout(timer);timer=null;}
function check(){
  hide();
  const result=readPass();
  if(result.status!=='valid'){clearPass();window.location.replace(gate.href);return;}
  // Returning from a hidden tab or bfcache always rechecks before revealing content.
  if(!document.hidden)page.removeAttribute('data-private-pending');
  timer=setTimeout(check,Math.max(0,result.pass.expiresAt-Date.now()));
}
window.addEventListener('pagehide',hide);
window.addEventListener('pageshow',check);
window.addEventListener('focus',check);
document.addEventListener('visibilitychange',check);
window.addEventListener('storage',event=>{if(event.key===PASS_KEY||event.key===null)check();});
check();
