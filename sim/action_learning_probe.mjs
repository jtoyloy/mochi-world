/** Reproducible diagnostic replay; never used to tune or choose evaluated actions. */
import { writeFile, mkdir } from 'node:fs/promises';
import { BrainProcess, args } from './brain_proc.mjs';
import { scenario } from './server_battle.mjs';
import { ActionArena } from './action_learning.mjs';
const o=args({python:undefined,output:'runs/action-probes'});await mkdir(o.output,{recursive:true});
const host=new BrainProcess({python:o.python,module:'sim.action_learning_host'});
try{
 for(const arm of ['published','expanded','affordance','expanded_affordance','penalty','persistent'])for(let replica=0;replica<3;replica++){
  await host.call({op:'boot',domain:'cadence-action-learning-v1',arm,seed:7000+replica});
  const contexts=[];
  for(const [label,distance,cooldown,geometry] of [['near-ready',40,0,'open'],['far-ready',260,0,'open'],['near-cooldown',40,5000,'open'],['obstacle',140,0,'obstacle']]){
   const a=new ActionArena({...scenario(6999,0),distance,cooldown,geometry,jitter:0},{arm});contexts.push({label,obs:a.obs(),physical:a.observed});
  }
  const fresh=(await host.call({op:'probe',obs:contexts.map(c=>c.obs)})).probes;
  for(let i=0;i<60;i++)await new ActionArena(scenario(7000+replica,i),{arm}).run({arm,host});
  const saved=(await host.call({op:'save'})).checkpoint;
  const trained=(await host.call({op:'probe',obs:contexts.map(c=>c.obs)})).probes;
  await writeFile(`${o.output}/${arm}-${replica}.json`,JSON.stringify({arm,replica,contexts,fresh,trained,checkpoint:saved}));
  console.log(JSON.stringify({arm,replica,trained:trained.map(p=>p.action)}));
 }
}finally{host.close();}
