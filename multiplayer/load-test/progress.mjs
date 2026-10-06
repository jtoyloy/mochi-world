import {readdir,open,stat,statfs} from 'node:fs/promises';
// Inspect only the newest window, avoiding repeatedly parsing growing soak logs.
const files=(await readdir('data')).filter(x=>x.endsWith('-windows.jsonl'));
const candidates=await Promise.all(files.map(async file=>({file,...await stat('data/'+file)})));
const latest=candidates.sort((a,b)=>b.mtimeMs-a.mtimeMs)[0];let x;
if(latest?.size){const handle=await open('data/'+latest.file,'r');const n=Math.min(latest.size,131072),buffer=Buffer.alloc(n);await handle.read(buffer,0,n,latest.size-n);await handle.close();const lines=buffer.toString().trim().split('\n');for(const line of lines.reverse()){try{x=JSON.parse(line);break;}catch{}}}
const disk=await statfs('.');
console.log(JSON.stringify({at:new Date().toISOString(),file:latest?.file,players:x?.players,sockets:x?.connections,tickMaxMs:x?.timings.tickDurationMs?.max,eventLoopP99Ms:x?.eventLoopP99Ms,windowRejections:x?.rejections?.length,checkpointBytes:x?.checkpoints?.totalBytes,created:x?.checkpoints?.checkpointsCreatedLastHour,deleted:x?.checkpoints?.checkpointsDeletedLastHour,gcFailures:x?.checkpoints?.gcFailures,freeGiB:Number(disk.bavail)*Number(disk.bsize)/2**30}));
