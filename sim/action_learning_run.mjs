import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { BrainProcess, args } from './brain_proc.mjs';
import { scenario } from './server_battle.mjs';
import { ActionArena, curriculum } from './action_learning.mjs';
const DOMAIN='cadence-action-learning-v1';
const native=arm=>!['random','mother'].includes(arm);
export async function runActionProtocol({python,output='runs/action-learning.json',replicas=null,protocolFile='sim/action_learning_protocol.json'}={}){
 const protocol=JSON.parse(await readFile(protocolFile)),count=replicas??protocol.replicas;
 const process=new BrainProcess({python,module:'sim.action_learning_host',timeoutMs:30000});
 const host={call:m=>process.call(m)},rows=[],checkpoints=new Map(),sources={};
 for(const f of [protocolFile,'sim/action_learning.mjs','sim/action_learning_host.py','sim/server_battle.mjs','server/adventure/service.mjs','web/js/game/NavigationService.js'])sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 const report={protocol,sources,replicas:count,results:rows,complete:false,selection:null,transfer:[]};
 await mkdir(dirname(output),{recursive:true});
 const flush=()=>writeFile(output,JSON.stringify(report)+'\n');
 const key=(arm,r)=>`${arm}:${r}`;
 const boot=(arm,r,checkpoint=null)=>host.call({op:'boot',domain:DOMAIN,arm,seed:protocol.seeds.training+r,...(checkpoint?{checkpoint}:{})});
 async function train(row,phaseConfig=c=>c){
  if(native(row.bodyArm))await boot(row.bodyArm,row.replica);
  for(let i=0;i<protocol.trainingEpisodes;i++)row.training.push(await new ActionArena(phaseConfig(scenario(protocol.seeds.training+row.replica,i),i),{arm:row.bodyArm}).run({arm:row.bodyArm,host:native(row.bodyArm)?host:null}));
  if(native(row.bodyArm)){const saved=(await host.call({op:'save'})).checkpoint;checkpoints.set(key(row.arm,row.replica),saved);}
 }
 async function evaluate(row,phase,seed,episodes){
  let before;
  if(native(row.bodyArm)){await boot(row.bodyArm,row.replica,checkpoints.get(key(row.arm,row.replica)));before=await host.call({op:'stats'});}
  for(let i=0;i<episodes;i++)row[phase].push(await new ActionArena(scenario(seed+row.replica,i,phase),{arm:row.bodyArm}).run({arm:row.bodyArm,host:native(row.bodyArm)?host:null,frozen:true}));
  if(native(row.bodyArm)){const after=await host.call({op:'stats'});for(const field of ['weights','updates','memory_writes'])if(before[field]!==after[field])throw Error(`frozen changed ${field}`);row[phase+'Freeze']={before,after};}
 }
 const make=(arm,r,bodyArm=arm)=>({arm,bodyArm,replica:r,training:[],validation:[],evaluation:[]});
 try{
  // ALL base validation precedes curriculum selection and any held-out access.
  for(const arm of ['random','published','expanded','affordance','expanded_affordance','penalty','persistent','mother'])for(let r=0;r<count;r++){
   const row=make(arm,r);await train(row);await evaluate(row,'validation',protocol.seeds.validation,protocol.validationEpisodes);rows.push(row);await flush();console.log(JSON.stringify({stage:'validation',arm,replica:r,wins:row.validation.reduce((n,x)=>n+x.wins,0)}));
  }
  const totals=arm=>rows.filter(r=>r.arm===arm).flatMap(r=>r.validation).reduce((s,r)=>({wins:s.wins+r.wins,pet:s.pet+r.petDamageDealt,total:s.total+r.petDamageDealt+r.ownerDamageDealt}),{wins:0,pet:0,total:0});
  const pub=totals('published'),candidates=['affordance','penalty','persistent'];
  let selected='affordance',score=-Infinity;
  for(const arm of candidates){const s=totals(arm),v=s.pet/(s.total||1);if((s.wins-pub.wins)/(count*protocol.validationEpisodes)>=-.10&&v>score){selected=arm;score=v;}}
  report.selection={arm:selected,criterion:protocol.selection,validation:Object.fromEntries(candidates.map(a=>[a,totals(a)])),sealedBeforeHeldout:true};await flush();
  for(const arm of ['curriculum','pressure'])for(let r=0;r<count;r++){
   const row=make(arm,r,selected);await train(row,(c,i)=>arm==='curriculum'?curriculum(c,i):{...c,ownerScale:.5});await evaluate(row,'validation',protocol.seeds.validation,protocol.validationEpisodes);rows.push(row);await flush();console.log(JSON.stringify({stage:'validation',arm,replica:r,wins:row.validation.reduce((n,x)=>n+x.wins,0)}));
  }
  for(const arm of protocol.arms)for(const row of rows.filter(r=>r.arm===arm)){
   await evaluate(row,'evaluation',protocol.seeds.evaluation,protocol.evaluationEpisodes);await flush();console.log(JSON.stringify({stage:'heldout',arm,replica:row.replica,wins:row.evaluation.reduce((n,x)=>n+x.wins,0)}));
  }
  // Whole-species training uses independent seeds. Curriculum never sees evaluation species.
  for(const [direction,from,to,trainSeed,evalSeed] of [['moon-forest','moon','forest',11000,13000],['forest-moon','forest','moon',12000,14000]])for(const arm of ['random','published',selected,'curriculum','mother'])for(let r=0;r<Math.min(6,count);r++){
   const bodyArm=arm==='curriculum'?selected:arm;const result={direction,arm,replica:r,training:[],evaluation:[]};
   if(native(bodyArm))await boot(bodyArm,trainSeed+r);
   for(let i=0;i<protocol.trainingEpisodes;i++){let c={...scenario(trainSeed+r,i),species:from};if(arm==='curriculum')c=curriculum(c,i);result.training.push(await new ActionArena(c,{arm:bodyArm}).run({arm:bodyArm,host:native(bodyArm)?host:null}));}
   let before;if(native(bodyArm)){const saved=(await host.call({op:'save'})).checkpoint;await boot(bodyArm,r,saved);before=await host.call({op:'stats'});}
   for(let i=0;i<protocol.evaluationEpisodes;i++)result.evaluation.push(await new ActionArena({...scenario(evalSeed+r,i,'evaluation'),species:to},{arm:bodyArm}).run({arm:bodyArm,host:native(bodyArm)?host:null,frozen:true}));
   if(native(bodyArm)){const after=await host.call({op:'stats'});for(const f of ['weights','updates','memory_writes'])if(before[f]!==after[f])throw Error('transfer learned');}
   report.transfer.push(result);await flush();console.log(JSON.stringify({stage:'transfer',direction,arm,replica:r,wins:result.evaluation.reduce((n,x)=>n+x.wins,0)}));
  }
  report.complete=true;await flush();
 }finally{process.close();}
 return report;
}
if(import.meta.url===`file://${process.argv[1]}`){const o=args({python:undefined,output:'runs/action-learning.json',replicas:0});await runActionProtocol({...o,replicas:o.replicas||null});}
