/** Audit rewards actually delivered to executed choices on training-only replay. */
import { writeFile } from 'node:fs/promises';
import { BrainProcess, args } from './brain_proc.mjs';
import { scenario } from './server_battle.mjs';
import { ActionArena } from './action_learning.mjs';
const o=args({python:undefined,output:'runs/action-credit-audit.json'}),records=[];
const process=new BrainProcess({python:o.python,module:'sim.action_learning_host'});
try{
 for(const arm of ['published','affordance','penalty'])for(let replica=0;replica<3;replica++){
  await process.call({op:'boot',domain:'cadence-action-learning-v1',arm,seed:7000+replica});
  for(let i=0;i<60;i++){
   const arena=new ActionArena(scenario(7000+replica,i),{arm});let credited=0;
   const host={call:async m=>{
    const details=arena.metrics.decisionDetails;
    if(['tick','finish'].includes(m.op)&&details.length>credited){const d=details.at(-1);records.push({arm,replica,episode:i,action:d.action,invalid:!d.execution.executable,reasons:d.execution.reasons,reward:m.reward,terminal:m.op==='finish',ownerWon:!!arena.metrics.wins,petDamage:arena.metrics.petDamageDealt});credited=details.length;}
    return process.call(m);
   }};
   await arena.run({arm,host});
  }
 }
 await writeFile(o.output,JSON.stringify({diagnostic:'training seeds7000..7002, not selection or held-out',records})+'\n');
}finally{process.close();}
