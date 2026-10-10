import test from 'node:test';
import assert from 'node:assert/strict';
import {AdventureService} from '../../server/adventure/service.mjs';
import {ServerArena,scenario} from '../../sim/server_battle.mjs';

function fixture() {
  const service={now:()=>1000,pool:{}};
  const game=new AdventureService(service,{brains:{close(){}}});
  const p={userId:'spawn-owner',room:'yard-1',roomId:'yard',x:450,y:330,
    companion:{id:'spawn-pet',x:450,y:330}};
  game.multiplayer={store:{players:new Map([[p.userId,p]]),rooms:new Map([[p.room,{players:new Map([[p.userId,p]])}]])}};
  const room=game.instance(p),m=[...room.mobs.values()][0];
  const s={hp:100,petHp:80,target:m.id};
  const e=game.executionContext(p,s,m);
  return {game,p,s,m,e,room};
}

test('actual instance spawns are live execution owners despite distinct slot and mob identities',()=>{
  const {game,m,e,room}=fixture();
  assert.notEqual(m.spawnKey,m.id);
  assert.equal(room.mobs.get(m.spawnKey),m);
  assert.equal(room.mobs.has(m.id),false);
  assert.equal(game.executionLive(e),true);
});

test('a replaced actual spawn cannot inherit the old encounter execution ownership',()=>{
  const {game,p,s,m,e,room}=fixture();
  m.hp=0;m.respawnAt=0;
  game.instance(p);
  const replacement=room.mobs.get(m.spawnKey);
  assert.notEqual(replacement,m);
  assert.notEqual(replacement.id,m.id);
  m.hp=m.maxHp; // Isolate ownership from the separate target-death check.
  assert.equal(game.executionLive(e),false);
  game.encounters.delete(p.userId);s.target=replacement.id;
  assert.equal(game.executionLive(game.executionContext(p,s,replacement)),true);
});

test('removing an actual spawn slot invalidates the outstanding encounter',()=>{
  const {game,m,e,room}=fixture();
  room.mobs.delete(m.spawnKey);
  assert.equal(game.executionLive(e),false);
});

test('actual spawned dummy survives a full tick as the selected live motor owner',async()=>{
  const {game,p,s,m,room}=fixture(),receipts=[],published=[];
  const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
  Object.assign(s,structuredClone(arena.s),{activePet:p.companion.id,target:m.id,
    petDecisionAt:0,savedAt:1000,inBattle:false});
  p.x=m.x-40;p.y=m.y;p.companion.x=m.x-60;p.companion.y=m.y;
  p.companion.profile={variant:'Moon Mochi'};
  m.hp=m.maxHp=10000;
  game.states.set(p.userId,s);game.save=async()=>{};
  game.multiplayer.send=()=>{};
  game.multiplayer.broadcast=(_room,type,data)=>published.push({type,data});
  game.brains={decide:async(_id,_user,_obs,_reward,options)=>{
    if(options.execution){receipts.push(options.execution);return {};}
    if(options.finish){receipts.push('finish');return {};}
    return {action:'DEFEND_OWNER',version:1};
  }};
  await game.tick();
  assert.deepEqual(receipts,['ack']);
  assert.equal(s.target,m.id);
  assert.equal(s.inBattle,true);
  assert.equal(s.battleExecution,null);
  assert.equal(p.companion.state,'DEFENDING');
  const frame=published.find(e=>e.type==='adventureRoom').data;
  assert.equal(frame.roomId,'yard');
  assert.equal(frame.mobs[0].id,room.mobs.get(m.spawnKey).id);
  assert.equal(frame.mobs[0].name,'Practice Dummy');
});
