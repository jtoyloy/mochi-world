import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WorldService} from '../../server/world/service.mjs';
import {AdventureCommerce} from '../../server/adventure/commerce.mjs';
import {TokenService} from '../../server/social/tokens.mjs';
import {ResourceRewards} from '../../server/adventure/rewards.mjs';
import {ITEMS} from '../../web/js/world/catalog.js';
import {COIN_SHOPS,COIN_BUYERS} from '../../web/js/game/commerce.js';
let pool,admin,world,commerce,schema;
before(async()=>{
 if(!process.env.TEST_DATABASE_URL)throw Error('Commerce tests require PostgreSQL TEST_DATABASE_URL');
 schema='commerce_test_'+randomUUID().replaceAll('-','');admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:8});
 for(const f of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql','server/adventure/schema.sql','server/adventure/commerce-schema.sql'])await pool.query(await readFile(f,'utf8'));
 for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
 world=new WorldService(pool);commerce=new AdventureCommerce(world);
});
after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
const account=async()=>world.ensureUser('coin_'+randomUUID().replaceAll('-','').slice(0,16));
const actor=(user,vendor)=>({userId:user.id,roomId:'town',room:'town-1',x:vendor.x,y:vendor.y});
const quantity=async(user,id)=>(await pool.query("SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag'",[user.id,id])).rows[0]?.quantity??0;
const coins=async user=>(await pool.query('SELECT coins FROM users WHERE id=$1',[user.id])).rows[0].coins;
const grant=(user,id,q)=>world.transaction([user.id],tx=>world.inventory(tx,user.id,id,q));

test('wallet-free resource loop replenishes supplies in real token mode with rewards paused',async()=>{
 const user=await account();world.tokenConfig={mock:false,mint:'configured-token'};
 const rewards=new ResourceRewards(world,{mock:false,dailyCap:'0',globalCap:'0',prices:'{}'});
 assert.equal((await rewards.balance(user.id)).enabled,false);
 await grant(user,'softwood',2);await pool.query('UPDATE users SET coins=0 WHERE id=$1',[user.id]);
 const sale=await commerce.sell(user.id,{id:randomUUID(),vendor:'wood',items:{softwood:2}},actor(user,COIN_BUYERS.wood));
 assert.equal(sale.amount,20);assert.equal(sale.currency,'Coins');assert.equal(sale.coins,20);
 const buy=await commerce.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion',quantity:1,price:0},actor(user,COIN_SHOPS.apothecary));
 assert.equal(buy.amount,20);assert.equal(await coins(user),0);assert.equal(await quantity(user,'small-potion'),1);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM connected_wallets WHERE user_id=$1',[user.id])).rows[0].n,0);
 for(const table of ['token_payment_intents','game_reward_accruals','game_reward_claims','reward_treasury','platform_revenue_records'])
   assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0,table);
});

test('same ID retries return owned receipt once; reordered resource keys are canonical',async()=>{
 const user=await account();await grant(user,'softwood',2);await grant(user,'hardwood',1);
 const id=randomUUID(),p=actor(user,COIN_BUYERS.wood);
 const result=await commerce.sell(user.id,{id,vendor:'wood',items:{softwood:2,hardwood:1}},p);
 const replay=await commerce.sell(user.id,{id,vendor:'wood',items:{hardwood:1,softwood:2}},null);
 assert.equal(replay.replayed,true);assert.equal(replay.amount,result.amount);assert.equal(await coins(user),542);
 assert.equal((await commerce.catalog(user.id)).woodSales,1);
 await assert.rejects(commerce.sell(user.id,{id,vendor:'wood',items:{softwood:1}},p),/different request/);
 const buyer=actor(user,COIN_SHOPS.apothecary),purchase={id:randomUUID(),vendor:'apothecary',itemId:'small-potion',quantity:2};
 await commerce.buy(user.id,purchase,buyer);await commerce.buy(user.id,purchase,{...buyer,roomId:'forest'});
 assert.equal(await quantity(user,'small-potion'),2);assert.equal(await coins(user),502);
 await assert.rejects(commerce.buy(user.id,{...purchase,itemId:'mana-potion'},buyer),/different request/);
});

