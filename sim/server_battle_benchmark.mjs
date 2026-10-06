/** Real isolated PostgreSQL decisions, including all worker/brain/DB queue time. */
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {WorldService} from '../server/world/service.mjs';
import {BattleBrains} from '../server/adventure/battle.mjs';
import {ITEMS} from '../web/js/world/catalog.js';
import {args} from './brain_proc.mjs';
const distribution=a=>{const b=[...a].sort((x,y)=>x-y);return {n:b.length,p50:b[Math.floor(b.length*.5)]??null,p95:b[Math.min(b.length-1,Math.floor(b.length*.95))]??null,p99:b[Math.min(b.length-1,Math.floor(b.length*.99))]??null};};
export async function benchmark(output,{workers=[1,2,4,8],sizes=[10,25,50,100,150],rounds=3}={}){
 if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
 const schema='battle_scaling_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool,brains;
 const results=[];
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:16});
  for(const f of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql','server/adventure/schema.sql'])await pool.query(await readFile(f,'utf8'));
  for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
  const world=new WorldService(pool),actors=[];
  for(let i=0;i<Math.max(...sizes);i++){const user=await world.ensureUser('battle_perf_'+i),id='battle-perf-'+i;await world.adopt(user.id,id,'Performance subject');actors.push({id,user:user.id});}
  const obs=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1];
  for(const count of workers){
   await pool.query('DELETE FROM mochi_battle_brains');
   brains=new BattleBrains(world,{count,maxResidents:192});await brains.workers.ready();
   const birth=performance.now();for(const a of actors)await brains.decide(a.id,a.user,obs);const birthMs=performance.now()-birth;
   for(const n of sizes){
    brains.samples=[];const before=brains.workers.diagnostics(),cpu=process.cpuUsage(),at=performance.now();const bursts=[];
    for(let r=0;r<rounds;r++){const start=performance.now();await Promise.all(actors.slice(0,n).map(a=>brains.decide(a.id,a.user,obs,r===1?.2:-.08)));bursts.push(performance.now()-start);}
    const elapsedMs=performance.now()-at,after=brains.workers.diagnostics(),phases={};
    for(const key of ['endToEnd','queue','service','ipc','transport','load','step','save','host','db'])phases[key]=distribution(brains.samples.map(s=>s[key]));
    const nodeCpu=process.cpuUsage(cpu),nativeCpuSeconds=after.workers.reduce((s,w,i)=>s+w.cpuSeconds-before.workers[i].cpuSeconds,0);
    const result={workers:count,battles:n,rounds,birthMs,elapsedMs,burstMs:bursts,phasesMs:phases,missed1400ms:brains.samples.filter(s=>s.endToEnd>1400).length,decisionsPerSecond:n*rounds/(elapsedMs/1000),nativeCpuSeconds,nodeCpuSeconds:(nodeCpu.user+nodeCpu.system)/1e6,nativeRssBytes:after.workers.reduce((s,w)=>s+w.rssBytes,0),nodeRssBytes:process.memoryUsage().rss,coldLoads:after.workers.reduce((s,w,i)=>s+w.coldLoads-before.workers[i].coldLoads,0),saves:after.workers.reduce((s,w,i)=>s+w.saves-before.workers[i].saves,0),diagnostics:after};
    results.push(result);console.log(JSON.stringify(result));
   }
   await brains.close();brains=null;
  }
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({protocol:'Real PostgreSQL BattleBrains, independent authenticated owners, persistent workers; three synchronized continuing-decision bursts. Queue included; birth separate. No sockets/Adventure tick capacity claim.',results},null,2)+'\n');
 }finally{await brains?.close();await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
if(import.meta.url===`file://${process.argv[1]}`){const o=args({output:'runs/battle-scaling.json',workers:'1,2,4,8',sizes:'10,25,50,100,150',rounds:3});await benchmark(o.output,{workers:o.workers.split(',').map(Number),sizes:o.sizes.split(',').map(Number),rounds:o.rounds});}
