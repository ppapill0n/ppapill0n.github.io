import test from 'node:test';
import assert from 'node:assert/strict';
import {PASS_KEY,PASS_TTL,validPass,readPass,issuePass,clearPass} from '../gate/session-pass.js';
import {enterPersonal} from '../gate/entry.js';
const now=1800000000000;
const valid={version:1,issuedAt:now,expiresAt:now+PASS_TTL};
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('one fixed hour; malformed, future, expired or extended records are invalid',()=>{
  assert.ok(validPass(valid,now));assert.ok(validPass(valid,now+PASS_TTL-1));assert.ok(!validPass(valid,now+PASS_TTL));
  for(const record of [null,{},[],true,1,'pass',{...valid,version:2},{...valid,issuedAt:now+1},{...valid,issuedAt:String(now)},{...valid,expiresAt:now+PASS_TTL+1},{...valid,issuedAt:0},{...valid,issuedAt:NaN},{...valid,issuedAt:Infinity},{...valid,issuedAt:now+.5}])assert.ok(!validPass(record,now));
});
test('reads never renew; writes verify persistence; clearing removes only this pass',()=>{
  const storage=memory(),get=()=>storage;assert.equal(readPass(now,get).status,'missing');assert.ok(issuePass(now,get));
  const original=storage.getItem(PASS_KEY);for(const elapsed of [0,1000,PASS_TTL-1]){assert.equal(readPass(now+elapsed,get).status,'valid');assert.equal(storage.getItem(PASS_KEY),original);}
  assert.equal(readPass(now+PASS_TTL,get).status,'invalid');storage.setItem('unrelated','keep');assert.ok(clearPass(get));assert.equal(storage.getItem('unrelated'),'keep');assert.equal(readPass(now,get).status,'missing');
  storage.setItem(PASS_KEY,'{broken');assert.equal(readPass(now,get).status,'invalid');
});
test('storage getter, read, write and removal failures are caught, including silent no-op writes',()=>{
  const fail=()=>{throw new Error('blocked');};
  for(const get of [fail,()=>({getItem:fail,setItem:fail,removeItem:fail}),()=>undefined]){assert.equal(readPass(now,get).status,'unavailable');assert.equal(issuePass(now,get),false);assert.equal(clearPass(get),false);}
  assert.equal(issuePass(now,()=>({getItem:()=>null,setItem:()=>{}})),false);
});
test('only explicit valid settled entry issues a pass; navigation waits for a successful write',()=>{
  globalThis.sessionStorage=memory();let navigations=0;const navigate=()=>navigations++;
  for(const state of [{value:12,stopped:false},{value:11,stopped:true}])assert.equal(enterPersonal(12,state,undefined,navigate),'locked');
  assert.equal(sessionStorage.getItem(PASS_KEY),null);assert.equal(navigations,0);
  assert.equal(enterPersonal(12,{value:12,stopped:true},undefined,navigate),'entered');assert.equal(navigations,1);assert.equal(readPass().status,'valid');
  globalThis.sessionStorage={setItem(){throw Error('blocked');}};assert.equal(enterPersonal(12,{value:12,stopped:true},undefined,navigate),'unavailable');assert.equal(navigations,1);
});
