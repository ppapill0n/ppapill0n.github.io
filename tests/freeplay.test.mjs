import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFreeplayController, selectedGame } from '../play/controller.js';
import { createRegistry } from '../gate/registry.js';
import { copy, personalCue } from '../play/copy.js';

function fixture() {
  const root = { dataset:{}, replaceChildren(){ this.empty = true; }, classList:{ remove(){} } };
  const log = [], instances = [], states = [];
  let allowed = true;
  const registry = createRegistry().map(({id}) => ({
    id, next: () => ({ target:42 }),
    create(root, changed, enter) {
      changed({ value:-1, stopped:true });
      const instance = {
        changed, enter, destroyed:0,
        reset() { changed({ value:42, stopped:true }); changed({ value:0, stopped:false }); },
        getState: () => ({ value:1, stopped:true }),
        destroy() { this.destroyed++; log.push(`destroy ${id}`); changed({ value:42, stopped:true }); }
      };
      instances.push(instance); return instance;
    }
  }));
  const controller = createFreeplayController({ registry, root, allowed:() => allowed,
    selected:game => log.push(`select ${game?.id ?? 'hub'}`), changed:(state,game) => states.push({state,id:game.id}), denied:()=>log.push('denied') });
  return {controller,registry,root,log,states,instances,block(){allowed=false;}};
}
test('every game has a routable choice, unknown/malformed queries safely choose the hub', () => {
  const registry = createRegistry();
  for (const {id} of registry) assert.equal(selectedGame(`?game=${id}`, registry), id);
  for (const query of ['', '?game=', '?game=unknown', '?game=<script>', '?game=%FF', '?other=cube', '?game=GOMOKU']) assert.equal(selectedGame(query, registry), null);
  assert.equal(selectedGame('?game=cube&game=slots', registry), 'cube');
});
test('shared adapter creation/reset notifications are buffered; only final state is published', () => {
  const f = fixture();
  for (const {id} of f.registry) {
    assert.ok(f.controller.select(id));
    assert.equal(f.controller.id, id); assert.equal(f.root.dataset.game, id);
    assert.deepEqual(f.states.at(-1), {state:{value:1,stopped:true},id});
  }
  assert.equal(f.states.length,7);
  assert.ok(f.instances.slice(0,-1).every(i=>i.destroyed===1));
  f.controller.close(); assert.equal(f.instances.at(-1).destroyed,1);
});
test('switch and restart invalidate destroy callbacks and all late responses before replacing DOM', () => {
  const f = fixture(); f.controller.select('gomoku'); const old = f.instances[0];
  f.controller.select('slots'); const next = f.instances[1];
  old.changed({ outcome:'human', stopped:true }); assert.equal(f.states.length,2);
  assert.deepEqual(f.log.slice(0,3), ['select gomoku','destroy gomoku','select slots']);
  f.controller.restart(); assert.equal(f.controller.id,'slots'); assert.equal(next.destroyed,1);
  next.changed({value:777,stopped:true}); assert.equal(f.states.length,3);
  f.controller.select(null); assert.equal(f.controller.id,null); assert.equal(f.root.dataset.game,undefined);
  f.instances[2].changed({value:777,stopped:true}); assert.equal(f.states.length,3);
});
test('freeplay entry callback is a no-op, and denied access safely destroys active work', async () => {
  const f = fixture(); f.controller.select('dial'); const instance = f.instances[0];
  assert.doesNotThrow(()=>instance.enter()); assert.equal(f.controller.id,'dial');
  f.block(); instance.changed({value:42,stopped:true});
  assert.equal(instance.destroyed,0); // The adapter must finish its current render first.
  await Promise.resolve();
  assert.equal(instance.destroyed,1); assert.equal(f.controller.id,null); assert.equal(f.log.at(-1),'denied');
  assert.equal(f.controller.select('cube'),false); assert.equal(f.instances.length,1);
});
test('controller failures clear the old adapter and keep restart available', () => {
  const f = fixture(); let attempts=0,failures=0;
  const game={id:'test',next:()=>({}),create(){if(!attempts++)throw Error('failed');return {reset(){},getState:()=>({}),destroy(){}};}};
  const controller=createFreeplayController({root:f.root,registry:[game],allowed:()=>true,failed:()=>failures++});
  assert.equal(controller.select('test'),false);assert.equal(failures,1);assert.equal(controller.id,'test');assert.equal(controller.restart(),true);controller.close();
});
test('seven localized names and help entries match the shared registry; personal wording is exact', () => {
  assert.equal(personalCue.en, "can't leave yet?");
  for (const lang of ['en','ko']) for (const {id} of createRegistry()) {
    assert.ok(copy[lang].games[id].name);assert.equal(copy[lang].games[id].summary, undefined);assert.ok(copy[lang].games[id].help);
    assert.doesNotMatch(copy[lang].games[id].help, /unlock|activate Enter|to enter/);
  }
});
test('freeplay has no entry action or pass issuance and leaves gate selection code untouched', async () => {
  const html = await readFile(new URL('../play/index.html',import.meta.url),'utf8');
  assert.match(html,/data-private-pending/);assert.match(html,/visibility:hidden/);assert.doesNotMatch(html,/id="enter"/);
  const source = await readFile(new URL('../play/play.js',import.meta.url),'utf8');
  assert.match(source,/createRegistry/);assert.doesNotMatch(source,/issuePass|enterPersonal|createGameSelector|clearPass/);
  const personal = await readFile(new URL('../personal/index.html',import.meta.url),'utf8');
  assert.match(personal,/class="personal-cue" href="\.\.\/play\/"/);assert.match(personal,/Coming soon/);
});
test('changed page assets and the freeplay dial graph use matching rollout versions', async () => {
  const files=await Promise.all(['../index.html','../personal/index.html','../play/index.html','../play/play.js','../gate/registry.js','../gate/games/dial/game.js'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
  for(const html of files.slice(0,3)) assert.match(html,/academic\.css\?v=20261009-freeplay/);
  assert.match(files[0],/academic\.js\?v=20261009-freeplay/);
  assert.match(files[2],/play\.js\?v=20261009-orbit/);
  assert.match(files[1],/coming-soon\.js\?v=20261009-freeplay/);
  assert.match(files[1],/data-copy="play">can't leave yet\?/);
  assert.match(files[3],/registry\.js\?v=20261009-orbit/);
  assert.match(files[4],/games\/dial\/game\.js\?v=20261009-freeplay/);
  assert.match(files[5],/dial\.js\?v=20261009-freeplay/);
});

test('gallery shell shows names and screenshots without explanatory copy', async () => {
  const html = await readFile(new URL('../play/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../play/play.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../play/play.js', import.meta.url), 'utf8');
  assert.match(html, /id="hub-title" class="sr-only"/);
  assert.doesNotMatch(html, /hub-intro|eyebrow|data-copy="intro"|data-copy="back"|<footer/);
  assert.match(html, /data-label="back" aria-label="Back to personal"/);
  assert.match(html, /play\.css\?v=20261009-gallery/);
  assert.match(source, /copy\.js\?v=20261009-gallery/);
  assert.match(source, /thumbnails\/\$\{game.id\}\.webp\?v=20261009-gallery/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)\s*{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /aspect-ratio:4\/3/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
test('seven real screenshot assets are optimized WebP files', async () => {
  let total = 0;
  for (const { id } of createRegistry()) {
    const bytes = await readFile(new URL(`../play/thumbnails/${id}.webp`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', id);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', id);
    assert.ok(bytes.length > 1000 && bytes.length < 80000, `${id}: sensible thumbnail size`);
    total += bytes.length;
  }
  assert.ok(total < 300000, 'all seven thumbnails stay below 300 kB');
});

test('gate and freeplay invalidate the complete changed cube module graph together', async () => {
  const graph=[['../gate/index.html','gate.js'],['../play/index.html','play.js'],['../gate/gate.js','./registry.js'],['../play/play.js','../gate/registry.js'],['../gate/registry.js','./games/cube/game.js'],['../gate/registry.js','./games/cube2/game.js'],['../gate/games/cube/game.js','../../common/cube-game.js'],['../gate/games/cube2/game.js','../../common/cube-game.js'],['../gate/common/cube-game.js','./cube-gestures.js']];
  for(const [file,dependency] of graph){const source=await readFile(new URL(file,import.meta.url),'utf8');assert.ok(source.includes(`${dependency}?v=20261009-orbit`),`${file} must invalidate ${dependency}`);}
});
