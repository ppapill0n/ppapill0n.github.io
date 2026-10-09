import {canEnter} from './engine.js';
import {issuePass} from './session-pass.js';
// Called only by the explicit Enter action; matching a game never grants a pass.
export function enterPersonal(target,state,rules,navigate=()=>window.location.assign('../personal/')) {
  if(!canEnter(target,state,rules))return 'locked';
  if(!issuePass())return 'unavailable';
  navigate();return 'entered';
}
