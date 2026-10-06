import test from 'node:test';
import assert from 'node:assert/strict';
import { Multiplayer } from '../../server/social/multiplayer.mjs';
import { movementState, interestTier } from '../../server/social/snapshots.mjs';
import { SnapshotDecoder } from '../../web/js/game/network/snapshots.js';
import { SnapshotBuffer } from '../../web/js/game/locomotion/core.js';
const actor = (id,x=400,y=400) => ({userId:id,username:id,room:'yard-1',roomId:'yard',x,y,lastSeen:1000,companion:{id:'pet-'+id,name:'Pet',profile:{variant:'Moonfox'},equipment:{hat:'hat'},x:x-95,y:y+40,state:'FOLLOWING'},ws:{readyState:1,bufferedAmount:0,send(){},close(){}}});
function fixture() {
 let now=1000; const counts={}; const m=new Multiplayer({now:()=>now,metrics:{count:(k,n=1)=>counts[k]=(counts[k]??0)+n,time(){}}});
 const a=actor('a'), b=actor('b',600), wire=[]; a.ws.send=s=>wire.push(JSON.parse(s));
 m.store.players.set('a',a); m.store.players.set('b',b);
 m.store.rooms.set(a.room,{id:a.room,players:new Map([['a',a],['b',b]])});
 return {m,a,b,wire,counts,time:t=>now=t};
}
test('batched deltas reconstruct identities, companion cosmetics, removal and ordered room transitions',()=>{
 const f=fixture(), decoder=new SnapshotDecoder();
 decoder.consume({type:'roomSnapshot',data:{instanceId:'yard-1',players:[f.m.public(f.a),f.m.public(f.b)]}});
 try {
  f.m.snapshots.tick(f.m,1000);
  const first=f.wire.at(-1); assert.equal(first.type,'movementSnapshot');
  assert.equal(JSON.stringify(first).includes('profile'),false);
  assert.equal(JSON.stringify(first).includes('hat'),false);
  decoder.consume(first);
  f.b.x+=10; f.b.companion.x+=9;
  f.m.snapshots.tick(f.m,1100);
  const update=f.wire.at(-1); const p=decoder.consume(update).find(e=>e.data.userId==='b').data;
  assert.equal(p.x,610); assert.equal(p.companion.x,514); assert.equal(p.companion.profile.variant,'Moonfox'); assert.equal(p.companion.equipment.hat,'hat');
  assert.equal(update.data.players.find(p=>p.userId==='b').companion.name,undefined);
  assert.deepEqual(decoder.consume(first),[]);
  decoder.consume({type:'playerLeft',data:{userId:'b'}});
  assert.equal(decoder.players.has('b'),false);
  decoder.consume({type:'roomSnapshot',data:{instanceId:'cafe-1',players:[]}});
  assert.deepEqual(decoder.consume(update),[]);
 } finally {f.m.close();}
});
test('interest has padded projected bounds, hysteresis and no boundary despawns',()=>{
 const viewer=actor('v',0,0); viewer.view={halfWidth:400,halfHeight:250};
 const other=actor('o',420,-420); // projected dx=604.8: between enter/exit edges
 assert.equal(interestTier(viewer,other,'near'),'near');
 assert.equal(interestTier(viewer,other,'mid'),'mid');
 assert.equal(interestTier(viewer,actor('far',2500,-2500)),'far');
 const f=fixture(); f.b.x=3000;f.b.y=-3000;
 try {f.m.snapshots.tick(f.m,1000); assert.equal(f.wire.at(-1).data.players.length,2);assert.equal(f.wire.at(-1).data.removed,undefined);}
 finally {f.m.close();}
});
test('stationary state is suppressed, stops are immediate, path is owner-only',()=>{
 const f=fixture();
 try {
  f.a.target={x:750,y:400}; f.a.path=[]; f.b.target={x:800,y:400};f.b.path=[];
  f.m.snapshots.tick(f.m,1000); let packet=f.wire.at(-1);
  assert.ok(packet.data.players.find(p=>p.userId==='a').path);
  assert.equal(packet.data.players.find(p=>p.userId==='b').path,undefined);
  const count=f.wire.length;
  f.m.snapshots.tick(f.m,1100);assert.equal(f.wire.length,count);
  f.b.target=null;f.m.snapshots.tick(f.m,1101);
  assert.equal(f.wire.at(-1).data.players.find(p=>p.userId==='b').moving,false);
 } finally {f.m.close();}
});
test('critical events queue FIFO and movement coalesces without advancing delta base',()=>{
 const f=fixture(); f.a.ws.bufferedAmount=210000;
 try {
  f.m.send(f.a,'combatEffect',{seq:1,kind:'hit'});f.m.send(f.a,'adventureResult',{accepted:true});
  f.m.snapshots.tick(f.m,1000); f.b.x+=30;f.m.snapshots.tick(f.m,1100);
  assert.equal(f.wire.length,0);assert.equal(f.a.outbox.length,2);
  f.a.ws.bufferedAmount=0;f.time(1200);f.m.snapshots.tick(f.m,1200);
  assert.deepEqual(f.wire.slice(0,2).map(e=>e.type),['combatEffect','adventureResult']);
  assert.equal(f.wire.at(-1).data.players.find(p=>p.userId==='b').x,630);
  assert.equal(f.a.outboxBytes,0);assert.ok(f.counts.coalescedMovementSnapshots>=2);
 } finally {f.m.close();}
});
test('critical queue is bounded and persistent slow sockets close explicitly',()=>{
 const f=fixture();f.a.ws.bufferedAmount=210000;const closed=[];f.a.ws.close=(...args)=>closed.push(args);
 try {
  for(let i=0;i<300;i++)f.m.send(f.a,'combatEffect',{seq:i});
  assert.equal(closed[0][0],1013);assert.equal(f.a.outboxBytes,0);assert.equal(f.a.deliveryClosed,true);
  assert.equal(f.counts.criticalEventsAwaitingResync,257);
  assert.equal(f.counts.closedSocketSkips,43);
  f.b.ws.bufferedAmount=210000;f.b.ws.close=(...args)=>closed.push(args);
  f.m.flush(f.b); f.time(6001);f.m.flush(f.b);
  assert.equal(closed.length,2);
 } finally {f.m.close();}
});
test('5 Hz remote interpolation remains continuous with tier delay',()=>{
 const buffer=new SnapshotBuffer(220);let previous,stationary=0,moving=0;
 for(let t=0;t<6000;t+=1000/60){
  if(Math.floor(t/200)>Math.floor((t-1000/60)/200)) {const at=Math.floor(t/200)*200; buffer.push({t:at,x:at*.18,y:400,moving:true},at);}
  const p=buffer.sample(t);
  if(t>600&&p&&previous){ moving++;if(Math.abs(p.x-previous.x)<.001)stationary++;assert.ok(p.x>=previous.x);}
  previous=p;
 }
 assert.equal(stationary,0);assert.ok(moving>300);
});
test('periodic dynamic keyframes repair an intentionally lost delta',()=>{
 const f=fixture(), decoder=new SnapshotDecoder();
 decoder.consume({type:'roomSnapshot',data:{instanceId:'yard-1',players:[f.m.public(f.a),f.m.public(f.b)]}});
 try {
  f.m.snapshots.tick(f.m,1000);decoder.consume(f.wire.at(-1));
  f.b.x=650;f.m.snapshots.tick(f.m,1100); // simulate developer packet loss
  f.b.y=420;f.m.snapshots.tick(f.m,1200);decoder.consume(f.wire.at(-1));
  assert.equal(decoder.players.get('b').x,400+200);
  f.m.snapshots.tick(f.m,2000);const packet=f.wire.at(-1);
  assert.equal(packet.data.keyframe,true);decoder.consume(packet);
  assert.equal(decoder.players.get('b').x,650);assert.equal(decoder.players.get('b').y,420);
  assert.equal(decoder.players.get('b').companion.name,'Pet');
 } finally {f.m.close();}
});
test('changing interest frequency retimes motion without a backward step',()=>{
 const buffer=new SnapshotBuffer(120);buffer.smoothDelay=true;let previous;
 for(let frame=0;frame<540;frame++){
  const t=frame*1000/60,interval=t<3000||t>=6000?100:200;
  if(frame%(interval===100?6:12)===0){buffer.baseDelay=interval+20;buffer.push({t,x:t*.18,y:400,moving:true},t);}
  const p=buffer.sample(t);
  if(t>600&&previous){assert.ok(p.x>previous.x,`stationary/backstep at ${t}`);assert.ok(p.x-previous.x<5,'tier-change jump');}
  previous=p;
 }
});
