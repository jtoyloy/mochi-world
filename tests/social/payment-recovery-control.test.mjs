import test from 'node:test';
import assert from 'node:assert/strict';
import {TokenService} from '../../server/social/tokens.mjs';
import {InventoryCapacityError} from '../../server/world/service.mjs';

// A transactional state double exercises the production state transitions;
// PostgreSQL constraints and lock races are covered by the separate DB fixture.
function fixture(status='pending') {
  const env={now:1000000,failDelivery:true,verified:0,state:{inventory:0,proof:null,intent:{
    id:'intent-one',user_id:'owner',type:'npc_purchase',mint:'mint',decimals:6,amount_raw:'20000000',
    sender:'sender',recipient:'recipient',created_at:new Date(900000),expires_at:new Date(1200000),
    status,signature:null,data:{itemId:'small-potion',quantity:1,shopId:null,listingId:null,sellerId:null,paymentNamespace:{mode:'real',network:'devnet',mint:'mint',decimals:6}},
  }}};
  const result=rows=>({rows:rows.map(row=>structuredClone(row)),rowCount:rows.length});
  const query=async(state,sql,args=[])=>{
    if(sql.startsWith('SELECT * FROM token_payment_receipts'))
      return result(state.proof&&state.proof.intent_id===args[0]&&(!args[1]||state.proof.user_id===args[1])?[state.proof]:[]);
    if(sql.startsWith('SELECT * FROM token_payment_intents'))
      return result(state.intent.id===args[0]&&(!args[1]||state.intent.user_id===args[1])?[state.intent]:[]);
    if(sql.startsWith('SELECT 1 FROM token_payment_intents WHERE signature'))return result(state.intent.signature===args[0]?[{exists:1}]:[]);
    if(sql.startsWith('SELECT status FROM token_payment_intents'))return result(['verified','reconciliation_pending'].includes(state.intent.status)?[{status:state.intent.status}]:[]);
    if(sql.startsWith('INSERT INTO token_payment_receipts')){
      state.proof={intent_id:args[0],user_id:args[1],signature:args[2],canonical_intent:args[3],verified_at:args[4],reservation_held:args[5],verification_namespace:args[6]};return result([state.proof]);
    }
    if(sql.startsWith("UPDATE token_payment_intents SET status='expired'"))return result([]);
    if(sql.startsWith("UPDATE token_payment_intents SET status='failed'"))return result([]);
    if(sql.startsWith('UPDATE token_payment_intents SET status=$2')){state.intent.status=args[1];return result([]);}
    if(sql.startsWith("UPDATE token_payment_intents SET status='confirmed'")){state.intent.status='confirmed';state.intent.signature=args[1];return result([]);}
    if(sql.startsWith('DELETE FROM listing_reservations'))return result([]);
    throw Error('Unhandled fixture SQL: '+sql);
  };
  const world={pool:{query:(sql,args)=>query(env.state,sql,args)},
    transaction:async(_users,operation)=>{
      const draft=structuredClone(env.state),tx={state:draft,query:(sql,args)=>query(draft,sql,args)};
      const value=await operation(tx);env.state=draft;return value;
    },
    inventory:async(tx,_owner,_item,quantity)=>{if(env.failDelivery)throw env.failure??new InventoryCapacityError();tx.state.inventory+=quantity;},
    collector:async()=>{},event:async()=>{},
  };
  const config={mock:false,network:'devnet',mint:'mint',decimals:6,bps:null,fee:0};
  const service=(overrides={})=>{
    const tokens=new TokenService(world,{config:{...config,...overrides},now:()=>env.now,verifier:{verify:async()=>{env.verified++;}}});
    tokens.revenue=async()=>{};return tokens;
  };
  return {env,world,service,tokens:service()};
}

