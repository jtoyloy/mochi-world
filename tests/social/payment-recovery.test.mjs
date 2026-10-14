import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WorldService} from '../../server/world/service.mjs';
import {TokenService} from '../../server/social/tokens.mjs';
import {ITEMS,SHOPS} from '../../web/js/world/catalog.js';

const enabled=!!process.env.TEST_DATABASE_URL;
const check=(name,run)=>test(name,{skip:!enabled},run);
let pool,admin,schema,world;
let now=Date.parse('2026-10-14T12:00:00Z');
const config={mock:false,network:'devnet',mint:'configured-mint',decimals:6,bps:null,fee:0,treasury:'recipient'};
before(async()=>{
  if(!enabled)return;
  schema='payment_recovery_'+randomUUID().replaceAll('-','');
  admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  await admin.query('CREATE SCHEMA '+schema);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema,max:8});
  for(const file of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql'])await pool.query(await readFile(file,'utf8'));
  for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
  for(const shop of SHOPS)await pool.query('INSERT INTO shops(id,slug,data) VALUES($1,$2,$3)',[shop.id,shop.slug,shop]);
  await pool.query("INSERT INTO shop_stock(shop_id,item_id,quantity,price,cycle) VALUES('foods','sushi',100,20,1)");
  world=new WorldService(pool,{now:()=>now});
});
after(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}});
const account=()=>world.ensureUser('recover_'+randomUUID().replaceAll('-','').slice(0,16));
const tokens=(service=world,verify=async()=>{})=>new TokenService(service,{config,now:()=>now,verifier:{verify,balance:async()=>1000000000n}});
async function intent(owner,{id=randomUUID(),status='pending',listingId=null,sellerId=null,createdAt=new Date(now-1000),expiresAt=new Date(now+30000)}={}){
  const data={itemId:'sushi',quantity:1,shopId:listingId?null:'foods',listingId,sellerId,stockCycle:listingId?null:1,paymentNamespace:{mode:'real',network:config.network,mint:config.mint,decimals:config.decimals}};
  await pool.query("INSERT INTO token_payment_intents(id,user_id,type,mint,decimals,amount_raw,recipient,sender,status,expires_at,created_at,data) VALUES($1,$2,$3,$4,6,20000000,'recipient','sender',$5,$6,$7,$8)",[id,owner.id,listingId?'marketplace_purchase':'npc_purchase',config.mint,status,expiresAt,createdAt,data]);
  if(listingId)await pool.query('INSERT INTO listing_reservations(listing_id,intent_id,expires_at) VALUES($1,$2,$3)',[listingId,id,expiresAt]);
  else if(status==='pending')await pool.query("UPDATE shop_stock SET quantity=quantity-1 WHERE shop_id='foods' AND item_id='sushi'");
  return id;
}
const owned=async(owner)=>(await pool.query("SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='sushi' AND location='bag'",[owner.id])).rows[0]?.quantity??0;
const payment=async id=>(await pool.query('SELECT * FROM token_payment_intents WHERE id=$1',[id])).rows[0];
const receipt=async id=>(await pool.query('SELECT * FROM token_payment_receipts WHERE intent_id=$1',[id])).rows[0];

