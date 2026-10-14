import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Multiplayer} from '../../server/social/multiplayer.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Socket extends EventEmitter {
  readyState=1;bufferedAmount=0;destroyed=false;writes=[];
  send(){}
  write(value){this.writes.push(value);}
  end(value){this.write(value);this.emit('finish');}
  destroy(){this.destroyed=true;this.readyState=3;this.emit('close');}
  close(code){this.code=code;this.destroy();}
}
function fixture({authenticate=async()=> 'owner',account=async()=>({username:'owner'}),avatar=async()=>({})}={}){
  const server=new EventEmitter();
  const counts=new Map();
  const metrics={count:(key,value=1)=>counts.set(key,(counts.get(key)??0)+value)};
  const game=new Multiplayer({server,authenticate,world:{account},avatars:{get:avatar},metrics});
  clearInterval(game.timer);clearInterval(game.speechTimer);
  game.persist=async()=>{};
  const upgrade=(closed=false)=>{const socket=new Socket();if(closed)socket.destroy();server.emit('upgrade',{url:'/socket',headers:{host:'localhost',origin:'http://localhost'}},socket,Buffer.alloc(0));return socket;};
  return {game,upgrade,counts};
}

test('an already closed upgrade does no authentication or setup work',async()=>{
  let auth=0;
  const f=fixture({authenticate:async()=>{auth++;return 'owner';}});
  try{
    f.upgrade(true);await flush();
    assert.equal(auth,0);assert.equal(f.game.pendingSetups,0);
  }finally{f.game.close();}
});

test('setup admission rejects excess before authentication and retains timed-out slots until auth settles',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=deferred();let auth=0,accounts=0;
  const f=fixture({authenticate:()=>{auth++;return pending.promise;},account:async()=>{accounts++;return {};}});
  try{
    const sockets=Array.from({length:64},()=>f.upgrade());
    assert.equal(auth,32);
    assert.equal(sockets.filter(s=>s.destroyed).length,32);
    assert.equal(f.game.pendingSetups,32);
    assert.equal(f.counts.get('socketSetupRefusals'),32);
    t.mock.timers.tick(30000);
    assert.equal(sockets.every(s=>s.destroyed),true);
    assert.equal(f.counts.get('socketSetupTimeouts'),32);
    f.upgrade();assert.equal(auth,32);
    assert.equal(f.game.pendingSetups,32,'closing sockets cannot reset uncancellable work slots');
    pending.resolve('owner');await flush();
    assert.equal(f.game.pendingSetups,0);
    assert.equal(accounts,0);
  }finally{pending.resolve('owner');await flush();f.game.close();}
});

test('setup slots cover connect reads and closed avatar waits cannot trigger session rereads',async()=>{
  const pending=deferred();let auth=0,avatars=0;
  const f=fixture({authenticate:async()=>{auth++;return 'owner';},avatar:()=>{avatars++;return pending.promise;}});
  const clients=[];
  f.game.wss.handleUpgrade=(_req,_socket,_head,callback)=>{const ws=new Socket();clients.push(ws);callback(ws);};
  try{
    for(let i=0;i<32;i++)f.upgrade();await flush();
    assert.equal(avatars,32);assert.equal(f.game.pendingSetups,32);
    const excess=f.upgrade();assert.equal(excess.destroyed,true);assert.equal(auth,32);
    clients.forEach(ws=>ws.close());
    pending.resolve({});await flush();
    assert.equal(auth,32,'closed clients do not revalidate sessions after avatar resolves');
    assert.equal(f.game.pendingSetups,0);
    assert.equal(f.game.store.players.size,0);
  }finally{pending.resolve({});await flush();f.game.close();}
});

test('an upgraded setup deadline closes both transports while retaining its outstanding avatar slot',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=deferred();let auth=0;
  const f=fixture({authenticate:async()=>{auth++;return 'owner';},avatar:()=>pending.promise});
  const client=new Socket();
  f.game.wss.handleUpgrade=(_req,_socket,_head,callback)=>callback(client);
  try{
    const raw=f.upgrade();await flush();
    assert.equal(f.game.pendingSetups,1);
    t.mock.timers.tick(30000);
    assert.equal(client.code,1013);assert.equal(raw.destroyed,true);
    assert.equal(f.game.pendingSetups,1);
    pending.resolve({});await flush();
    assert.equal(f.game.pendingSetups,0);assert.equal(auth,1);
    assert.equal(f.game.store.players.size,0);
    assert.equal(f.counts.get('socketSetupTimeouts'),1);
  }finally{pending.resolve({});await flush();f.game.close();}
});

test('closed direct connects stop after the outstanding account read',async()=>{
  const pending=deferred();let avatars=0,revalidations=0;
  const f=fixture({account:()=>pending.promise,avatar:async()=>{avatars++;return {};}});
  const sockets=Array.from({length:32},()=>new Socket());
  try{
    const connecting=sockets.map(ws=>{ws.revalidateSession=async()=>{revalidations++;return 'owner';};return f.game.connect(ws,'owner');});
    sockets.forEach(ws=>ws.close());pending.resolve({username:'owner'});
    await Promise.all(connecting);
    assert.equal(avatars,0);assert.equal(revalidations,0);
    assert.equal(f.game.store.players.size,0);
  }finally{pending.resolve({username:'owner'});f.game.close();}
});

test('the setup slot remains held through session revalidation and releases after successful registration',async()=>{
  const pending=deferred();let calls=0;
  const f=fixture({authenticate:()=>++calls===1?Promise.resolve('owner'):pending.promise});
  const client=new Socket();
  f.game.wss.handleUpgrade=(_req,_socket,_head,callback)=>callback(client);
  try{
    f.upgrade();await flush();
    assert.equal(calls,2);assert.equal(f.game.pendingSetups,1);
    assert.equal(f.game.store.players.size,0);
    pending.resolve('owner');await flush();
    assert.equal(f.game.pendingSetups,0);
    assert.equal(f.game.store.players.get('owner').ws,client);
  }finally{pending.resolve('owner');await flush();f.game.close();}
});

test('failed upgrades and missing synchronous callbacks release their setup slots',async()=>{
  const f=fixture();
  try{
    const malformed=f.upgrade();await flush();
    assert.equal(f.game.pendingSetups,0);
    assert.equal(malformed.destroyed,true);
    assert.match(malformed.writes.join(''),/405/);
    f.game.wss.handleUpgrade=()=>{};
    const noCallback=f.upgrade();await flush();
    assert.equal(f.game.pendingSetups,0);assert.equal(noCallback.destroyed,true);
    f.game.wss.handleUpgrade=()=>{throw new Error('bad handshake');};
    const failed=f.upgrade();await flush();
    assert.equal(f.game.pendingSetups,0);assert.equal(failed.destroyed,true);
  }finally{f.game.close();}
});
