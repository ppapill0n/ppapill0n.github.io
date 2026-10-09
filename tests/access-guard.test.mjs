import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessGuard } from '../gate/common/access-guard.js';
import { PASS_KEY, PASS_TTL, readPass, issuePass } from '../gate/common/session-pass.js';
import { installFakeClock } from './fake-clock.mjs';
function fixture(status='valid') {
  const window=new EventTarget(),document=new EventTarget();document.hidden=false;
  const attrs=new Set(['data-private-pending']),page={setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k)};
  let now=1800000000000,valid=0,blocked=0,hidden=0,navigations=0,clears=0;
  const issuedAt=now,pass={version:1,issuedAt,expiresAt:issuedAt+PASS_TTL};
  const guard=createAccessGuard({page,document,window,now:()=>now,
    read:()=>status==='valid'&&now<pass.expiresAt?{status,pass}:{status:'invalid'},
    clear:()=>clears++,onValid:()=>valid++,onBlocked:()=>blocked++,onPageHide:()=>hidden++,navigate:()=>navigations++});
  return {guard,page,window,document,attrs,pass,setTime:value=>{now=value;},setStatus:value=>{status=value;},counts:()=>({valid,blocked,hidden,navigations,clears})};
}
test('shared guard reveals only a valid fixed session and redirects invalid access once', () => {
  const clock=installFakeClock();
  try {
    for(const status of ['missing','invalid','unavailable']) {
      const f=fixture(status);assert.ok(f.attrs.has('data-private-pending'));assert.equal(f.counts().navigations,1);
      f.window.dispatchEvent(new Event('focus'));assert.equal(f.counts().navigations,1);assert.equal(clock.pendingCount,0);f.guard.destroy();
    }
    const f=fixture();assert.ok(!f.attrs.has('data-private-pending'));assert.equal(f.counts().valid,1);assert.equal(clock.pendingCount,1);f.guard.destroy();assert.equal(clock.pendingCount,0);
  } finally {clock.restore();}
});
test('expiry cancels pending work before navigation and never extends the deadline', () => {
  const clock=installFakeClock();
  try {
    const f=fixture();f.setTime(f.pass.issuedAt+PASS_TTL-1);clock.advance(PASS_TTL-1);
    f.window.dispatchEvent(new Event('focus'));assert.equal(f.counts().blocked,0);assert.equal(clock.pendingCount,1);
    f.setTime(f.pass.expiresAt);clock.advance(1);
    assert.deepEqual(f.counts(),{valid:2,blocked:1,hidden:0,navigations:1,clears:1});assert.ok(f.attrs.has('data-private-pending'));assert.equal(clock.pendingCount,0);f.guard.destroy();
  } finally {clock.restore();}
});
test('hidden page, bfcache, storage changes and expiry are validated before reveal', () => {
  const clock=installFakeClock();
  try {
    const f=fixture();f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.ok(f.attrs.has('data-private-pending'));assert.equal(f.counts().valid,1);
    f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.ok(!f.attrs.has('data-private-pending'));
    f.window.dispatchEvent(new Event('pagehide'));assert.ok(f.attrs.has('data-private-pending'));assert.equal(f.counts().hidden,1);assert.equal(clock.pendingCount,0);
    f.window.dispatchEvent(new Event('pageshow'));assert.ok(!f.attrs.has('data-private-pending'));assert.equal(clock.pendingCount,1);
    const unrelated=new Event('storage');unrelated.key='other';const before=f.counts().valid;f.window.dispatchEvent(unrelated);assert.equal(f.counts().valid,before);
    f.setStatus('missing');const event=new Event('storage');event.key=PASS_KEY;f.window.dispatchEvent(event);assert.ok(f.attrs.has('data-private-pending'));assert.equal(f.counts().blocked,1);f.guard.destroy();
    const expired=fixture();expired.window.dispatchEvent(new Event('pagehide'));expired.setTime(expired.pass.expiresAt);expired.window.dispatchEvent(new Event('pageshow'));assert.ok(expired.attrs.has('data-private-pending'));assert.equal(expired.counts().valid,1);assert.equal(expired.counts().navigations,1);expired.guard.destroy();
  } finally {clock.restore();}
});
test('repeated valid checks never mutate the stored pass', () => {
  const clock=installFakeClock(),data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const now=1800000000000;issuePass(now,()=>storage);const raw=data.get(PASS_KEY),page={setAttribute(){},removeAttribute(){}};
  const window=new EventTarget(),document=new EventTarget();document.hidden=false;
  try {
    const guard=createAccessGuard({page,document,window,now:()=>now+500,read:time=>readPass(time,()=>storage)});
    for(let i=0;i<10;i++){window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));}
    assert.equal(data.get(PASS_KEY),raw);guard.destroy();
  } finally {clock.restore();}
});
