import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { BrainProcess, args } from './brain_proc.mjs';
import { ServerArena, scenario } from './server_battle.mjs';

export class TimedHost {
  constructor(python){this.process=new BrainProcess({python,module:'sim.server_battle_host',timeoutMs:30000});this.samples=[];}
  async call(m){const at=performance.now();const r=await this.process.call(m);if(['tick','boot','save','finish'].includes(m.op))this.samples.push({op:m.op,wallMs:performance.now()-at,hostMs:r.hostMs});return r;}
  close(){this.process.close();}
}
export async function runProtocol(protocol,{python,output,replicas=protocol.replicas,arms=protocol.arms}={}){
  const host=new TimedHost(python),results=[],profiles=[];
  const sources={};
  for(const file of ['sim/server_battle_protocol.json','sim/server_battle.mjs','sim/server_battle_host.py','server/adventure/service.mjs','web/js/game/adventure.js','web/js/game/locomotion/core.js'])sources[file]=createHash('sha256').update(await readFile(file)).digest('hex');
  try{
    for(let replica=0;replica<replicas;replica++){
      for(const arm of arms){
        const native=!['random','mother'].includes(arm);
        if(native)await host.call({op:'boot',domain:'server-battle-experiment-v1',arm,seed:1000+replica});
        const row={replica,arm,training:[],validation:[],evaluation:[],curve:[]};
        for(let index=0;index<protocol.trainingEpisodes;index++){
          const c=scenario(1000+replica,index,'training');
          row.training.push(await new ServerArena(c).run({arm,host:native?host:null}));
          if((index+1)%12===0)row.curve.push({episodes:index+1,wins:row.training.reduce((n,r)=>n+r.wins,0)});
        }
        let saved=null;
        if(native)saved=(await host.call({op:'save'})).checkpoint;
        for(const phase of ['validation','evaluation']){
          let before=null;
          if(native){await host.call({op:'boot',domain:'server-battle-experiment-v1',arm,checkpoint:saved});before=await host.call({op:'stats'});}
          const episodes=phase==='validation'?protocol.validationEpisodes:protocol.evaluationEpisodes;
          const seed=(phase==='validation'?2000:3000)+replica;
          for(let index=0;index<episodes;index++)row[phase].push(await new ServerArena(scenario(seed,index,phase)).run({arm,host:native?host:null,frozen:true}));
          if(native){
            const after=await host.call({op:'stats'});
            if(before.weights!==after.weights||before.updates!==after.updates||before.memory_writes!==after.memory_writes)throw new Error('evaluation changed durable brain');
            profiles.push({replica,arm,phase,rssBytes:after.rssBytes,cpuSeconds:after.cpuSeconds-before.cpuSeconds});
          }
        }
        results.push(row);
        console.log(JSON.stringify({replica,arm,trainWins:row.training.reduce((n,r)=>n+r.wins,0),evalWins:row.evaluation.reduce((n,r)=>n+r.wins,0)}));
        // Crash-safe receipts, not trained checkpoints or production state.
        await mkdir(dirname(output),{recursive:true});
        await writeFile(output,JSON.stringify({protocol,sources,replicas,arms,complete:false,results,profiles,timing:host.samples},null,2)+'\n');
      }
    }
    await writeFile(output,JSON.stringify({protocol,sources,replicas,arms,complete:true,results,profiles,timing:host.samples},null,2)+'\n');
  }finally{host.close();}
  return results;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const options=args({protocol:'sim/server_battle_protocol.json',output:'runs/server-battle.json',replicas:0,arms:'',python:undefined});
  const protocol=JSON.parse(await readFile(options.protocol,'utf8'));
  await runProtocol(protocol,{python:options.python,output:options.output,replicas:options.replicas||protocol.replicas,arms:options.arms?options.arms.split(','):protocol.arms});
}
