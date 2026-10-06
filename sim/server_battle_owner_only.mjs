/** Supplemental declared WAIT control, not a Cadence policy or selection arm. */
import {writeFile} from 'node:fs/promises';
import {ServerArena,scenario} from './server_battle.mjs';
import {args} from './brain_proc.mjs';
const options=args({seed:3000,replicas:12,episodes:36,output:'runs/server-battle-owner-only.json'});
const results=[];let id=0;
const standstill={call:async(m)=>m.op==='tick'?{action:[6],decisionId:++id}:{} };
for(let replica=0;replica<options.replicas;replica++)for(let index=0;index<options.episodes;index++)results.push({replica,...await new ServerArena(scenario(options.seed+replica,index,'evaluation')).run({arm:'owner_only',host:standstill,frozen:true})});
await writeFile(options.output,JSON.stringify({protocol:'post-hoc diagnostic control: declared WAIT on every turn; not a Cadence arm and never used for model selection',options,results},null,2)+'\n');
