import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createWorkerEngine } from '../gate/games/gomoku/engine-client.js';
import { emptyBoard } from '../gate/games/gomoku/rules.js';
function fixture(timeoutMs=100,loadTimeoutMs=timeoutMs) {
  const workers=[];
  const engine=createWorkerEngine({timeoutMs,loadTimeoutMs,workerFactory:()=>{
    const worker={terminated:false,onmessage:null,onerror:null,postMessage(data){this.sent=data;},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  return {engine,workers,reply(worker,index,id=worker.sent.id){worker.onmessage?.({data:{id,index}});}};
}
test('adapter copies board, accepts a legal result and terminates the worker',async()=>{
  const f=fixture(),board=emptyBoard(),p=f.engine.findMove(board,2,{seed:9});board[112]=1;
  assert.equal(f.workers[0].sent.board[112],0);f.reply(f.workers[0],112);assert.equal(await p,112);assert.ok(f.workers[0].terminated);
});
test('new requests cancel obsolete searches and ignore saved stale callbacks',async()=>{
  const f=fixture(),old=f.engine.findMove(emptyBoard(),2);const rejected=assert.rejects(old,{name:'AbortError'}),callback=f.workers[0].onmessage;
  const current=f.engine.findMove(emptyBoard(),2);callback({data:{id:f.workers[0].sent.id,index:1}});assert.ok(f.workers[0].terminated);
  f.reply(f.workers[1],112,999);f.reply(f.workers[1],3);assert.equal(await current,3);await rejected;f.engine.destroy();
});
test('abort, destroy, timeout, worker failure and illegal moves reject without leaks',async()=>{
  for(const action of ['abort','destroy','timeout','error','illegal']) {
    const f=fixture(5),board=emptyBoard();board[0]=1;const controller=new AbortController(),p=f.engine.findMove(board,2,{signal:controller.signal});
    const rejected=assert.rejects(p);if(action==='abort')controller.abort();if(action==='destroy')f.engine.destroy();if(action==='error')f.workers[0].onerror({preventDefault(){}});if(action==='illegal')f.reply(f.workers[0],0);
    await rejected;assert.ok(f.workers[0].terminated);f.engine.destroy();
  }
});
test('already aborted or destroyed adapters never create workers',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.engine.findMove(emptyBoard(),2,{signal:controller.signal}),{name:'AbortError'});f.engine.destroy();await assert.rejects(f.engine.findMove(emptyBoard(),2),{name:'AbortError'});assert.equal(f.workers.length,0);
});
test('real module worker runs the shipped protocol and returns legal moves',async()=>{
  const workerUrl=new URL('../gate/games/gomoku/worker.js',import.meta.url).href;
  const engine=createWorkerEngine({timeoutMs:1500,workerFactory:()=>{
    const node=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(workerUrl)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
    const adapter={postMessage:data=>node.postMessage(data),terminate:()=>node.terminate(),onmessage:null,onerror:null};node.on('message',data=>adapter.onmessage?.({data}));node.on('error',error=>adapter.onerror?.(error));return adapter;
  }});
  const board=emptyBoard();board[112]=1;const index=await engine.findMove(board,2,{seed:42});assert.equal(board[index],0);engine.destroy();
});

test('worker ready switches from cold-load allowance to bounded computation',async()=>{
  const f=fixture(5,100),p=f.engine.findMove(emptyBoard(),2);const rejected=assert.rejects(p,/time limit/);
  f.workers[0].onmessage({data:{type:'ready'}});await rejected;assert.ok(f.workers[0].terminated);
});
