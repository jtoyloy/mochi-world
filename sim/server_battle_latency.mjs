import { writeFile } from 'node:fs/promises';
import { ServerArena, scenario } from './server_battle.mjs';
const results=[];
for(const timing of ['production-blocked','continuing']){
 for(const latency of [0,200,800,1600]){
  for(const arm of ['random','mother']){
   for(let seed=4000;seed<4024;seed++){
    const config=scenario(seed,0,'evaluation');
    results.push({timing,latency,arm,seed,...await new ServerArena(config,{timing}).run({arm,latency})});
   }
  }
 }
}
await writeFile('runs/server-battle-latency.json',JSON.stringify({protocol:'24 independent world seeds; matched delay 0/200/800/1600 ms; uniform random and disclosed mother; production blocked versus counterfactual continuing enemies; zero host wall-time dependence',results},null,2)+'\n');
for(const timing of ['production-blocked','continuing'])for(const latency of [0,200,800,1600]){
 const rows=results.filter(r=>r.timing===timing&&r.latency===latency&&r.arm==='random');
 console.log(JSON.stringify({timing,latency,wins:rows.reduce((n,r)=>n+r.wins,0),defeats:rows.reduce((n,r)=>n+r.defeats,0),timeouts:rows.reduce((n,r)=>n+r.timeouts,0),
 staleAttack:rows.reduce((n,r)=>n+r.staleAttack,0),staleSpecial:rows.reduce((n,r)=>n+r.staleSpecial,0),
 enemyDisplacement:rows.flatMap(r=>r.enemyDisplacement).reduce((a,b)=>a+b,0),petDisplacement:rows.flatMap(r=>r.petDisplacement).reduce((a,b)=>a+b,0),dropped:rows.reduce((n,r)=>n+r.latencyOutcomeDropped,0)}));
}
