import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WorldService} from '../../server/world/service.mjs';
import {BattleBrains} from '../../server/adventure/battle.mjs';
import {BattleWorkers} from '../../server/adventure/battle-workers.mjs';
import {ITEMS} from '../../web/js/world/catalog.js';
import {BrainProcess} from '../../sim/brain_proc.mjs';
const obs=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1];
let pool,admin,world,schema,actors=[];
before(async()=>{
 if(!process.env.TEST_DATABASE_URL)throw Error('Battle worker tests require PostgreSQL TEST_DATABASE_URL');
 schema='worker_test_'+randomUUID().replaceAll('-','');admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:16});
 for(const f of ['server/schema.sql','server/world/schema.sql','server/adventure/schema.sql'])await pool.query(await readFile(f,'utf8'));
 for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
 world=new WorldService(pool);
 for(let i=0;i<100;i++){const u=await world.ensureUser('worker_'+i),id='worker-pet-'+i;await world.adopt(u.id,id,'Worker subject');actors.push({id,user:u.id});}
});
after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
const decide=(b,a,options={})=>b.decide(a.id,a.user,obs,.1,options);
const version=async a=>(await pool.query('SELECT version FROM mochi_battle_brains WHERE mochi_id=$1',[a.id])).rows[0]?.version??0;
test('A1/A2/A3 and B1/B2/B3 commit locally in order while different brains overlap',async()=>{
 const b=new BattleBrains(world,{count:2});try{
 const start=await Promise.all(actors.slice(0,2).map(version));
 const responses=await Promise.all([decide(b,actors[0]),decide(b,actors[1]),decide(b,actors[0]),decide(b,actors[1]),decide(b,actors[0]),decide(b,actors[1])]);
 assert.deepEqual(responses.filter((_,i)=>i%2===0).map(r=>r.version),[1,2,3].map(n=>start[0]+n));
 assert.deepEqual(responses.filter((_,i)=>i%2).map(r=>r.version),[1,2,3].map(n=>start[1]+n));
 assert.equal(b.workers.diagnostics().workers.filter(w=>w.saves>0).length,2);
 await assert.rejects(decide(b,actors[0],{expectedVersion:start[0]}),/Stale/);
 assert.equal(await version(actors[0]),start[0]+3);
 }finally{await b.close();}
});
test('100 different brains, one hot brain, bounded residency, and graceful draining',async()=>{
 const b=new BattleBrains(world,{count:4,maxResidents:8});
 const hot=await version(actors[0]);
 const tasks=actors.map(a=>decide(b,a));for(let i=0;i<10;i++)tasks.push(decide(b,actors[0]));
 const closing=b.close();await Promise.all(tasks);await closing;
 assert.equal(await version(actors[0]),hot+11);
 assert.ok(b.workers.diagnostics().workers.every(w=>w.residents<=8));
 await assert.rejects(decide(b,actors[0]),/unavailable/);
});
test('bounded queue and expired deadline refuse without a settlement',async()=>{
 const b=new BattleBrains(world,{count:1,maxPending:1});try{
 const task=decide(b,actors[2]);await assert.rejects(decide(b,actors[3]),/queue unavailable/);await task;
 const prior=await version(actors[3]);await assert.rejects(decide(b,actors[3],{deadlineAt:Date.now()-1}),/deadline/);assert.equal(await version(actors[3]),prior);
 }finally{await b.close();}
});
test('idle worker death and coordinator restart reload the committed checkpoint',async()=>{
 let b=new BattleBrains(world,{count:1});try{
 await decide(b,actors[4]);const v=await version(actors[4]);
 const h=b.workers.slots[0].host;process.kill(h.child.pid,'SIGKILL');await new Promise(r=>h.child.once('exit',r));
 assert.equal((await decide(b,actors[4])).version,v+1);
 assert.ok(b.workers.diagnostics().restarts>=1);
 await b.close();b=new BattleBrains(world,{count:2});assert.equal((await decide(b,actors[4])).version,v+2);
 }finally{await b.close();}
});
for(const stage of ['boot','tick-before','tick-after','save-before','save-after'])test(`worker crash at ${stage} rolls back; restart owns one continuation`,async()=>{
 let first=true;
 const b=new BattleBrains(world,{count:1,hostFactory:()=>{
 const h=new BrainProcess({module:'tests.battle_fault_worker',timeoutMs:5000});const call=h.call.bind(h);
 h.call=m=>{if(m.op==='execute'&&first){first=false;m={...m,fault:stage};}return call(m);};return h;
 }});
 try{const prior=await version(actors[5]);await assert.rejects(decide(b,actors[5]),/ended/);assert.equal(await version(actors[5]),prior);assert.equal((await decide(b,actors[5])).version,prior+1);}
 finally{await b.close();}
});
test('post-computation response loss does not commit; rollback or another writer cannot reuse speculative state',async()=>{
 let fail=true;
 const b=new BattleBrains(world,{count:1,hostFactory:()=>{
 const h=new BrainProcess({module:'mochi.battle_worker',timeoutMs:5000}),call=h.call.bind(h);
 h.call=async m=>{const response=await call(m);if(m.op==='execute'&&fail){fail=false;throw Error('lost response');}return response;};return h;
 }});
 try{const v=await version(actors[6]);await assert.rejects(decide(b,actors[6]),/lost response/);assert.equal(await version(actors[6]),v);assert.equal((await decide(b,actors[6])).version,v+1);}
 finally{await b.close();}
});
test('old generation response is rejected before database commit',async()=>{
 const workers=new BattleWorkers({count:1,hostFactory:()=>({call:async m=>m.op==='ready'?{ready:true}:{answer:{}},close(){}})});
 try{await assert.rejects(workers.run('A',async call=>{workers.slots[0].generation++;return call({op:'execute'});}),/Stale/);}
 finally{await workers.close();}
});
test('same-brain races across coordinators commit consecutive versions with row ownership',async()=>{
 const a=new BattleBrains(world,{count:1}),b=new BattleBrains(world,{count:1});
 try{const v=await version(actors[7]);const r=await Promise.all([decide(a,actors[7]),decide(b,actors[7]),decide(a,actors[7]),decide(b,actors[7])]);assert.deepEqual(r.map(x=>x.version).sort((x,y)=>x-y),[1,2,3,4].map(x=>x+v));assert.equal(await version(actors[7]),v+4);}
 finally{await a.close();await b.close();}
});
test('crash after database commit retains learning; expectedVersion prevents duplicate retry',async()=>{
 const real=world.transaction.bind(world);let lose=true;
 const wrapped={pool,now:world.now,owner:world.owner.bind(world),transaction:async(users,fn)=>{const result=await real(users,fn);if(lose){lose=false;throw Error('coordinator response lost after commit');}return result;}};
 const b=new BattleBrains(wrapped,{count:1});try{
 const v=await version(actors[8]);await assert.rejects(decide(b,actors[8],{expectedVersion:v}),/after commit/);assert.equal(await version(actors[8]),v+1);
 await assert.rejects(decide(b,actors[8],{expectedVersion:v}),/Stale/);assert.equal(await version(actors[8]),v+1);
 assert.equal((await decide(b,actors[8],{expectedVersion:v+1})).version,v+2);
 }finally{await b.close();}
});
test('Adventure batches independent rooms and applies decisions in player order before enemies',async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const {ServerArena,scenario}=await import('../../sim/server_battle.mjs');
 const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
 const order=[];let submitted=0,release;const gate=new Promise(r=>release=r);
 const game=new AdventureService(world,{brains:{decide:async(id,user,obs,reward,options)=>{if(options.execution || options.finish)return {};submitted++;if(submitted===2)release();await gate;return {action:'WAIT'};},close(){}}});
 const players=actors.slice(0,2).map((a,i)=>({...structuredClone(arena.p),userId:a.user,room:'instance-'+i,roomId:'yard',companion:{...structuredClone(arena.p.companion),id:a.id}}));
 for(const p of players){const state=structuredClone(arena.s);state.activePet=p.companion.id;state.target='enemy';state.petDecisionAt=0;state.savedAt=world.now();game.states.set(p.userId,state);}
 game.multiplayer={store:{players:new Map(players.map(p=>[p.userId,p])),rooms:new Map(players.map(p=>[p.room,{players:new Map([[p.userId,p]])}]))},send(){}};
 for(const p of players)game.instances.set(p.room,{mobs:new Map([["enemy",arena.m]])});
 game.instance=()=>({mobs:new Map([['enemy',arena.m]])});game.mob=()=>arena.m;game.ownerAttack=async()=>{};game.advancePoison=async()=>{};game.save=async()=>{};
 game.petAction=async p=>order.push(p.userId);game.advanceEnemies=async()=>order.push('enemies');
 const timer=setTimeout(()=>release(),2000);
 const at=Date.now();
 try{await game.tick();assert.ok(Date.now()-at<1900,'Independent rooms must submit concurrently');assert.equal(submitted,2);assert.deepEqual(order,[...players.map(p=>p.userId),'enemies']);}
 finally{clearTimeout(timer);await game.close();}
});
test('durable current receipt replays after response loss without learning or version increment',async()=>{
 const real=world.transaction.bind(world);let lose=true;
 const wrapped={pool,now:world.now,owner:world.owner.bind(world),transaction:async(users,fn)=>{const r=await real(users,fn);if(lose){lose=false;throw Error('lost committed receipt');}return r;}};
 const b=new BattleBrains(wrapped,{count:1});try{
 const v=await version(actors[9]),requestId=randomUUID();await assert.rejects(decide(b,actors[9],{requestId,expectedVersion:v}),/lost committed/);
 const replay=await decide(b,actors[9],{requestId,expectedVersion:v});assert.equal(replay.version,v+1);assert.equal(await version(actors[9]),v+1);assert.equal(replay.requestId,requestId);
 }finally{await b.close();}
});