test('verified real payment survives delivery rollback, expiry, cancel and a new service instance',async()=>{
  const {env,world,service,tokens}=fixture();
  assert.equal((await tokens.fulfill('owner','intent-one','proof-one')).status,'verified');
  assert.equal(env.verified,1);assert.equal(env.state.intent.status,'verified');
  assert.equal(env.state.proof.signature,'proof-one');assert.equal(env.state.inventory,0);
  env.now+=600000;
  await world.transaction([],tx=>tokens.expire(tx));
  assert.equal((await tokens.cancel('owner','intent-one')).status,'verified');
  await assert.rejects(tokens.fulfill('owner','intent-one','different-proof'),/different verified payment/);
  for(const conflicting of ['',null])await assert.rejects(tokens.fulfill('owner','intent-one',conflicting),/different verified payment/);
  await assert.rejects(tokens.fulfill('other-owner','intent-one'),/not found/);
  env.failDelivery=false;
  assert.equal((await service().fulfill('owner','intent-one')).status,'confirmed');
  assert.equal(env.verified,1);assert.equal(env.state.inventory,1);
  await assert.rejects(tokens.fulfill('owner','intent-one'),/already fulfilled/);
  assert.equal(env.state.inventory,1);
});

for(const status of ['expired','failed'])test(`a first verified payment on ${status} checkout records owed reconciliation without creating an item`,async()=>{
  const {env,tokens}=fixture(status);env.failDelivery=false;
  assert.equal((await tokens.fulfill('owner','intent-one','late-proof')).status,'reconciliation_pending');
  assert.equal(env.state.proof.signature,'late-proof');assert.equal(env.state.proof.reservation_held,false);
  assert.equal(env.state.inventory,0);
  assert.equal((await tokens.fulfill('owner','intent-one')).status,'reconciliation_pending');
  assert.equal(env.verified,1);
});

test('a stored proof cannot authorize changed canonical checkout data',async()=>{
  const {env,tokens}=fixture();
  assert.equal((await tokens.fulfill('owner','intent-one','proof-one')).status,'verified');
  env.state.intent.data.quantity=2;env.failDelivery=false;
  await assert.rejects(tokens.fulfill('owner','intent-one'),/details differ/);
  assert.equal(env.state.inventory,0);assert.equal(env.verified,1);
});

test('malformed recovery cursors refuse before querying history',async()=>{
  const {tokens}=fixture();
  for(const after of ['!',Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({at:'not-date',id:'one'})).toString('base64url')])
    await assert.rejects(tokens.payments('owner',{after}),/Invalid checkout history cursor/);
});

test('known currency or network changes block before verification and preserve any prior proof',async()=>{
  const {env,service,tokens}=fixture();
  for(const change of [{mock:true},{network:'mainnet-beta'},{mint:'other-mint'},{decimals:9}])
    await assert.rejects(service(change).fulfill('owner','intent-one','proof-one'),/currency configuration differs/);
  assert.equal(env.verified,0);assert.equal(env.state.proof,null);
  assert.equal((await tokens.fulfill('owner','intent-one','proof-one')).status,'verified');
  await assert.rejects(service({network:'mainnet-beta'}).fulfill('owner','intent-one'),/currency configuration differs/);
  assert.equal(env.state.proof.signature,'proof-one');assert.equal(env.state.inventory,0);
});

test('legacy unbound real intent can retain verified evidence but cannot automatically deliver',async()=>{
  const {env,tokens}=fixture();delete env.state.intent.data.paymentNamespace;env.failDelivery=false;
  assert.equal((await tokens.fulfill('owner','intent-one','legacy-proof')).status,'reconciliation_pending');
  assert.equal(env.state.proof.verification_namespace.network,'devnet');
  assert.equal(env.state.inventory,0);assert.equal(env.verified,1);
});

test('unexpected delivery errors still throw while the previously committed proof survives',async()=>{
  const {env,tokens}=fixture();env.failure=new Error('database write failed');
  await assert.rejects(tokens.fulfill('owner','intent-one','proof-one'),/database write failed/);
  assert.equal(env.state.intent.status,'verified');assert.equal(env.state.proof.signature,'proof-one');
  assert.equal(env.state.inventory,0);
});
