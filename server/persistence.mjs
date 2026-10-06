import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {portfolioValue} from '../web/js/traders/trading.js';
export function validateId(id){if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))throw new Error('Invalid Mochi identity');return id;}
export class FilePersistence {
 constructor(dir=resolve('data')){this.dir=dir;this.locks=new Map();this.mode='server file storage';}
 async load(id){validateId(id);try{return JSON.parse(await readFile(resolve(this.dir,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async save(id,record){validateId(id);const previous=this.locks.get(id)??Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{await mkdir(this.dir,{recursive:true});const path=resolve(this.dir,id+'.json'),tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(record));await rename(tmp,path);});this.locks.set(id,next);try{await next;}finally{if(this.locks.get(id)===next)this.locks.delete(id);}}
 async list(){await mkdir(this.dir,{recursive:true});const ids=(await readdir(this.dir)).filter(x=>x.endsWith('.json'));return Promise.all(ids.map(x=>this.load(x.slice(0,-5))));}
}
export function leaderboardRow(record,period='all'){const state=record.state;if(!state)return null;const p=state.portfolio,value=portfolioValue(p),day=new Date().toISOString().slice(0,10),baseline=period==='today'?(state.dailyBaseline?.day===day?state.dailyBaseline.value:null):p.startingBalance;if(baseline===null)return null;const ts=state.trades.filter(t=>period==='all'||new Date(t.timestamp).toISOString().slice(0,10)===day),closed=ts.filter(t=>t.pnl!==undefined);return {name:state.name??'Momo',owner:record.owner??'DEV_USER',value,returnPct:100*(value/baseline-1),trades:ts.length,winRate:closed.length?100*closed.filter(t=>t.pnl>0).length/closed.length:null};}
export class PostgresPersistence {
 constructor(db,pool,schema,eq){Object.assign(this,{db,pool,schema,eq});this.mode='PostgreSQL';}
 async load(id){validateId(id);const s=this.schema;const rows=await this.db.select().from(s.mochis).where(this.eq(s.mochis.id,id));if(!rows[0])return null;const brain=await this.db.select().from(s.brains).where(this.eq(s.brains.mochiId,id));return {owner:'DEV_USER',state:rows[0].state,life:brain[0]?.life??null};}
 async save(id,record){validateId(id);const s=this.schema;await this.db.transaction(async tx=>{
 await tx.insert(s.users).values({id:'DEV_USER',displayName:'DEV_USER'}).onConflictDoNothing();
 const state=record.state;await tx.insert(s.mochis).values({id,userId:'DEV_USER',name:state?.name??'Momo',state:state??{}}).onConflictDoUpdate({target:s.mochis.id,set:{state:state??{},name:state?.name??'Momo',updatedAt:new Date()}});
 if(record.life)await tx.insert(s.brains).values({mochiId:id,pack:record.life.pack,life:record.life}).onConflictDoUpdate({target:s.brains.mochiId,set:{pack:record.life.pack,life:record.life}});
 if(!state)return;
 for(const [table,row,key] of [[s.petState,{mochiId:id,state:{personality:state.personality,world:record.life?.world}},'state'],[s.equipment,{mochiId:id,slots:state.economy.equipped},'slots'],[s.portfolios,{mochiId:id,data:state.portfolio},'data']])await tx.insert(table).values(row).onConflictDoUpdate({target:table.mochiId,set:{[key]:row[key]}});
 for(const table of [s.inventories,s.positions,s.trades,s.achievements])await tx.delete(table).where(this.eq(table.mochiId,id));
 for(const [itemId,quantity] of Object.entries(state.economy.inventory))await tx.insert(s.inventories).values({mochiId:id,itemId,quantity});
 for(const x of state.portfolio.positions)await tx.insert(s.positions).values({mochiId:id,symbol:x.symbol,data:x});
 for(const x of state.trades)await tx.insert(s.trades).values({mochiId:id,id:x.id,data:x});
 for(const x of state.economy.achievements)await tx.insert(s.achievements).values({mochiId:id,id:x,data:{earned:true}});
 for(const period of ['all','today']){const row=leaderboardRow(record,period);if(row)await tx.insert(s.leaderboard).values({mochiId:id,period,value:row.value,data:row}).onConflictDoUpdate({target:[s.leaderboard.mochiId,s.leaderboard.period],set:{value:row.value,data:row}});}
 });}
 async list(){const rows=await this.db.select().from(this.schema.mochis);return rows.map(r=>({owner:'DEV_USER',state:r.state}));}
}
export async function createPersistence(){if(!process.env.DATABASE_URL)return new FilePersistence();const [{default:pg},{drizzle},{eq},schema]=await Promise.all([import('pg'),import('drizzle-orm/node-postgres'),import('drizzle-orm'),import('./schema.js')]);const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});await pool.query('select 1');return new PostgresPersistence(drizzle(pool),pool,schema,eq);}
