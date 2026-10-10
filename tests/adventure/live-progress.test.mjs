import test from 'node:test';
import assert from 'node:assert/strict';
import {AdventureService} from '../../server/adventure/service.mjs';
import {ServerArena,scenario} from '../../sim/server_battle.mjs';

test('Trading Hall arrival publishes current authoritative progress on the same tick',async()=>{
  const game=new AdventureService({now:()=>1000,pool:{}},{brains:{close(){}}});
  const arena=new ServerArena({...scenario(1000,0),geometry:'open',distance:40});
  const p={...arena.p,userId:'progress-owner',room:'exchange-1',roomId:'exchange',companion:null};
  const s={...structuredClone(arena.s),activePet:null,target:null,inBattle:false,
    progress:{},quests:[],savedAt:1000};
  const published=[],saved=[];
  game.states.set(p.userId,s);
  game.multiplayer={store:{players:new Map([[p.userId,p]]),
    rooms:new Map([[p.room,{players:new Map([[p.userId,p]])}]])},
    send:(_p,type,data)=>published.push({type,data}),broadcast(){}};
  game.save=async(_user,state)=>saved.push(structuredClone(state));
  await game.tick();
  assert.equal(s.progress.tradingHall,1);
  assert.equal(saved[0].progress.tradingHall,1);
  const first=published.find(e=>e.type==='adventureState').data.player.progress;
  assert.deepEqual(first,{tradingHall:1});
  assert.notEqual(first,s.progress);
  first.tradingHall=999; // A delivered snapshot must not alias the authoritative state.
  assert.equal(s.progress.tradingHall,1);
  published.length=0;
  await game.tick();
  assert.deepEqual(published.find(e=>e.type==='adventureState').data.player.progress,{tradingHall:1});
  assert.equal(saved.length,1);
});
