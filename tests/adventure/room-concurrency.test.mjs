import test from 'node:test';
import assert from 'node:assert/strict';
import {AdventureService} from '../../server/adventure/service.mjs';
import {ServerArena, scenario} from '../../sim/server_battle.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function fixture(decide) {
  const game = new AdventureService({now:()=>10000,pool:{}}, {brains:{decide,close(){}}});
  const players = new Map(), rooms = new Map(), events = [];
  for (const room of ['a','b']) for (const n of [1,2]) {
    const arena = new ServerArena({...scenario(1000,n),geometry:'open',distance:40});
    const id = room+n, p = {...arena.p,userId:id,room,companion:{...arena.p.companion,id}};
    const s = arena.s; s.activePet=id; s.target=id; s.savedAt=10000; s.petDecisionAt=0;
    arena.m.id=id; players.set(id,p); game.states.set(id,s);
    if (!rooms.has(room)) { rooms.set(room,{players:new Map()}); game.instances.set(room,{mobs:new Map()}); }
    rooms.get(room).players.set(id,p); game.instances.get(room).mobs.set(id,arena.m);
  }
  game.multiplayer={store:{players,rooms},send(){}};
  game.save=async()=>{}; game.advancePoison=async()=>{};
  game.ownerAttack=async p=>events.push('owner:'+p.userId);
  game.petAction=async p=>events.push('pet:'+p.userId);
  game.advanceEnemies=async()=>events.push('enemies');
  return {game,players,events};
}

test('concentrated rooms submit together and preserve owner/pet order within each room',async()=>{
  const first = deferred(), release = deferred(); const requests=[];
  const {game,events}=fixture(async(id,_user,_obs,_reward,options)=>{
    if(options.execution) return {};
    requests.push(id); if(requests.length===2) first.resolve();
    if(id.endsWith('1')) await release.promise;
    return {action:'WAIT',version:1};
  });
  const ticking=game.tick();
  await first.promise;
  assert.deepEqual(requests,['a1','b1']);
  assert.deepEqual(events,['owner:a1','owner:b1']);
  release.resolve(); await ticking;
  for(const room of ['a','b']) assert.deepEqual(events.filter(e=>e.endsWith(room+'1')||e.endsWith(room+'2')),
    ['owner:'+room+'1','pet:'+room+'1','owner:'+room+'2','pet:'+room+'2']);
  assert.equal(events.at(-1),'enemies');
});

test('a slow room does not block another room motor, and departure skips a queued body',async()=>{
  const slow=deferred(), started=deferred(), otherDone=deferred();
  const {game,players,events}=fixture(async(id,_user,_obs,_reward,options)=>{
    if(options.execution) return {};
    if(id==='a1') {started.resolve(); await slow.promise;}
    return {action:'WAIT',version:1};
  });
  const motor=game.petAction; game.petAction=async p=>{await motor(p);if(p.userId==='b2')otherDone.resolve();};
  const ticking=game.tick(); await started.promise; await otherDone.promise;
  assert.ok(events.includes('pet:b2')); assert.ok(!events.includes('pet:a1'));
  game.departure(players.get('a1'),'disconnect'); players.delete('a1');
  game.departure(players.get('a2'),'disconnect'); players.delete('a2');
  slow.resolve(); await ticking;
  assert.ok(!events.includes('pet:a1')); assert.ok(!events.includes('owner:a2'));
});

test('a failed lane drains sibling motors and acknowledgements before releasing serialized work',async()=>{
  const receipt=deferred(), receiptStarted=deferred(), fail=deferred();
  const {game,events}=fixture(async(id,_user,_obs,_reward,options)=>{
    if(options.execution) {if(id==='b1'){receiptStarted.resolve();await receipt.promise;} return {};}
    if(id==='a1') {await fail.promise; return {action:'WAIT',version:1};}
    return {action:'WAIT',version:1};
  });
  const motor=game.petAction;
  game.petAction=async p=>{if(p.userId==='a1')throw Error('motor failed');await motor(p);};
  let next=false, completed=false;
  const ticking=game.serialize(()=>game.tick()); ticking.catch(()=>{}).finally(()=>completed=true);
  const following=game.serialize(()=>{next=true;});
  await receiptStarted.promise; fail.resolve(); await new Promise(r=>setImmediate(r));
  assert.equal(completed,false); assert.equal(next,false);
  receipt.resolve(); await assert.rejects(ticking,/motor failed/); await following;
  assert.equal(next,true); assert.ok(events.includes('pet:b2')); assert.ok(!events.includes('enemies'));
});

test('a queued actor changing rooms cannot execute in the destination room lane',async()=>{
  const slow=deferred(), started=deferred();
  const {game,players,events}=fixture(async(id,_user,_obs,_reward,options)=>{
    if(options.execution) return {};
    if(id==='a1') {started.resolve();await slow.promise;}
    return {action:'WAIT',version:1};
  });
  const ticking=game.tick(); await started.promise;
  const moving=players.get('a2');game.departure(moving,'room-change');moving.room='b';
  slow.resolve();await ticking;
  assert.ok(!events.includes('owner:a2'));assert.ok(!events.includes('pet:a2'));
  assert.equal(events.at(-1),'enemies');
});

for(const stage of ['state','poison','pet-switch','progress','owner-attack'])
test(`room changes during awaited ${stage} stop cross-lane work`,async()=>{
  let fixtureData;
  const {game,players,events}=fixture(async(id,_user,_obs,_reward,options)=>{
    if(stage==='pet-switch'&&options.finish&&id==='old-a1')fixtureData.players.get('a1').room='b';
    return options.execution||options.finish?{}:{action:'WAIT',version:1};
  });
  fixtureData={players};const moving=players.get('a1');
  if(stage==='state') {const state=game.state.bind(game);game.state=async id=>{const s=await state(id);if(id==='a1')moving.room='b';return s;};}
  if(stage==='poison') game.advancePoison=async p=>{if(p===moving)moving.room='b';};
  if(stage==='pet-switch')Object.assign(game.states.get('a1'),{activePet:'old-a1',inBattle:true});
  if(stage==='progress'){moving.roomId='exchange';game.progress=async user=>{if(user==='a1')moving.room='b';};}
  if(stage==='owner-attack'){const owner=game.ownerAttack;game.ownerAttack=async p=>{await owner(p);if(p===moving)moving.room='b';};}
  await game.tick();assert.ok(!events.includes('pet:a1'));
  if(stage!=='owner-attack')assert.ok(!events.includes('owner:a1'));
  assert.ok(events.includes('pet:b2'));assert.equal(events.at(-1),'enemies');
});
