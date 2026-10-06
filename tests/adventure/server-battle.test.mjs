import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerArena, scenario, expandedObservation, rewardFor } from '../../sim/server_battle.mjs';
import { battleObservation, battleReward, BATTLE_ACTIONS } from '../../web/js/game/adventure.js';

test('seeded held-out server physics is reproducible and differs from training distributions',async()=>{
 const config=scenario(3001,4,'evaluation');
 const a=await new ServerArena(config,{trace:true}).run({arm:'random'});
 const b=await new ServerArena(config,{trace:true}).run({arm:'random'});
 assert.deepEqual(a,b);
 assert.notDeepEqual(config,scenario(1001,4,'training'));
 assert.equal(a.wins+a.defeats+a.timeouts,1);
 assert.equal(a.actions.reduce((x,y)=>x+y),a.decisions);
});
test('predeclared scenario panel stays valid and covers all factors and species',()=>{
 const panel=Array.from({length:500},(_,i)=>scenario(3000,i,'evaluation'));
 for(const config of panel){const arena=new ServerArena(config);for(const value of arena.obs(true))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);}
 for(const key of ['type','distance','ownerHp','petHp','cooldown','pressure','geometry','species','latency'])assert.ok(new Set(panel.map(c=>c[key])).size>=2,key);
});
test('expanded physical senses resolve guard, range, attack phase and geometry aliasing',()=>{
 const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
 const before=arena.obs(false),expanded=arena.obs(true);
 arena.s.ownerGuardUntil=arena.now+1800;arena.m.attackAt=arena.now+800;
 arena.p.companion.profile.variant='Woodland Deer Mint';
 assert.deepEqual(arena.obs(false),before);
 assert.notDeepEqual(arena.obs(true),expanded);
 assert.equal(arena.obs(true).length,26);
 assert.equal(arena.obs(true)[16],1);
 assert.equal(arena.obs(true)[18],.5);
 assert.equal(arena.obs(true)[20],180/400);
});
test('actual guard protection receipt belongs to its executed action across a later WAIT',async()=>{
 const arena=new ServerArena({...scenario(1000,0),type:'boar',geometry:'open',distance:40,pressure:'owner',cooldown:0},{trace:true});
 const request=(action,id)=>({action,id,at:arena.now,enemy:{...arena.m},pet:{...arena.p.companion},valid:true});
 await arena.execute(request(1,1),null,false);
 arena.now+=1400;await arena.execute(request(6,2),null,false);
 arena.now+=200;await arena.advanceEnemies(arena.now,.4);
 assert.ok(arena.metrics.causalProtection>0);
 assert.ok(arena.metrics.delayedProtection>0);
 assert.equal(arena.credits[0].decisionId,1);
 assert.equal(arena.events.find(e=>e.type==='protection').lastActionId,2);
});
test('mapped movement traverses the production motor path and invalid attacks remain choices with waste',async()=>{
 const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:260});
 const request={action:4,id:1,at:arena.now,enemy:{...arena.m},pet:{...arena.p.companion},valid:true};
 const x=arena.p.companion.x;
 await arena.execute(request,null,false);await arena.motion(.1);
 assert.ok(arena.p.companion.x>x);
 assert.equal(arena.p.companion.motorPath.length,1);
 const invalid={...request,action:0,id:2};await arena.execute(invalid,null,false);
 assert.equal(arena.metrics.invalidAttack,1);
 assert.equal(arena.metrics.actions[BATTLE_ACTIONS.indexOf('ATTACK')],1);
});
test('reward arms are bounded, original control agrees, and protection-free arm removes positive stalling reward',()=>{
 for(const arm of ['published','no_protection','expanded','causal','expanded_causal','terminal']){
  for(const outcome of [{damageDealt:1e9},{ownerDamage:1e9},{protection:3,ownerDamage:1}])assert.ok(Math.abs(rewardFor(arm,outcome))<=1);
 }
 const outcome={protection:3,ownerDamage:1};
 assert.equal(rewardFor('published',outcome),battleReward(outcome));
 assert.ok(rewardFor('no_protection',outcome)<0);
});

test('both species use their production special range, power and guard behavior',async()=>{
 for(const species of ['moon','forest']){
  const arena=new ServerArena({...scenario(1000,0),species,geometry:'open',distance:170,cooldown:0});
  const request={action:3,id:1,at:arena.now,enemy:{...arena.m},pet:{...arena.p.companion},valid:true};
  await arena.execute(request,null,false);
  assert.equal(arena.metrics.specials,1);
  assert.equal(Boolean(arena.s.ownerGuardUntil),species==='forest');
  assert.equal(arena.obs(true)[20],(species==='forest'?180:190)/400);
 }
});

test('each appended physical input has a witnessed legacy alias rather than an answer label',()=>{
 const make=()=>new ServerArena({...scenario(1000,0),species:'moon',geometry:'open',distance:65,cooldown:0});
 const changes=[
  [16,a=>{a.s.ownerGuardUntil=a.now+900;}],
  [17,a=>{a.s.petGuardUntil=a.now+900;}],
  [18,a=>{a.m.attackAt=a.now+800;}],
  [19,a=>{a.p.x-=90;}],
  [20,a=>{a.p.companion.profile.variant='Woodland Deer Mint';}],
  [21,a=>{a.p.x=110;a.p.y=210;a.p.companion.x=120;a.p.companion.y=210;a.m.x=175+a.config.jitter;a.m.y=210;}],
  [22,a=>{a.p.companion.motorPath=[{x:a.p.companion.x+65,y:a.p.companion.y}];}],
  [23,a=>{a.s.cooldowns.attack=a.now+1000;}],
  [24,a=>{a.m.x=2*a.p.companion.x-a.m.x;}],
  [25,a=>{const d=Math.hypot(a.m.x-a.p.companion.x,a.m.y-a.p.companion.y);a.m.x=a.p.companion.x;a.m.y=a.p.companion.y+d;}],
 ];
 for(const [index,change] of changes){
  const arena=make(),before=arena.obs(false),expanded=arena.obs(true);change(arena);
  assert.deepEqual(arena.obs(false),before,`legacy alias ${index}`);
  assert.notEqual(arena.obs(true)[index],expanded[index],`physical difference ${index}`);
 }
});

