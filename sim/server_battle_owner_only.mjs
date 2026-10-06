/** Supplemental declared WAIT control, not a Cadence policy or selection arm. */
import {writeFile} from 'node:fs/promises';
import {ServerArena,scenario} from './server_battle.mjs';
const results=[];let id=0;
const standstill={call:async(m)=>m.op==='tick'?{action:[6],decisionId:++id}:{} };
for(let replica=0;replica<12;replica++)for(let index=0;index<36;index++)results.push({replica,...await new ServerArena(scenario(3000+replica,index,'evaluation')).run({arm:'owner_only',host:standstill,frozen:true})});
await writeFile('runs/server-battle-owner-only.json',JSON.stringify({protocol:'post-hoc diagnostic control: declared WAIT on every turn, same 432 held-out worlds; not a Cadence arm and never used for model selection',results},null,2)+'\n');
