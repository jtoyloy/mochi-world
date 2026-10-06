/** Supplemental leave-one-species-out transfer. All original arms, no selection/tuning. */
import {readFile,writeFile} from 'node:fs/promises';
import {TimedHost} from './server_battle_run.mjs';
import {ServerArena,scenario} from './server_battle.mjs';
const original=JSON.parse(await readFile('sim/server_battle_protocol.json','utf8'));
const protocol={description:'supplemental species transfer; fixed original arms; six independent brain/world seed pairs each direction; training 60 one-species encounters, frozen evaluation 36 other-species encounters',directions:[['moon','forest'],['forest','moon']],replicas:6,trainingEpisodes:60,evaluationEpisodes:36,trainingSeeds:'5000 + direction*100 + replica',evaluationSeeds:'6000 + direction*100 + replica',arms:original.arms};
// Save the protocol before executing these new seed panels.
await writeFile('runs/server-battle-transfer-protocol.json',JSON.stringify(protocol,null,2)+'\n');
const host=new TimedHost(),results=[];
try{
 for(let direction=0;direction<2;direction++)for(let replica=0;replica<protocol.replicas;replica++)for(const arm of protocol.arms){
  const native=!['random','mother'].includes(arm),seed=5000+direction*100+replica,[trainSpecies,evalSpecies]=protocol.directions[direction];
  if(native)await host.call({op:'boot',domain:'server-battle-experiment-v1',arm,seed});
  const row={direction,replica,arm,trainSpecies,evalSpecies,training:[],evaluation:[]};
  for(let i=0;i<60;i++)row.training.push(await new ServerArena({...scenario(seed,i,'training'),species:trainSpecies}).run({arm,host:native?host:null}));
  let before=null;
  if(native){const checkpoint=(await host.call({op:'save'})).checkpoint;await host.call({op:'boot',domain:'server-battle-experiment-v1',arm,checkpoint});before=await host.call({op:'stats'});}
  for(let i=0;i<36;i++)row.evaluation.push(await new ServerArena({...scenario(6000+direction*100+replica,i,'evaluation'),species:evalSpecies}).run({arm,host:native?host:null,frozen:true}));
  if(native){const after=await host.call({op:'stats'});for(const k of ['weights','updates','memory_writes'])if(before[k]!==after[k])throw new Error('transfer evaluation learned');}
  results.push(row);console.log(JSON.stringify({direction,replica,arm,wins:row.evaluation.reduce((n,r)=>n+r.wins,0)}));
  await writeFile('runs/server-battle-transfer.json',JSON.stringify({protocol,complete:false,results},null,2)+'\n');
 }
 await writeFile('runs/server-battle-transfer.json',JSON.stringify({protocol,complete:true,results},null,2)+'\n');
}finally{host.close();}