test('a response lost at timeout is cancelled rather than rewarded as an executed action',async()=>{
 const calls=[];
 const host={call:async(m)=>{calls.push(m);return m.op==='tick'?{action:[0],decisionId:1}:{ };}};
 const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:140});
 const result=await arena.run({arm:'published',host,latency:800,maxMs:100});
 assert.equal(result.decisions,0);
 assert.equal(result.discardedResponses,1);
 assert.deepEqual(calls.map(c=>c.op),['tick','cancel']);
});

test('shared owner attack preserves food damage, cooldown and authoritative weapon event', async () => {
 const {WEAPONS,damage}=await import('../../web/js/game/adventure.js');
 const a=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
 const events=[];a.game.effect=(_p,kind,data)=>events.push({kind,...data});
 a.s.foodUntil=a.now+1000;const before=a.m.hp,w=WEAPONS[a.s.equipment.weapon];
 await a.game.ownerAttack(a.p,a.s,a.m,a.now);
 assert.equal(before-a.m.hp,Math.min(before,damage(w.attackPower+a.s.stats.attack+3,1)));
 assert.equal(a.s.cooldowns.attack,a.now+1000/w.attackSpeed);
 assert.deepEqual(events.at(-1),{kind:'hit',targetId:'enemy',weaponType:'sword'});
 const hp=a.m.hp;await a.game.ownerAttack(a.p,a.s,a.m,a.now);assert.equal(a.m.hp,hp);
});
test('shared poison preserves two damage, two second spacing, death recovery and presentation',async()=>{
 const a=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
 const events=[];a.game.effect=(_p,kind,data)=>events.push({kind,...data});
 a.s.hp=10;a.s.poisonUntil=a.now+6000;await a.game.advancePoison(a.p,a.s,a.now);
 assert.equal(a.s.hp,8);assert.equal(a.s.nextPoisonAt,a.now+2000);
 assert.equal(a.s.outcome.ownerDamage,2);assert.equal(a.s.ownerDamage,2);
 assert.deepEqual(events,[{kind:'mob-hit',amount:2,poison:true}]);
 await a.game.advancePoison(a.p,a.s,a.now+1000);assert.equal(a.s.hp,8);
 a.s.hp=1;await a.game.advancePoison(a.p,a.s,a.now+2000);
 assert.equal(a.s.outcome.ownerDefeated,true);assert.equal(a.s.hp,a.s.stats.maxHp);
 assert.equal(a.s.poisonUntil,0);assert.equal(a.p.roomId,'town');
});
test('shared enemy attacks preserve guard, armor, exhaustion and presentation payloads',async()=>{
 const {damage}=await import('../../web/js/game/adventure.js');
 for(const pet of [false,true]){
  const a=new ServerArena({...scenario(1000,0),type:'boar',geometry:'open',distance:40,pressure:pet?'pet':'owner'});
  const events=[];a.game.effect=(_p,kind,data)=>events.push({kind,...data});
  a.s.ownerGuardUntil=a.now+1800;a.s.petGuardUntil=a.now+1800;a.s.shieldUntil=a.now+1000;
  const expected=damage(a.m.damage,pet?2:a.s.stats.defense+8,.4);
  if(pet)a.s.petHp=1;const before=pet?a.s.petHp:a.s.hp;
  await a.advanceEnemies(a.now,.4);
  assert.equal(pet?a.s.petHp:a.s.hp,Math.max(0,before-expected));
  assert.equal(a.m.attackAt,a.now+1600);
  assert.equal(a.s.outcome.protection,Math.max(0,a.m.damage-expected));
  assert.deepEqual(events.at(-1),{kind:'mob-hit',targetId:'enemy',pet,amount:expected,defended:true,defeated:pet});
  if(pet){assert.equal(a.p.companion.state,'EXHAUSTED');assert.equal(a.s.outcome.petExhausted,true);}
 }
});
test('canonical pet guard/attack/special and victory events survive the shared refactor',async()=>{
 const a=new ServerArena({...scenario(1000,0),geometry:'open',distance:40,cooldown:0});
 const events=[];a.game.effect=(_p,kind,data)=>events.push({kind,...data});
 for(const action of ['DEFEND_OWNER','DEFEND_SELF','ATTACK','USE_SPECIAL'])await a.game.petAction(a.p,a.s,a.m,action);
 assert.ok(events.some(e=>e.kind==='defend'&&e.owner));
 assert.ok(events.some(e=>e.kind==='defend'&&!e.owner));
 assert.ok(events.some(e=>e.kind==='pet-hit'));
 assert.ok(events.some(e=>e.kind==='pet-special'));
 await a.game.hit(a.p,a.s,a.m,9999);
 assert.equal(a.m.state,'DEAD');assert.equal(a.s.outcome.victory,true);assert.equal(a.s.target,null);
 assert.equal(events.at(-1).kind,'victory');
});
