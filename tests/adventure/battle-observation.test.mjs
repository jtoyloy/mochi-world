import test from 'node:test';
import assert from 'node:assert/strict';
import {battleObservation,battleReward} from '../../web/js/game/adventure.js';
const s={hp:100,stats:{maxHp:100},petHp:80,enemyCount:1,ownerDamage:0,petDamage:0,damageDealt:0,now:10000};
const p={x:0,y:0};
const pet={x:0,y:0};
const mob={x:140,y:0,hp:45,maxHp:45,damage:5,type:'slime'};
test('battle senses preserve distance and health changes without saturation below 400',()=>{
 const before=battleObservation(s,p,mob,pet);
 const after=battleObservation(s,p,{...mob,x:75,hp:37},pet);
 assert.ok(Math.abs(before[3]-after[3]-65/400)<1e-12);
 assert.equal(after[2],37/45);
});
test('diagnostic: currently hidden physical states alias despite different consequences',()=>{
 const before=battleObservation(s,p,mob,pet);
 // A guard already covering the next hit and an owner outside enemy range
 // change the value of guarding, but neither fact reaches the current brain.
 assert.deepEqual(before,battleObservation({...s,ownerGuardUntil:11800},{x:350,y:0}, {...mob,attackAt:11600},pet));
 // Special range/guard differs between species while observation is identical.
 assert.deepEqual(before,battleObservation(s,p,mob,{...pet,profile:{variant:'forest'}}));
});
test('reward signs: damage helps, suffering and wasted actions hurt; guard-alone can earn positive reward',()=>{
 assert.ok(battleReward({damageDealt:8})>0);
 assert.ok(battleReward({ownerDamage:4})<0);
 assert.ok(battleReward({wasted:true})<0);
 assert.ok(battleReward({protection:3,ownerDamage:1})>0);
 assert.ok(battleReward({ownerDefeated:true})<0);
 assert.ok(battleReward({victory:true})>0);
});

test('executed MOVE_CLOSER installs a valid motor path rather than reporting wasted',async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const {validSegment}=await import('../../web/js/game/model.js');
 const actor={roomId:'yard',x:400,y:400,companion:{x:400,y:400}};
 const enemy={x:600,y:400};
 assert.ok(validSegment('yard',400,400,465,400));
 const state={petHp:80,outcome:{}};
 const service={service:{now:()=>10000},effect(){}};
 await AdventureService.prototype.petAction.call(service,actor,state,enemy,'MOVE_CLOSER');
 assert.deepEqual(actor.companion.motorPath,[{x:465,y:400}]);
 assert.ok(!state.outcome.wasted);
});

test('guard persists across the next decision boundary and can delay its consequence',async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const actor={roomId:'yard',x:400,y:400,companion:{x:400,y:400}};
 const state={petHp:80,outcome:{}};
 const effects=[];
 const service={service:{now:()=>10000},effect:(p,kind,data)=>effects.push({kind,...data})};
 await AdventureService.prototype.petAction.call(service,actor,state,{x:450,y:400},'DEFEND_OWNER');
 assert.equal(state.ownerGuardUntil,11800);
 assert.deepEqual(effects,[{kind:'defend',pet:true,owner:true}]);
 await AdventureService.prototype.petAction.call(service,actor,state,{x:450,y:400},'WAIT');
 assert.ok(state.ownerGuardUntil>11400); // survives the following decision's start
 assert.ok(state.ownerGuardUntil<12800); // not two complete decision windows
});

test('execution rechecks range after observation; a previously valid attack becomes wasted',async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const actor={roomId:'yard',x:400,y:400,companion:{x:400,y:400}};
 const enemy={...mob,x:480,y:400};
 const state={...s,petHp:80,outcome:{}};
 assert.equal(battleObservation(state,actor,enemy,actor.companion)[3],.2);
 enemy.x=600; // enemy state changes while a decision is awaited
 await AdventureService.prototype.petAction.call({service:{now:()=>10000}},actor,state,enemy,'ATTACK');
 assert.equal(state.outcome.wasted,true);
});

test('integrated mob chase and return advance on clear ground', async () => {
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const a=new AdventureService({pool:{},now:()=>10000},{brains:{},rewards:{}});
 const owner={userId:'owner',x:600,y:400};
 const enemy={id:'enemy',hp:45,x:400,y:400,home:{x:400,y:400},speed:100,range:40,behavior:'aggressive',target:'owner'};
 const occupants=new Map([['owner',owner]]);
 a.multiplayer={store:{rooms:new Map([['yard-test',{players:occupants}]]),players:new Map()},broadcast(){}};
 a.instances.set('yard-test',{roomId:'yard',mobs:new Map([['enemy',enemy]])});
 a.state=async()=>({hp:100});
 a.publicRoom=()=>({});
 a.tickAt=9900;
 await a.tick();
 assert.equal(enemy.state,'CHASE');
 assert.equal(enemy.x,410);
 occupants.clear();
 enemy.x=500;
 a.tickAt=9900;
 await a.tick();
 assert.equal(enemy.state,'RETURN');
 assert.equal(enemy.x,490);
});
