import {spawn,execFileSync} from 'node:child_process';import {open,writeFile,statfs,mkdir,rm} from 'node:fs/promises';
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
await mkdir('data',{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','data/ccu-tls.key','-out','data/ccu-tls.crt','-subj','/CN=127.0.0.1','-days','1'],{stdio:'ignore'});
const stages=[
 ['stage10',10,300],['stage40',40,300],['stage75',75,600],['stage150',150,1800],
 ...[50,100,200].map(rtt=>['wan'+rtt,40,60,['--rtt='+rtt]]),
 ['wan-jitter',40,60,['--rtt=100','--jitter=25']],['wan-loss',40,60,['--rtt=100','--loss=.01']],['wan-burst',40,60,['--rtt=100','--burst=true']],
 ...[50,75,100].map(n=>['crowd'+n,n,60,['--rooms=town','--capacity='+n]]),
 ['tls-direct',40,60],['tls-proxy',40,60,['--origin=https://127.0.0.1:8899']],
 ['mixed-exercise',10,60,['--exercise=true','--rooms=town']],
 ['crowd50-audited',50,60,['--rooms=town','--capacity=50','--reconnect=.02']],
];
const results=[];let stopping=false,child;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child?.kill(signal);});
for(const [label,users,seconds,extra=[]] of stages){
 const disk=await statfs('.');if(stopping||Number(disk.bavail)*Number(disk.bsize)<3*2**30){results.push({label,skipped:'disk floor or interrupt'});break;}
 console.log(JSON.stringify({starting:label,users,seconds,at:new Date().toISOString()}));
 let proxy; if(label==='tls-proxy') { proxy=spawn(process.execPath,['multiplayer/load-test/tls-proxy.mjs','data/ccu-tls.key','data/ccu-tls.crt'],{stdio:'ignore'}); await new Promise(r=>setTimeout(r,500)); }
 const log=await open('/tmp/ccu-'+label+'.log','w');
 const code=await new Promise(resolve=>{child=spawn(process.execPath,['multiplayer/load-test/soak.mjs',`--users=${users}`,`--seconds=${seconds}`,`--label=${label}`,...extra],{env:process.env,stdio:['ignore',log.fd,log.fd]});child.on('exit',resolve);});await log.close();proxy?.kill('SIGTERM');
 results.push({label,users,seconds,code});await writeFile('data/ccu-stage-progress.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
}

await rm('data/ccu-tls.key',{force:true});await rm('data/ccu-tls.crt',{force:true});
