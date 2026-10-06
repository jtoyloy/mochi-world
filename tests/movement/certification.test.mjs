import test from 'node:test';import assert from 'node:assert/strict';
import {ImpairedTransport} from '../../multiplayer/load-test/transport.mjs';
import {Multiplayer} from '../../server/social/multiplayer.mjs';
import {TOWN_INTERACTIONS} from '../../web/js/game/town.js';
import {roomSpec,walkable,validSegment} from '../../web/js/game/model.js';
test('Town authority keeps the logical range and records a legitimate rejection',async()=>{
 const local=TOWN_INTERACTIONS.find(p=>p.id==='fountain'),witness={x:600,y:700};
 assert.ok(walkable('town',witness.x,witness.y)); assert.ok(Math.hypot(witness.x-local.x,witness.y-local.y)>120);
 const traces=[],metrics={count(){},rejections:traces};
 const game=new Multiplayer({metrics,world:{},avatars:{},now:()=>10000});const p={...witness,room:'town-1',roomId:'town',userId:'fixture',ws:{readyState:1},lastSeen:0,windowAt:0,eventCount:0};
 try{await assert.rejects(game.handle(p,{type:'interact',data:{propId:'fountain',clientTime:9900}}),/Walk closer/);assert.equal(traces[0].interactionRadius,120);assert.deepEqual(traces[0].authoritative,{...witness,seated:null});assert.equal(traces[0].requestAgeMs,100);}finally{game.close();}
});
test('WAN retransmission model retains critical events in FIFO order',async()=>{
 const transport=new ImpairedTransport({rtt:10,jitter:10,loss:1,random:()=>.1});const got=[];
 await new Promise(resolve=>{for(let i=0;i<4;i++)transport.schedule('in',()=>{got.push(i);if(got.length===4)resolve();});});
 assert.deepEqual(got,[0,1,2,3]);assert.equal(transport.stats.lossStalls,4);transport.close();
});

test('continuous collision rejects the witnessed unsampled collider corner',()=>{
 const a={x:960,y:470},b={x:720,y:410};
 assert.ok(walkable('exchange',a.x,a.y)&&walkable('exchange',b.x,b.y));
 assert.equal(walkable('exchange',792,428),false);
 assert.equal(validSegment('exchange',a.x,a.y,b.x,b.y),false);
});
test('continuous segment respects open collider boundaries and closed fountain ellipse',()=>{
 assert.equal(validSegment('cafe',350,500,350,600),true); // circle tangent is walkable
 assert.equal(validSegment('cafe',349.9,500,349.9,600),false);
 assert.equal(validSegment('town',506,410,506,450),false); // fountain tangent is blocked
 assert.equal(validSegment('town',505.9,410,505.9,450),true);
 assert.equal(validSegment('cafe',350,550,350,550),true);
 assert.equal(validSegment('cafe',300,550,300,550),false);
});

test('an automatically recovered unexpected close remains an acceptance failure',async()=>{
 const {recordDisconnect}=await import('../../multiplayer/load-test/disconnects.mjs');
 const actor={disconnects:0,reconnects:0,selfId:'fixture'};
 recordDisconnect(actor,{},1006,Buffer.from('abnormal closure'),1000);
 actor.reconnects++; // the legacy subtraction would now report zero
 assert.equal(actor.unexpectedDisconnects,1);
 recordDisconnect(actor,{plannedClose:true},1000,Buffer.from(''),2000);
 assert.equal(actor.unexpectedDisconnects,1);assert.equal(actor.disconnectEvents[0].planned,false);assert.equal(actor.disconnectEvents[1].planned,true);
 recordDisconnect(actor,{plannedClose:true},1013,Buffer.from('slow client'),3000);assert.equal(actor.unexpectedDisconnects,2);
});