for (const reason of ['disconnect','room-change','reconnect','pet-switch','ttl','target-death','target-removal','target-change','shutdown','response-loss','before-dispatch'])
test(`native committed proposal cannot move a departed body: ${reason}`,async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const {ServerArena,scenario}=await import('../../sim/server_battle.mjs');
 const a=actors[20];await pool.query('DELETE FROM mochi_battle_brains WHERE mochi_id=$1',[a.id]);
 const native=new BattleBrains(world,{count:1});let signal,release;
 const committed=new Promise(r=>signal=r),gate=new Promise(r=>release=r);
 let lose=true;
 const wrapped={decide:async(...args)=>{if(reason==='before-dispatch' && args[4]?.executionRequired){signal();await gate;}const answer=await native.decide(...args);if(args[4]?.executionRequired && reason!=='before-dispatch'){signal();await gate;if(reason==='response-loss' && lose){lose=false;throw Error('committed response lost');}}return answer;},close:()=>native.close()};
 const game=new AdventureService(world,{brains:wrapped,encounterTtlMs:120000});
 const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
 const p={...structuredClone(arena.p),userId:a.user,room:'race-room',roomId:'yard',companion:{...structuredClone(arena.p.companion),id:a.id}};
 const state={...structuredClone(arena.s),activePet:a.id,target:'enemy',petDecisionAt:0,savedAt:world.now()};
 game.states.set(a.user,state);const room={mobs:new Map([['enemy',arena.m]])};game.instances.set(p.room,room);
 game.multiplayer={store:{players:new Map([[a.user,p]]),rooms:new Map([[p.room,{players:new Map([[a.user,p]])}]])},send(){}};
 game.instance=()=>room;game.mob=()=>arena.m;game.ownerAttack=async()=>{};game.advancePoison=async()=>{};game.save=async()=>{};game.advanceEnemies=async()=>{};
 let motors=0;game.petAction=async()=>{motors++;};
 const ticking=game.tick();await committed;
 if(['disconnect','response-loss','before-dispatch'].includes(reason)){game.departure(p,'disconnect');game.multiplayer.store.players.delete(a.user);}
 if(reason==='room-change'){game.departure(p);p.room='new-room';}
 if(reason==='reconnect'){game.departure(p);game.multiplayer.store.players.set(a.user,{...p});}
 if(reason==='pet-switch')p.companion={...p.companion,id:'other-pet'};
 if(reason==='ttl')game.encounters.get(a.user).startedAt-=120001;
 if(reason==='target-death'){arena.m.hp=0;state.outcome.victory=true;}
 if(reason==='target-removal')room.mobs.clear();
 if(reason==='target-change')state.target='different-target';
 game.queue=ticking;
 const closing=reason==='shutdown'?game.close():null;
 release();await ticking;if(reason==='response-loss')await game.tick();if(closing)await closing;
 assert.equal(motors,0);
 assert.equal(state.inBattle,false);
 assert.equal(game.encounters.size,0);
 const row=(await pool.query('SELECT checkpoint,metrics FROM mochi_battle_brains WHERE mochi_id=$1',[a.id])).rows[0];
 const saved=JSON.parse(row.checkpoint.toString());assert.equal(saved.proposal,null);
 assert.equal(row.metrics.wins??0,reason==='target-death'?1:0);
 if(!closing)await game.close();
});

test('execution receipt replay and old cancellation cannot close a newer proposal',async()=>{
 const a=actors[21],b=new BattleBrains(world,{count:1});
 try {
  const first=await decide(b,a,{requestId:'proposal-one',executionRequired:true});
  const options={execution:'cancel',requestId:'proposal-one:execution',expectedVersion:first.version};
  const cancel=await b.decide(a.id,a.user,[],0,options);
  assert.equal((await b.decide(a.id,a.user,[],0,options)).version,cancel.version);
  const second=await decide(b,a,{requestId:'proposal-two',executionRequired:true});
  await assert.rejects(b.decide(a.id,a.user,[],0,options),/Stale/);
  assert.equal(await version(a),second.version);
  await b.decide(a.id,a.user,[],0,{execution:'cancel',requestId:'proposal-two:execution',expectedVersion:second.version});
 } finally {await b.close();}
});
