import {GameError, integer, itemById} from '../world/service.mjs';
import {COIN_SHOPS, COIN_BUYERS} from '../../web/js/game/commerce.js';

const canonical = value => JSON.stringify(value);
const requestId = id => {
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new GameError('A unique commerce ID is required');
  return id;
};
const identifier = (value, name) => {
  if(typeof value!=='string'||!/^[a-z0-9-]{1,80}$/.test(value))throw new GameError(`Invalid ${name}`);
};
const owned = row => Number(row?.quantity ?? 0);
export class AdventureCommerce {
  constructor(service, {isActorLive = ()=>true}={}) {
    this.service=service;this.pool=service.pool;this.isActorLive=isActorLive;
  }
  proximity(userId, actor, vendor) {
    if(!vendor||actor?.userId!==userId||actor.roomId!=='town'||
      !Number.isFinite(actor.x)||!Number.isFinite(actor.y)||!this.isActorLive(actor)||
      Math.hypot(actor.x-vendor.x,actor.y-vendor.y)>130)
      throw new GameError('Walk to this Town vendor first');
  }
  async catalog(userId) {
    const [user,bag,history]=await Promise.all([
      this.pool.query('SELECT id,coins FROM users WHERE id=$1',[userId]),
      this.pool.query("SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 AND location='bag' AND quantity>0 ORDER BY item_id",[userId]),
      this.pool.query("SELECT count(*)::int AS count FROM adventure_commerce_receipts WHERE user_id=$1 AND kind='sell' AND vendor='wood'",[userId]),
    ]);
    if(!user.rows.length)throw new GameError('Account not found',404);
    const inventory=new Map(bag.rows.map(r=>[r.item_id,r]));
    const item=(id,price)=>({id,name:itemById.get(id).name,price,owned:owned(inventory.get(id)),
      requiredLevel:itemById.get(id).requiredLevel??1});
    return {userId:user.rows[0].id,currency:'Coins',coins:user.rows[0].coins,inventory:bag.rows,woodSales:history.rows[0].count,
      shops:Object.entries(COIN_SHOPS).map(([id,v])=>({id,name:v.name,title:v.title,x:v.x,y:v.y,
        items:Object.entries(v.items).map(([id,price])=>({...item(id,price),maxQuantity:itemById.get(id).stackable?50:1}))})),
      buyers:Object.entries(COIN_BUYERS).map(([id,v])=>({id,name:v.name,x:v.x,y:v.y,
        items:Object.entries(v.prices).map(([id,price])=>item(id,price))})),
    };
  }
  async receipt(tx,userId,id,request) {
    const prior=(await tx.query('SELECT request,result FROM adventure_commerce_receipts WHERE user_id=$1 AND id=$2',[userId,id])).rows[0];
    if(!prior)return null;
    // PostgreSQL jsonb reorders object keys; compare normalized canonical fields.
    const sorted = value => Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?
      Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
    if(canonical(sorted(prior.request))!==canonical(sorted(request)))throw new GameError('Commerce ID belongs to a different request',409);
    return {...prior.result,replayed:true};
  }
  async record(tx,userId,id,request,result) {
    await tx.query('INSERT INTO adventure_commerce_receipts(user_id,id,kind,vendor,request,result,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [userId,id,request.kind,request.vendor,request,result,new Date(this.service.now())]);
    await this.service.event(tx,userId,'adventure-commerce',result);
    return result;
  }
  async buy(userId,{id,vendor,itemId,quantity=1},actor) {
    requestId(id);identifier(vendor,'vendor');identifier(itemId,'item');integer(quantity,1,50);
    const request={kind:'buy',vendor,itemId,quantity};
    return this.service.transaction([userId],async tx=>{
      // An authenticated owner may recover a committed receipt after departure.
      // This path only reads history; every new trade still validates a live body.
      const prior=await this.receipt(tx,userId,id,request);if(prior)return prior;
      const shop=Object.hasOwn(COIN_SHOPS,vendor)?COIN_SHOPS[vendor]:null,
        price=shop?.items[itemId],item=itemById.get(itemId);
      if(!Number.isSafeInteger(price)||!item)throw new GameError('This vendor does not sell that item');
      integer(quantity,1,item.stackable?50:1);const amount=integer(price*quantity,1);
      this.proximity(userId,actor,shop);
      const coins=await this.service.coins(tx,userId,-amount,'shop_purchase',
        {currency:'Coins',vendor,quantity,receiptId:id},null,itemId,{mirrorMockTokens:false});
      await this.service.inventory(tx,userId,itemId,quantity);
      this.proximity(userId,actor,shop);
      return this.record(tx,userId,id,request,{receiptId:id,kind:'buy',currency:'Coins',vendor,itemId,quantity,amount,coins,
        message:`Bought ${quantity} ${item.name} for ${amount} Coins.`});
    });
  }
  async sell(userId,{id,vendor,items},actor) {
    requestId(id);identifier(vendor,'vendor');
    if(!items||typeof items!=='object'||Array.isArray(items)||!Object.keys(items).length||Object.keys(items).length>8)
      throw new GameError('Choose owned resources');
    const selected=Object.fromEntries(Object.keys(items).sort().map(itemId=>{
      identifier(itemId,'item');return [itemId,integer(items[itemId],1,999)];
    }));
    const request={kind:'sell',vendor,items:selected};
    return this.service.transaction([userId],async tx=>{
      const prior=await this.receipt(tx,userId,id,request);if(prior)return prior;
      const buyer=Object.hasOwn(COIN_BUYERS,vendor)?COIN_BUYERS[vendor]:null;
      this.proximity(userId,actor,buyer);
      for(const itemId of Object.keys(selected))
        if(!Object.hasOwn(buyer.prices,itemId))throw new GameError('This buyer does not buy that item');
      const amount=integer(Object.entries(selected).reduce((sum,[id,q])=>sum+buyer.prices[id]*q,0),1);
      for(const [item,q] of Object.entries(selected))await this.service.inventory(tx,userId,item,-q);
      const coins=await this.service.coins(tx,userId,amount,'resource_sale',
        {currency:'Coins',vendor,items:selected,receiptId:id},null,null,{mirrorMockTokens:false});
      this.proximity(userId,actor,buyer);
      return this.record(tx,userId,id,request,{receiptId:id,kind:'sell',currency:'Coins',vendor,items:selected,amount,coins,
        message:`Sold resources for ${amount} Coins.`});
    });
  }
}
