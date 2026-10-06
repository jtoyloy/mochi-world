import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionArena, MOTOR_V1, MOTOR_V2, shapedReward, curriculum } from '../../sim/action_learning.mjs';
import { scenario } from '../../sim/server_battle.mjs';
import { BATTLE_ACTIONS } from '../../web/js/game/adventure.js';
const arena=(arm='affordance')=>new ActionArena({...scenario(7000,0),geometry:'open',distance:140,jitter:0,cooldown:0},{arm});
test('minimal affordances encode range and cooldown boundaries without action masking',()=>{
 const a=arena(),p=a.p.companion;a.m.x=p.x+100;a.m.y=p.y;
 assert.equal(a.obs().length,19);assert.equal(a.obs()[16],1);
 a.m.x+=.001;assert.equal(a.obs()[16],0);
 a.m.x=p.x+80;a.s.petSpecialAt=a.now;assert.equal(a.obs()[17],1);
 a.s.petSpecialAt=a.now+1;assert.equal(a.obs()[17],0);
 assert.equal(new ActionArena(a.config,{arm:'expanded_affordance'}).obs().length,29);
 assert.deepEqual(BATTLE_ACTIONS,['ATTACK','DEFEND_OWNER','DEFEND_SELF','USE_SPECIAL','MOVE_CLOSER','MOVE_AWAY','WAIT']);
});
test('failed attack remains failed attack and does not install approach',async()=>{
 const a=arena('persistent');a.obs();await a.execute({action:0,id:1,at:a.now,enemy:{...a.m},pet:{...a.p.companion},valid:false},null,false);
 assert.equal(a.metrics.invalidAttack,1);assert.equal(a.motor,undefined);assert.deepEqual(a.p.companion.motorPath,[]);
 assert.ok(a.metrics.decisionDetails[0].execution.reasons.includes('out-of-range'));
});
test('versioned approach stops in range, at target change, duration, next choice and path failure',async()=>{
 for(const reason of ['in-range','target-changed','duration','next-decision','path-failure']){
  const a=arena('persistent');assert.equal(a.body,MOTOR_V2);a.obs();
  await a.game.petAction(a.p,a.s,a.m,'MOVE_CLOSER');assert.ok(a.motor);
  if(reason==='in-range'){for(let i=0;i<15&&a.motor;i++){a.now+=100;await a.motion();}}
  if(reason==='target-changed'){a.m.x+=41;await a.motion();}
  if(reason==='duration'){a.now+=2800;await a.motion();}
  if(reason==='next-decision')a.stopMotor(reason);
  if(reason==='path-failure'){a.p.companion.motorPath=[{x:-100,y:-100}];await a.motion();}
  assert.equal(a.motor,null,reason);assert.equal(a.metrics.motorStops[reason],1);
 }
 assert.equal(arena('published').body,MOTOR_V1);
});
test('path availability, already-close and tether are physical descriptions',()=>{
 const a=arena('persistent');assert.ok(a.approachPath());a.m.x=-100;assert.equal(a.approachPath(),null);assert.equal(a.physical(4).executable,false);
 const b=arena();b.m.x=b.p.companion.x+40;b.m.y=b.p.companion.y;assert.equal(b.physical(4).alreadyClose,true);assert.equal(b.physical(4).executable,true);assert.equal(b.obs()[18],0);
});
test('bounded executed-invalid penalty and curriculum leave evaluation config untouched',()=>{
 assert.equal(shapedReward(-.9,1),-1);assert.equal(shapedReward(.5,0),.5);assert.equal(shapedReward(-.08,1),-.32);
 const c=scenario(9000,1,'evaluation'),copy=structuredClone(c);for(let i=0;i<60;i++)curriculum(c,i);assert.deepEqual(c,copy);
});
test('published observation and random combat reproduce unmodified server driver',async()=>{
 const {ServerArena}=await import('../../sim/server_battle.mjs');
 const c=scenario(6999,4,'evaluation');
 const baseline=await new ServerArena(c).run({arm:'random'});
 const measured=await new ActionArena(c,{arm:'random'}).run({arm:'random'});
 for(const key of Object.keys(baseline))assert.deepEqual(measured[key],baseline[key],key);
});
test('next Cadence decision cancels persistent motor; an invalid chosen attack is not substituted',async()=>{
 const a=arena('persistent');await a.game.petAction(a.p,a.s,a.m,'MOVE_CLOSER');
 let decision=0;
 const host={call:async m=>m.op==='tick'?{action:[0],decisionId:++decision,refused:false,policy:[[1,0,0,0,0,0,0]]}:{}};
 await a.run({arm:'persistent',host,maxMs:100,latency:0});
 assert.equal(a.metrics.motorStops['next-decision'],1);assert.equal(a.metrics.approaches,0);assert.equal(a.metrics.invalidAttack,1);assert.equal(a.motor,null);
});
test('special range and cooldown accept equality and reject immediately beyond boundary',async()=>{
 const {petBattleAbility}=await import('../../server/adventure/service.mjs');
 for(const variant of ['Moonfox','Woodland Deer Mint']){
  const a=arena();a.p.companion.profile.variant=variant;const p=a.p.companion;
  a.m.x=p.x+petBattleAbility(p).range;a.m.y=p.y;a.s.petSpecialAt=a.now;
  assert.equal(a.physical(3).executable,true);a.m.x+=.001;assert.equal(a.physical(3).executable,false);
  a.m.x-=.001;a.s.petSpecialAt=a.now+1;assert.deepEqual(a.physical(3).reasons,['cooldown']);
 }
});
