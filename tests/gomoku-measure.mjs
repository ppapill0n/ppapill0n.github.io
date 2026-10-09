// Local gzip estimates and synchronous compute; not browser/mobile timings.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { chooseMove, seededRandom } from '../gate/games/gomoku/ai.js';
import { createMatch } from '../gate/games/gomoku/rules.js';
const payload={};
for(const file of ['worker.js','ai.js','vendor/evaluator.js','rules.js','game.js','engine-client.js']) {
 const bytes=fs.readFileSync(new URL(`../gate/games/gomoku/${file}`,import.meta.url));payload[file]={raw:bytes.length,gzipEstimate:zlib.gzipSync(bytes).length};
}
const times=[];let maxEvaluations=0;
for(let seed=0;seed<20;seed++) {
 const match=createMatch(false),random=seededRandom(seed);
 while(!match.outcome){const start=performance.now(),result=chooseMove(match.board,match.turn,Math.floor(random()*4294967296));times.push(performance.now()-start);maxEvaluations=Math.max(maxEvaluations,result.evaluated);match.play(result.index);}
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({runtime:process.version,payload,existingImage:fs.statSync(new URL('../gate/assets/character-reference.png',import.meta.url)).size,compute:{calls:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1),maxEvaluations}},null,2));
