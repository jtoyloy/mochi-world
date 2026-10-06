/** Declared causal fixture + seeded response-delay traces; no training or policy substitution. */
import {writeFile} from 'node:fs/promises';
import {ServerArena,scenario} from './server_battle.mjs';
const arena=new ServerArena({...scenario(4000,0),type:'boar',geometry:'open',distance:40,pressure:'owner',cooldown:0},{trace:true});
const request=(action,id)=>({action,id,at:arena.now,enemy:{...arena.m},pet:{...arena.p.companion},valid:true});
const originalCue=arena.obs(false);
await arena.execute(request(1,1),null,false);
arena.now+=1400;await arena.execute(request(6,2),null,false);
arena.now+=200;await arena.advanceEnemies(arena.now,.4);
const delayed={description:'declared physics fixture: owner guard at t0, WAIT at t+1400, enemy hit at t+1600. No Cadence arm taught or changed.',originalCue,events:arena.events,receipts:arena.credits};
const stale=[];
for(let seed=4000;seed<4024;seed++){
 const world=new ServerArena(scenario(seed,0,'evaluation'),{timing:'continuing',trace:true});
 const outcome=await world.run({arm:'random',latency:1600});
 if(outcome.staleAttack||outcome.staleSpecial)stale.push({...outcome,decisionLedger:Object.fromEntries(world.ledger)});
}
await writeFile('runs/server-battle-traces.json',JSON.stringify({protocol:'action IDs and timestamps; declared guard fixture plus seeded uniform-random continuing-enemy stress at1600 ms. No Cadence policy taught.',delayed,stale},null,2)+'\n');
