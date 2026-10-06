/** Real BattleBrains + PostgreSQL + load/tick/save benchmark in a temporary schema. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { WorldService } from '../server/world/service.mjs';
import { BattleBrains } from '../server/adventure/battle.mjs';
import { ITEMS } from '../web/js/world/catalog.js';
import { args } from './brain_proc.mjs';
const percentile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(q*a.length))];
const distribution=(a)=>({n:a.length,p50:percentile(a,.5),p95:percentile(a,.95),p99:percentile(a,.99)});
function hostUsage(pid){
  const row=execFileSync('ps',['-o','rss=,cputime=','-p',String(pid)],{encoding:'utf8'}).trim().split(/\s+/);
  const parts=row[1].split(':').map(Number);let seconds=0;for(const p of parts)seconds=seconds*60+p;
  return {rssBytes:Number(row[0])*1024,cpuSeconds:seconds};
}
export async function benchmark(output){
  if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL required; never use the production DB');
  const schema='battle_bench_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool,brains;
  const samples=[],native=[],results=[];
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
    for(const file of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql','server/adventure/schema.sql'])await pool.query(await readFile(file,'utf8'));
    for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
    const world=new WorldService(pool),user=await world.ensureUser('battle_perf');
    const ids=Array.from({length:100},(_,i)=>`battle-perf-${i}`);
    for(const id of ids)await world.adopt(user.id,id,'Performance subject');
    brains=new BattleBrains(world);
    const obs=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1];
    // Birth/warmup is separate from continuing-brain latency.
    const birthAt=performance.now();
    for(const id of ids)await brains.decide(id,user.id,obs,0);
    const birthMs=performance.now()-birthAt;
    const original=brains.host.call.bind(brains.host);
    brains.host.call=async(m)=>{const at=performance.now();const r=await original(m);native.push({op:m.op,ms:performance.now()-at});return r;};
    for(const battles of [10,25,50,100]){
      const latency=[],service=[],queue=[],rounds=[];
      const before=hostUsage(brains.host.child.pid),nodeBefore=process.resourceUsage(),nodeRssBefore=process.memoryUsage().rss;
      const at=performance.now();
      for(let round=0;round<3;round++){
        const roundAt=performance.now();
        await Promise.all(ids.slice(0,battles).map((id,index)=>{
          const submitted=performance.now(), prior=brains.queue;
          // Observe when the existing serialized queue releases this request.
          let began=null;prior.then(()=>{began=performance.now();});
          return brains.decide(id,user.id,obs,round===1?.2:-.08).then(()=>{
            const done=performance.now();latency.push(done-submitted);service.push(done-began);queue.push(began-submitted);
          });
        }));
        rounds.push(performance.now()-roundAt);
      }
      const elapsedMs=performance.now()-at,after=hostUsage(brains.host.child.pid),nodeAfter=process.resourceUsage();
      const bytes=(await pool.query('SELECT avg(octet_length(checkpoint)) AS average,sum(octet_length(checkpoint)) AS total FROM mochi_battle_brains WHERE mochi_id=ANY($1)',[ids.slice(0,battles)])).rows[0];
      results.push({battles,rounds:3,elapsedMs,roundMs:rounds,endToEndMs:distribution(latency),serviceMs:distribution(service),queueMs:distribution(queue),
        nativeCpuSeconds:after.cpuSeconds-before.cpuSeconds,nodeCpuSeconds:(nodeAfter.userCPUTime+nodeAfter.systemCPUTime-nodeBefore.userCPUTime-nodeBefore.systemCPUTime)/1e6,
        nativeRssBytes:after.rssBytes,nodeRssBytes:process.memoryUsage().rss,nodeRssDeltaBytes:process.memoryUsage().rss-nodeRssBefore,checkpointBytesPerBattle:Number(bytes.average),checkpointBytesTotal:Number(bytes.total),
        decisionsPerSecond:3*battles/(elapsedMs/1000),observedBurstClearsBefore1400ms:Math.max(...rounds)<1400});
      console.log(JSON.stringify(results.at(-1)));
    }
    const phases={};for(const op of ['boot','tick','save'])phases[op]=distribution(native.filter(x=>x.op===op).map(x=>x.ms));
    await writeFile(output,JSON.stringify({protocol:'actual serialized BattleBrains.decide; local PostgreSQL; 100 births then three synchronized bursts per concurrency; no movement/socket load',birthMs,results,nativePhasesMs:phases,nativeSamples:native},null,2)+'\n');
  }finally{
    brains?.close();await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
}
if(import.meta.url===`file://${process.argv[1]}`){const options=args({output:'runs/server-battle-performance.json'});await benchmark(options.output);}