test('simultaneous duplicate receipts and different receipts cannot oversell or overspend',async()=>{
 const user=await account();await grant(user,'softwood',1);
 const input={id:randomUUID(),vendor:'wood',items:{softwood:1}},p=actor(user,COIN_BUYERS.wood);
 const results=await Promise.all([commerce.sell(user.id,input,p),commerce.sell(user.id,input,p)]);
 assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(await coins(user),510);
 await grant(user,'softwood',1);
 const sales=await Promise.allSettled([commerce.sell(user.id,{...input,id:randomUUID()},p),commerce.sell(user.id,{...input,id:randomUUID()},p)]);
 assert.equal(sales.filter(r=>r.status==='fulfilled').length,1);assert.equal(await quantity(user,'softwood'),0);
 await pool.query('UPDATE users SET coins=20 WHERE id=$1',[user.id]);
 const purchases=await Promise.allSettled([1,2].map(()=>commerce.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion'},actor(user,COIN_SHOPS.apothecary))));
 assert.equal(purchases.filter(r=>r.status==='fulfilled').length,1);assert.equal(await coins(user),0);
 assert.equal(await quantity(user,'small-potion'),1);
});

test('Town ownership/range and finite authoritative position reject forged or stale actors',async()=>{
 const user=await account(),p=actor(user,COIN_SHOPS.apothecary),input={id:randomUUID(),vendor:'apothecary',itemId:'small-potion'};
 for(const change of [{userId:'another-user'},{roomId:'forest'},{x:p.x+130.001},{x:NaN},{y:Infinity}])
   await assert.rejects(commerce.buy(user.id,input,{...p,...change}),/Walk/);
 await commerce.buy(user.id,input,{...p,x:p.x+130});assert.equal(await coins(user),480);
 const stale=new AdventureCommerce(world,{isActorLive:()=>false});
 await assert.rejects(stale.buy(user.id,{...input,id:randomUUID()},p),/Walk/);
});

test('item, quantity, buyer and overflow validation cannot change inventory or prices',async()=>{
 const user=await account(),p=actor(user,COIN_SHOPS.apothecary);
 for(const quantity of [0,-1,1.5,51,Infinity,Number.MAX_SAFE_INTEGER])
   await assert.rejects(commerce.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion',quantity},p),/whole number/);
 await assert.rejects(commerce.buy(user.id,{id:randomUUID(),vendor:'blacksmith',itemId:'padded-coat',quantity:2},actor(user,COIN_SHOPS.blacksmith)),/whole number/);
 await assert.rejects(commerce.buy(user.id,{id:randomUUID(),vendor:'mage',itemId:'small-potion'},actor(user,COIN_SHOPS.mage)),/does not sell/);
 for(const items of [{softwood:0},{softwood:1.5},{softwood:1000},{'small-potion':1},[],{},null])
   await assert.rejects(commerce.sell(user.id,{id:randomUUID(),vendor:'wood',items},actor(user,COIN_BUYERS.wood)));
 await assert.rejects(commerce.sell(user.id,{id:randomUUID(),vendor:'__proto__',items:{softwood:1}},actor(user,COIN_BUYERS.wood)),/Walk/);
 assert.equal(await coins(user),500);assert.equal(await quantity(user,'small-potion'),0);
});

test('mixed sale failure and downstream receipt/event failure roll back all inventory and Coins',async()=>{
 const user=await account();await grant(user,'softwood',2);
 await assert.rejects(commerce.sell(user.id,{id:randomUUID(),vendor:'wood',items:{softwood:2,hardwood:1}},actor(user,COIN_BUYERS.wood)),/do not own/);
 assert.equal(await quantity(user,'softwood'),2);assert.equal(await coins(user),500);
 const failing=new AdventureCommerce(Object.assign(Object.create(world),{event:async()=>{throw Error('event failed');}}));
 await assert.rejects(failing.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion'},actor(user,COIN_SHOPS.apothecary)),/event failed/);
 assert.equal(await quantity(user,'small-potion'),0);assert.equal(await coins(user),500);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM adventure_commerce_receipts WHERE user_id=$1',[user.id])).rows[0].n,0);
});

test('per-account receipt ownership and immutable history prevent replay into another account',async()=>{
 const a=await account(),b=await account(),id=randomUUID();
 for(const user of [a,b])await commerce.buy(user.id,{id,vendor:'apothecary',itemId:'small-potion'},actor(user,COIN_SHOPS.apothecary));
 assert.equal(await quantity(a,'small-potion'),1);assert.equal(await quantity(b,'small-potion'),1);
 await assert.rejects(pool.query("UPDATE adventure_commerce_receipts SET result='{}' WHERE user_id=$1",[a.id]),/immutable/);
 await assert.rejects(pool.query('DELETE FROM adventure_commerce_receipts WHERE user_id=$1',[a.id]),/immutable/);
});

test('Coins sales and purchases never mirror into existing or lazily initialized mock SPL balances',async()=>{
 world.tokenConfig=null;const user=await account();await grant(user,'softwood',2);
 world.tokenConfig={mock:true,decimals:6};
 const tokens=new TokenService(world,{config:world.tokenConfig});
 await commerce.sell(user.id,{id:randomUUID(),vendor:'wood',items:{softwood:1}},actor(user,COIN_BUYERS.wood));
 const balance=await tokens.balance(user.id);assert.equal(balance.amountRaw,'500000000');
 await commerce.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion'},actor(user,COIN_SHOPS.apothecary));
 await commerce.sell(user.id,{id:randomUUID(),vendor:'wood',items:{softwood:1}},actor(user,COIN_BUYERS.wood));
 assert.equal((await tokens.balance(user.id,true)).amountRaw,'500000000');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_token_ledger WHERE user_id=$1',[user.id])).rows[0].n,0);
 await world.transaction([user.id],tx=>world.coins(tx,user.id,10,'daily_reward'));
 assert.equal((await tokens.balance(user.id,true)).amountRaw,'510000000');
 world.tokenConfig=null;
});

test('catalog provides finite positive prices and renewable material buyers independent of token quotes',async()=>{
 const user=await account(),catalog=await commerce.catalog(user.id);
 assert.equal(catalog.currency,'Coins');assert.equal(catalog.coins,500);
 for(const shop of catalog.shops)for(const item of shop.items){assert.ok(Number.isSafeInteger(item.price)&&item.price>0);assert.ok(ITEMS.some(i=>i.id===item.id));}
 for(const buyer of catalog.buyers)for(const item of buyer.items)assert.ok(Number.isSafeInteger(item.price)&&item.price>0);
 await grant(user,'slime-resin',2);
 const result=await commerce.sell(user.id,{id:randomUUID(),vendor:'blacksmith',items:{'slime-resin':2}},actor(user,COIN_BUYERS.blacksmith));
 assert.equal(result.amount,16);assert.equal(await coins(user),516);
});

test('two actual timed wood harvests finance one replacement potion without a wallet',async()=>{
 const {AdventureService}=await import('../../server/adventure/service.mjs');
 const {RESOURCE_NODES}=await import('../../web/js/game/adventure.js');
 let now=1000000;const service=new WorldService(pool,{now:()=>now}),user=await account();
 const game=new AdventureService(service,{brains:{close(){}},rewards:new ResourceRewards(service,{mock:false,prices:'{}',dailyCap:'0',globalCap:'0'})});
 const market=new AdventureCommerce(service),node=RESOURCE_NODES.find(n=>n.id==='forest-soft');
 const p={userId:user.id,roomId:'forest',room:'renewable-forest',x:node.x,y:node.y,companion:null};
 try {
   await game.state(user.id);const before=await quantity(user,'small-potion');
   await pool.query('UPDATE users SET coins=0 WHERE id=$1',[user.id]);
   for(let i=0;i<2;i++){
     const harvest=await game.startHarvest(p,node.id);now+=node.durationMs;
     await game.finishHarvest(p,harvest.id);if(i===0)now+=node.cooldownMs;
   }
   assert.equal(now-1000000,22000);assert.equal(await quantity(user,'softwood'),2);
   const sale=await market.sell(user.id,{id:randomUUID(),vendor:'wood',items:{softwood:2}},actor(user,COIN_BUYERS.wood));
   assert.equal(sale.amount,20);
   await market.buy(user.id,{id:randomUUID(),vendor:'apothecary',itemId:'small-potion'},actor(user,COIN_SHOPS.apothecary));
   assert.equal(await coins(user),0);assert.equal(await quantity(user,'small-potion'),before+1);
   assert.equal(await quantity(user,'softwood'),0);assert.equal((await market.catalog(user.id)).woodSales,1);
 }finally{await game.close();}
});
