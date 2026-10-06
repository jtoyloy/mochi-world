import pg from 'pg';import {randomUUID} from 'node:crypto';import {readFile,writeFile} from 'node:fs/promises';
import {WorldService} from '../../server/world/service.mjs';import {AdventureService} from '../../server/adventure/service.mjs';import {BattleBrains} from '../../server/adventure/battle.mjs';import {ITEMS} from '../../web/js/world/catalog.js';
if(!process.env.TEST_DATABASE_URL)throw Error('PostgreSQL required');
const schema='encounter_audit_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool,game;const evidence={base:'925cdbec4399b249bbf1872a26edfaad217d2547',postgres:true,results:[]};
try{
 await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});
 for(const path of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql','server/adventure/schema.sql'])await pool.query(await readFile(path,'utf8'));
 for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
 let now=Date.now();const service=new WorldService(pool,{now:()=>now}),user=await service.ensureUser('encounter_audit'),pet=await service.adopt(user.id,'audit-pet','Audit');
 const brains=new BattleBrains(service);const calls=[];let pause=null,entered=null;
 const wrapped={decide:async(...args)=>{const answer=await brains.decide(...args);calls.push({options:args[4],answer});if(pause&&!args[4]?.finish){entered();await pause;}return answer;},close:()=>brains.close()};
 game=new AdventureService(service,{brains:wrapped,rewards:{},random:()=>.1});
 const p={userId:user.id,roomId:'yard',room:'yard-1',x:400,y:350,companion:{id:pet.id,x:440,y:350,profile:pet.profile}};
 const players=new Map([[user.id,p]]),rooms=new Map([[p.room,{players}]]);
 game.multiplayer={store:{players,rooms},send(){},broadcast(){},join:async(p,roomId)=>{p.roomId=roomId;p.room=roomId+'-1';rooms.clear();rooms.set(p.room,{players});}};
 const state=await game.state(user.id);state.activePet=pet.id;state.petHp=80;
 const room=game.instance(p),mob=[...room.mobs.values()][0];if(!mob)throw Error('Missing Yard dummy');
 p.x=mob.x-20;p.y=mob.y;p.companion.x=mob.x-35;p.companion.y=mob.y;
 state.target=mob.id;await game.tick();
 evidence.results.push({case:'real native combat decision',decisions:calls.length,inBattle:state.inBattle});
 players.delete(user.id);rooms.clear();now+=24*3600000;for(let i=0;i<3;i++)await game.tick();
 evidence.results.push({case:'disconnect active combat and advance 24h',retainedState:game.states.has(user.id),inBattle:state.inBattle,instances:game.instances.size,finishCalls:calls.filter(c=>c.options?.finish).length,ttlExpired:false});
 // Reconnect and change room: ordinary target absence closes one existing choice.
 players.set(user.id,p);p.roomId='town';p.room='town-1';rooms.set(p.room,{players});await game.tick();await game.tick();
 evidence.results.push({case:'room change after combat',inBattle:state.inBattle,finishCalls:calls.filter(c=>c.options?.finish).length});
 // Delay the *actual native* reply after its DB commit, then disconnect while tick waits.
 p.roomId='yard';p.room='yard-1';rooms.clear();rooms.set(p.room,{players});const next=[...game.instance(p).mobs.values()][0];p.x=next.x-20;p.y=next.y;p.companion.x=next.x-35;p.companion.y=next.y;
 state.target=next.id;state.petDecisionAt=0;let release;pause=new Promise(r=>release=r);const gate=new Promise(r=>entered=r);const effects=[];const original=game.petAction.bind(game);game.petAction=async(...args)=>{effects.push({room:args[0].roomId,connected:players.has(user.id),action:args[3]});return original(...args);};
 const tick=game.tick();await gate;players.delete(user.id);rooms.clear();release();await tick;pause=null;
 evidence.results.push({case:'disconnect while real native reply pending',postDisconnectExecutions:effects.slice(),retainedState:game.states.has(user.id)});
 // A room transition while a response waits is another ownership boundary.
 players.set(user.id,p);p.roomId='yard';p.room='yard-1';rooms.set(p.room,{players});
 state.target=next.id;state.petDecisionAt=0;pause=new Promise(r=>release=r);const roomGate=new Promise(r=>entered=r);
 const effectsBefore=effects.length, roomTick=game.tick();await roomGate;p.roomId='town';p.room='town-1';rooms.clear();rooms.set(p.room,{players});release();await roomTick;pause=null;
 evidence.results.push({case:'room change while real native reply pending',postTransitionExecutions:effects.slice(effectsBefore),inBattle:state.inBattle});
 p.roomId='yard';p.room='yard-1';rooms.clear();rooms.set(p.room,{players});
 // Mob reset/leash and death settlement use real service methods and DB uniqueness.
 players.set(user.id,p);rooms.set(p.room,{players});next.target=user.id;next.x=next.home.x+200;p.x=next.home.x+600;await game.advanceEnemies(now,.4);
 evidence.results.push({case:'mob leash reset',target:next.target,state:next.state});
 const before=state.xp.combat;await game.hit(p,state,next,99999);await game.hit(p,state,next,99999);
 const count=Number((await pool.query('SELECT count(*) FROM combat_encounters WHERE id=$1',[next.id])).rows[0].count);
 const previousId=next.id;now=next.respawnAt+1;const respawn=[...game.instance(p).mobs.values()].find(m=>m.spawnKey===next.spawnKey);
 evidence.results.push({case:'kill/duplicate hit/respawn',settlements:count,xpDelta:state.xp.combat-before,newMobId:respawn.id!==previousId});
 evidence.certified=false;evidence.blockers=['disconnected active state has no TTL/finish path','pending brain response executes against departed body or changed room'];
 await writeFile('docs/assays/encounter-lifecycle-audit.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{game?.close();await pool?.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}