check('real payment proof commits before actual stack failure and survives restart, deadline, cancel and immutable migration replay',async()=>{
  const owner=await account(),other=await account(),id=await intent(owner);let verifications=0;
  const service=tokens(world,async()=>{verifications++;});
  await world.transaction([owner.id],tx=>world.inventory(tx,owner.id,'sushi',2147483647));
  const stockBefore=(await pool.query("SELECT quantity FROM shop_stock WHERE shop_id='foods' AND item_id='sushi'")).rows[0].quantity;
  assert.equal((await service.fulfill(owner.id,id,'paid-stack-proof')).status,'verified');
  assert.equal((await payment(id)).status,'verified');assert.equal((await receipt(id)).signature,'paid-stack-proof');
  assert.equal((await payment(id)).signature,null);assert.equal(await owned(owner),2147483647);
  await assert.rejects(service.fulfill(other.id,id),/not found/);
  await assert.rejects(service.fulfill(owner.id,id,'conflicting-proof'),/different verified payment/);
  now+=600000;await world.transaction([],tx=>service.expire(tx));
  assert.equal((await service.cancel(owner.id,id)).status,'verified');
  assert.equal((await payment(id)).status,'verified');
  assert.equal((await pool.query("SELECT quantity FROM shop_stock WHERE shop_id='foods' AND item_id='sushi'")).rows[0].quantity,stockBefore);
  for(const sql of ['UPDATE token_payment_receipts SET signature=signature WHERE intent_id=$1','DELETE FROM token_payment_receipts WHERE intent_id=$1'])await assert.rejects(pool.query(sql,[id]),/immutable/);
  await pool.query(await readFile('server/social/schema.sql','utf8'));
  assert.equal((await receipt(id)).signature,'paid-stack-proof');
  await world.transaction([owner.id],tx=>world.inventory(tx,owner.id,'sushi',-1));
  const restarted=tokens(world,async()=>assert.fail('stored proof must not be verified externally twice'));
  assert.equal((await restarted.fulfill(owner.id,id)).status,'confirmed');
  assert.equal(await owned(owner),2147483647);assert.equal(verifications,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_revenue_records WHERE intent_id=$1',[id])).rows[0].n,1);
  await assert.rejects(restarted.fulfill(owner.id,id),/already fulfilled/);
});

check('proof signatures cannot replay across new receipts or legacy confirmed intents',async()=>{
  const owner=await account(),id=await intent(owner),next=await intent(owner),legacy=await intent(owner,{status:'confirmed'});
  await world.transaction([owner.id],tx=>world.inventory(tx,owner.id,'sushi',2147483647));
  const service=tokens();
  assert.equal((await service.fulfill(owner.id,id,'one-proof')).status,'verified');
  await assert.rejects(service.fulfill(owner.id,next,'one-proof'),/Transaction already used/);
  assert.equal(await receipt(next),undefined);
  await pool.query("UPDATE token_payment_intents SET signature='legacy-proof' WHERE id=$1",[legacy]);
  await assert.rejects(service.fulfill(owner.id,next,'legacy-proof'),/Transaction already used/);
  assert.equal(await receipt(next),undefined);assert.equal((await payment(next)).status,'pending');
  await pool.query("UPDATE token_payment_intents SET data=jsonb_set(data,'{quantity}','2') WHERE id=$1",[id]);
  await assert.rejects(service.fulfill(owner.id,id),/details differ/);
  const changed=(await service.payments(owner.id)).payments.find(row=>row.id===id);
  assert.equal(changed.quantity,1);assert.equal(changed.status,'reconciliation_pending');assert.equal(changed.canRetry,false);
});

check('late first proofs retain owed history after expired or canceled reservations without synthesizing inventory',async()=>{
  for(const closed of ['expired','failed']){
    const owner=await account(),id=await intent(owner),service=tokens();
    if(closed==='failed')await service.cancel(owner.id,id);
    else{now+=60000;await world.transaction([],tx=>service.expire(tx));}
    const before=(await pool.query("SELECT quantity FROM shop_stock WHERE shop_id='foods' AND item_id='sushi'")).rows[0].quantity;
    assert.equal((await payment(id)).status,closed);
    assert.equal((await service.fulfill(owner.id,id,'late-'+id)).status,'reconciliation_pending');
    assert.equal((await receipt(id)).reservation_held,false);assert.equal(await owned(owner),0);
    assert.equal((await service.fulfill(owner.id,id)).status,'reconciliation_pending');
    assert.equal((await pool.query("SELECT quantity FROM shop_stock WHERE shop_id='foods' AND item_id='sushi'")).rows[0].quantity,before);
    const history=await service.payments(owner.id);
    assert.equal(history.payments[0].paymentVerified,true);assert.equal(history.payments[0].canRetry,false);
  }
});

check('owned recovery pagination preserves every microsecond timestamp at the fifty-row boundary',async()=>{
  const owner=await account(),other=await account();
  const ids=[];
  for(let i=1;i<=60;i++)ids.push(await intent(owner,{id:'page-'+String(i).padStart(3,'0'),status:'failed',createdAt:'2026-10-14T13:00:00.123'+String(i).padStart(3,'0')+'Z'}));
  await intent(other,{id:'other-private',status:'failed'});
  const service=tokens(),first=await service.payments(owner.id);
  assert.equal(first.payments.length,50);assert.ok(first.nextCursor);
  const second=await service.payments(owner.id,{after:first.nextCursor});
  assert.equal(second.payments.length,10);assert.equal(second.nextCursor,null);
  assert.deepEqual([...first.payments,...second.payments].map(row=>row.id),ids.toReversed());
  assert.equal(first.payments.some(row=>row.id==='other-private'),false);
});

check('cleanup begun before proof commit cannot delete a paid listing reservation after its lock wait',async()=>{
  const owner=await account(),seller=await account();
  await world.transaction([seller.id],tx=>world.inventory(tx,seller.id,'sushi',1));
  const listing=await world.createListing(seller.id,{itemId:'sushi',quantity:1,price:20});
  const listingId=listing.id??(await pool.query('SELECT id FROM player_shop_listings WHERE seller_id=$1',[seller.id])).rows[0].id;
  const id=await intent(owner,{listingId,sellerId:seller.id});
  await world.transaction([owner.id],tx=>world.inventory(tx,owner.id,'sushi',2147483647));
  let signal,resume;
  const locked=new Promise(resolve=>{signal=resolve;}),continueProof=new Promise(resolve=>{resume=resolve;});
  const paused=Object.assign(Object.create(world),{transaction:(users,operation)=>world.transaction(users,tx=>operation({query:async(sql,args)=>{
    const result=await tx.query(sql,args);
    if(sql.startsWith("UPDATE listing_reservations SET expires_at='infinity'")){signal();await continueProof;}
    return result;
  }}))});
  const service=tokens(paused),sql=[];
  await service.expire({query:async statement=>{sql.push(statement);return {rows:[],rowCount:0};}});
  const cleanupSQL=sql.find(statement=>statement.startsWith('DELETE FROM listing_reservations'));
  const delivering=service.fulfill(owner.id,id,'race-proof');
  const deliveryFailed=delivering.then(result=>assert.equal(result.status,'verified'));
  const cleaner=await pool.connect();let cleanup;
  try{
    await locked;
    const pid=(await cleaner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    cleanup=cleaner.query(cleanupSQL,[new Date(now+600000),service.namespace()]);
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){
      waiting=(await pool.query('SELECT cardinality(pg_blocking_pids($1))>0 AS waiting',[pid])).rows[0].waiting;
      if(waiting)break;
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(waiting,true,'cleanup must reach its real PostgreSQL row lock before proof commits');
    resume();await deliveryFailed;
    assert.equal((await cleanup).rowCount,0);
    assert.equal((await payment(id)).status,'verified');
    assert.equal((await pool.query('SELECT intent_id,expires_at::text AS expiry FROM listing_reservations WHERE listing_id=$1',[listingId])).rows[0].expiry,'infinity');
    assert.equal((await receipt(id)).signature,'race-proof');
    await assert.rejects(service.cancelListing(seller.id,listingId),/awaiting completion or reconciliation/);
    assert.equal((await pool.query('SELECT quantity FROM player_shop_listings WHERE id=$1',[listingId])).rows[0].quantity,1);
  }finally{resume();await deliveryFailed;await cleanup;cleaner.release();}
});

check('cross-network and cross-mode delivery fail closed while legacy unbound paid evidence remains reconcilable',async()=>{
  const owner=await account(),id=await intent(owner);
  const changed=new TokenService(world,{config:{...config,network:'mainnet-beta'},verifier:{verify:async()=>assert.fail('wrong network must not verify')},now:()=>now});
  await assert.rejects(changed.fulfill(owner.id,id,'foreign-proof'),/currency configuration differs/);
  assert.equal(await receipt(id),undefined);assert.equal(await owned(owner),0);
  const legacy=await intent(owner);
  await pool.query("UPDATE token_payment_intents SET data=data-'paymentNamespace' WHERE id=$1",[legacy]);
  assert.equal((await tokens().fulfill(owner.id,legacy,'legacy-unbound-proof')).status,'reconciliation_pending');
  assert.equal((await receipt(legacy)).verification_namespace.network,config.network);
  assert.equal(await owned(owner),0);
  const mock=new TokenService(world,{config:{...config,mock:true},now:()=>now});
  await assert.rejects(mock.fulfill(owner.id,legacy),/currency configuration differs/);
  assert.equal((await receipt(legacy)).signature,'legacy-unbound-proof');
});

check('preserved legacy or foreign pending reservations do not permanently consume the current namespace checkout limit',async()=>{
  const owner=await account(),legacy=[];
  for(let i=0;i<3;i++)legacy.push(await intent(owner));
  await pool.query("UPDATE token_payment_intents SET data=data-'paymentNamespace' WHERE id=ANY($1::text[])",[legacy.slice(0,2)]);
  await pool.query("UPDATE token_payment_intents SET data=jsonb_set(data,'{paymentNamespace,network}','\"mainnet-beta\"') WHERE id=$1",[legacy[2]]);
  await pool.query('INSERT INTO connected_wallets(public_key,user_id) VALUES($1,$2)',['fixture-wallet-'+owner.id,owner.id]);
  const service=tokens();
  for(let i=0;i<3;i++)assert.ok((await service.intent(owner.id,{shopId:'foods',itemId:'sushi'})).id);
  await assert.rejects(service.intent(owner.id,{shopId:'foods',itemId:'sushi'}),/Finish or cancel/);
  for(const id of legacy)assert.equal((await payment(id)).status,'pending');
});
