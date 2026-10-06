/** Real isolated PostgreSQL decisions, including all worker/brain/DB queue time. */
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {dirname} from 'node:path';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {cpus,loadavg,freemem,totalmem} from 'node:os';
import {AdventureService} from '../server/adventure/service.mjs';
import {ServerArena,scenario} from './server_battle.mjs';
import {WorldService} from '../server/world/service.mjs';
import {BattleBrains} from '../server/adventure/battle.mjs';
import {ITEMS} from '../web/js/world/catalog.js';
import {args} from './brain_proc.mjs';
const distribution=a=>{const b=[...a].sort((x,y)=>x-y);return {n:b.length,p50:b[Math.floor(b.length*.5)]??null,p95:b[Math.min(b.length-1,Math.floor(b.length*.95))]??null,p99:b[Math.min(b.length-1,Math.floor(b.length*.99))]??null,max:b.at(-1)??null};};
export async function benchmark(output,{workers=[1,2,4,8],sizes=[10,25,50,100,150],rounds=3,repeats=2,adventure=false,roomGroupSize=1}={}){
 for(const [key,values] of Object.entries({workers,sizes,rounds:[rounds],repeats:[repeats],roomGroupSize:[roomGroupSize]}))if(!values.length||values.some(x=>!Number.isSafeInteger(x)||x<1))throw Error('Invalid '+key);
 if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
 const schema='battle_scaling_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool,brains;
 const results=[],sourceHashes={};
 for(const f of ['sim/server_battle_benchmark.mjs','server/adventure/battle.mjs','server/adventure/service.mjs','server/adventure/battle-workers.mjs','mochi/battle.py','mochi/battle_worker.py'])sourceHashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:16});
  for(const f of ['server/schema.sql','server/world/schema.sql','server/social/schema.sql','server/adventure/schema.sql'])await pool.query(await readFile(f,'utf8'));
  for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2)',[item.id,item]);
  const world=new WorldService(pool),actors=[];
  for(let i=0;i<Math.max(...sizes);i++){const user=await world.ensureUser('battle_perf_'+i),id='battle-perf-'+i;await world.adopt(user.id,id,'Performance subject');actors.push({id,user:user.id});}
  const obs=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1];
  for(let repeat=1;repeat<=repeats;repeat++)for(const count of workers){
   await pool.query('TRUNCATE mochi_battle_brains');
   brains=new BattleBrains(world,{count,maxResidents:192});await brains.workers.ready();
   const birth=performance.now();for(const a of actors)await brains.decide(a.id,a.user,obs);const birthMs=performance.now()-birth;
   for(const n of sizes){
    const disk=await statfs(process.cwd());if(disk.bavail*disk.bsize<3*1024**3)throw Error('Benchmark disk safety floor3GiB reached');
    brains.samples=[];const before=brains.workers.diagnostics(),cpu=process.cpuUsage(),at=performance.now();const bursts=[];
    for(let r=0;r<rounds;r++){const start=performance.now();await Promise.all(actors.slice(0,n).map(a=>brains.decide(a.id,a.user,obs,r===1?.2:-.08)));bursts.push(performance.now()-start);}
    const elapsedMs=performance.now()-at,after=brains.workers.diagnostics(),phases={};
    for(const key of ['endToEnd','queue','service','ipc','transport','load','step','save','host','db'])phases[key]=distribution(brains.samples.map(s=>s[key]));
    const nodeCpu=process.cpuUsage(cpu),nativeCpuSeconds=after.workers.reduce((s,w,i)=>s+w.cpuSeconds-before.workers[i].cpuSeconds,0);
    const result={repeat,workers:count,battles:n,rounds,birthMs,elapsedMs,burstMs:bursts,phasesMs:phases,missed1400ms:brains.samples.filter(s=>s.endToEnd>1400).length,decisionsPerSecond:n*rounds/(elapsedMs/1000),nativeCpuSeconds,nodeCpuSeconds:(nodeCpu.user+nodeCpu.system)/1e6,nativeRssBytes:after.workers.reduce((s,w)=>s+w.rssBytes,0),nodeRssBytes:process.memoryUsage().rss,coldLoads:after.workers.reduce((s,w,i)=>s+w.coldLoads-before.workers[i].coldLoads,0),saves:after.workers.reduce((s,w,i)=>s+w.saves-before.workers[i].saves,0),diagnostics:after};
    results.push(result);console.log(JSON.stringify({repeat,workers:count,battles:n,phasesMs:phases,missed1400ms:result.missed1400ms,nativeRssBytes:result.nativeRssBytes,nodeRssBytes:result.nodeRssBytes}));
    if(adventure)results.push(await adventureBurst(world,brains,actors.slice(0,n),{repeat,workers:count,rounds,roomGroupSize}));
   }
   await brains.close();brains=null;
  }
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({sourceHashes,host:{cpus:cpus().length,loadavg:loadavg(),freeMemoryBytes:freemem(),totalMemoryBytes:totalmem()},deadlineMs:1400,repeats,protocol:'Real PostgreSQL BattleBrains, independent authenticated owners, persistent workers; three synchronized continuing-decision bursts. Queue included; birth separate. No sockets/Adventure tick capacity claim.',results},null,2)+'\n');
 }finally{await brains?.close();await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
// Real Adventure tick/serialization, owner motors, pet motors, enemies and DB saves.
// In-memory multiplayer transport is deliberately scoped: this is not socket CCU.
async function adventureBurst(world,brains,actors,{repeat,workers,rounds,roomGroupSize}){
 const game=new AdventureService(world,{brains});
 const players=new Map(),rooms=new Map();let unavailable=0,presented=0;
 for(const [i,a] of actors.entries()){
  const arena=new ServerArena({...scenario(1000,i),geometry:'open',distance:40,ownerHp:1,petHp:1});
  const p={...arena.p,userId:a.user,room:'tail-'+Math.floor(i/roomGroupSize),companion:{...arena.p.companion,id:a.id}};
  const s=arena.s;s.activePet=a.id;s.target='enemy-'+i;arena.m.id=s.target;s.savedAt=world.now();s.petDecisionAt=0;
  // Prevent deaths ending the measured fixture; all motors and enemy stages still run.
  arena.m.hp=arena.m.maxHp=100000;arena.m.attackAt=Infinity;
  players.set(a.user,p);if(!rooms.has(p.room)){rooms.set(p.room,{players:new Map()});game.instances.set(p.room,{roomId:'yard',mobs:new Map()});}
  rooms.get(p.room).players.set(a.user,p);game.states.set(a.user,s);game.instances.get(p.room).mobs.set(s.target,arena.m);
 }
 game.multiplayer={store:{players,rooms},send(_p,type,answer){if(type==='battleDecision'){presented++;unavailable+=Number(!!answer.unavailable);}},broadcast(){}};
 const motors=[];let tickStart=0;const petAction=game.petAction.bind(game);game.petAction=async(...args)=>{const result=await petAction(...args);motors.push(performance.now()-tickStart);return result;};
 const ticks=[],cpu=process.cpuUsage(),before=brains.workers.diagnostics(),at=performance.now();
 const loop=monitorEventLoopDelay({resolution:10});loop.enable();brains.samples=[];
 let poolWaitingMax=0,poolBusyMax=0;
 const poll=setInterval(()=>{poolWaitingMax=Math.max(poolWaitingMax,world.pool.waitingCount);poolBusyMax=Math.max(poolBusyMax,world.pool.totalCount-world.pool.idleCount);},5);
 try{
  for(let r=0;r<rounds;r++){
   for(const s of game.states.values())s.petDecisionAt=0;
   const start=performance.now();tickStart=start;await game.serialize(()=>game.tick());ticks.push(performance.now()-start);
  }
 }finally{clearInterval(poll);loop.disable();}
 const after=brains.workers.diagnostics(),nodeCpu=process.cpuUsage(cpu),phases={};
 for(const key of ['endToEnd','queue','service','ipc','transport','load','step','save','host','db'])phases[key]=distribution(brains.samples.map(s=>s[key]));
 return {kind:'Adventure',roomGroupSize,repeat,workers,battles:actors.length,rounds,elapsedMs:performance.now()-at,tickMs:distribution(ticks),motorLatencyMs:distribution(motors),motorMissed1400ms:motors.filter(x=>x>1400).length,phasesMs:phases,decisionSamples:brains.samples.length,missed1400ms:brains.samples.filter(s=>s.endToEnd>1400).length,unavailable,presented,lastError:game.lastError,poolWaitingMax,poolBusyMax,eventLoopMaxMs:loop.max/1e6,nodeCpuSeconds:(nodeCpu.user+nodeCpu.system)/1e6,nativeCpuSeconds:after.workers.reduce((n,w,i)=>n+w.cpuSeconds-before.workers[i].cpuSeconds,0),nativeRssBytes:after.workers.reduce((n,w)=>n+w.rssBytes,0),nodeRssBytes:process.memoryUsage().rss,diagnostics:after};
}
if(import.meta.url===`file://${process.argv[1]}`){const o=args({output:'runs/battle-scaling.json',workers:'1,2,4,8',sizes:'10,25,50,100,150',rounds:3,repeats:2,adventure:'false',roomGroupSize:1});await benchmark(o.output,{workers:o.workers.split(',').map(Number),sizes:o.sizes.split(',').map(Number),rounds:o.rounds,repeats:Number(o.repeats),adventure:String(o.adventure)==='true',roomGroupSize:Number(o.roomGroupSize)});}
