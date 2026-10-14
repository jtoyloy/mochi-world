import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Multiplayer} from '../../server/social/multiplayer.mjs';

class Socket extends EventEmitter {
  readyState=1;
  bufferedAmount=0;
  sent=[];
  send(value){this.sent.push(JSON.parse(value));}
  close(code){this.code=code;this.readyState=3;this.emit('close');}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
  let now=1000,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const game=new Multiplayer({now:()=>now,world:{account:async()=>({username:'owner'})},avatars:{get:async()=>({})}});
  clearInterval(game.timer);clearInterval(game.speechTimer);
  game.persist=async()=>{};
  const joins=[];
  game.join=async(_p,room)=>{joins.push(room);if(room==='blocked')await pending;};
  const socket=new Socket();await game.connect(socket,'owner');
  const body=game.store.players.get('owner');
  const emit=(room='next',padding=0)=>socket.emit('message',Buffer.from(JSON.stringify({type:'joinRoom',data:{roomId:room,pad:'x'.repeat(padding)}})));
  return {game,socket,body,joins,emit,release,advance:()=>{now+=1000;}};
}

test('a blocked real handler cannot admit a thousand-message burst before the 25 per second limit',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');await flush();
    for(let i=0;i<999;i++)f.emit();
    assert.equal(f.socket.code,1008);
    assert.equal(f.game.store.players.has('owner'),false);
    assert.equal(f.body.ingress.entries.size,0);
    assert.equal(f.body.ingress.bytes,0);
    f.release();await flush();
    assert.deepEqual(f.joins,['blocked']);
  }finally{f.release();f.game.close();}
});

test('pending message budget bounds a blocked handler even across admitted rate windows',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');await flush();
    for(let i=0;i<31;i++){f.advance();f.emit();}
    const retained=[...f.body.ingress.entries];
    assert.equal(retained.length,32);
    f.advance();f.emit();
    assert.equal(f.socket.code,1013);
    assert.equal(f.body.ingress.entries.size,0);
    assert.ok(retained.every(entry=>entry.raw===null));
    f.release();await flush();
    assert.deepEqual(f.joins,['blocked']);
  }finally{f.release();f.game.close();}
});

test('compliant messages across admission windows can drain after a delayed handler without another rate charge',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');await flush();
    for(let i=0;i<15;i++)f.emit('first-'+i);
    f.advance();
    for(let i=0;i<15;i++)f.emit('second-'+i);
    assert.equal(f.body.ingress.entries.size,31);
    f.release();await flush();
    assert.equal(f.socket.code,undefined);
    assert.deepEqual(f.joins,['blocked',...Array.from({length:15},(_,i)=>'first-'+i),...Array.from({length:15},(_,i)=>'second-'+i)]);
    assert.equal(f.body.ingress.entries.size,0);
    assert.equal(f.body.ingress.bytes,0);
  }finally{f.release();f.game.close();}
});

test('direct handler calls cannot forge admission with booleans or client fields',async()=>{
  const f=await fixture();
  try{
    const message={type:'joinRoom',admitted:true,data:{roomId:'direct'}};
    for(let i=0;i<25;i++)await f.game.handle(f.body,message,true);
    await assert.rejects(f.game.handle(f.body,message,true),/Too many socket events/);
    assert.equal(f.socket.code,1008);
    assert.equal(f.joins.length,25);
  }finally{f.release();f.game.close();}
});

test('pending byte budget is enforced before scheduling and releases retained buffers',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');await flush();
    for(let i=0;i<20&&f.socket.readyState===1;i++){f.advance();f.emit('next',1900);}
    assert.equal(f.socket.code,1013);
    assert.equal(f.body.ingress.bytes,0);
    assert.equal(f.body.ingress.entries.size,0);
  }finally{f.release();await flush();f.game.close();}
});

test('admitted handlers preserve order, release budgets, and stale queued bodies cannot affect replacements',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');f.emit('next');await flush();
    assert.deepEqual(f.joins,['blocked']);
    f.release();await flush();
    assert.deepEqual(f.joins,['blocked','next']);
    assert.equal(f.body.ingress.entries.size,0);
    assert.equal(f.body.ingress.bytes,0);
    f.emit('old-queued');
    const replacement=new Socket();await f.game.connect(replacement,'owner');
    const current=f.game.store.players.get('owner');
    f.socket.emit('message',Buffer.from('{'));
    f.socket.emit('close');await flush();
    assert.equal(f.game.store.players.get('owner'),current);
    assert.equal(replacement.code,undefined);
    assert.equal(replacement.sent.some(m=>m.type==='error'),false);
  }finally{f.release();f.game.close();}
});

test('replacing a blocked body discards its queued work without disconnecting the new body',async()=>{
  const f=await fixture();
  try{
    f.emit('blocked');await flush();f.emit('stale-queued');
    const retained=[...f.body.ingress.entries];
    const replacement=new Socket();await f.game.connect(replacement,'owner');
    const current=f.game.store.players.get('owner');
    assert.notEqual(current,f.body);
    assert.ok(retained.every(entry=>entry.raw===null));
    f.release();await flush();
    f.socket.emit('close');await flush();
    assert.deepEqual(f.joins,['blocked']);
    assert.equal(f.body.ingress.bytes,0);
    assert.equal(f.body.ingress.entries.size,0);
    assert.equal(f.game.store.players.get('owner'),current);
    assert.equal(replacement.readyState,1);
  }finally{f.release();f.game.close();}
});

test('parse failures release admission budgets and oversized direct messages close immediately',async()=>{
  const f=await fixture();
  try{
    f.socket.emit('message',Buffer.from('{'));await flush();
    assert.equal(f.body.ingress.bytes,0);
    assert.equal(f.body.ingress.entries.size,0);
    assert.equal(f.socket.sent.filter(m=>m.type==='error').length,1);
    f.emit('valid');await flush();
    assert.deepEqual(f.joins,['valid']);
    f.socket.emit('message',Buffer.alloc(2049));
    assert.equal(f.socket.code,1009);
    assert.equal(f.body.ingress.entries.size,0);
  }finally{f.release();f.game.close();}
});
