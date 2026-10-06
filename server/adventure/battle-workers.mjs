import { performance } from 'node:perf_hooks';
import { BrainProcess } from '../../sim/brain_proc.mjs';

const positive = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw Error(`Invalid ${name}`);
  return value;
};
export class BattleWorkers {
  constructor({ count = Number(process.env.BATTLE_WORKERS ?? 2), maxPending = Number(process.env.BATTLE_QUEUE_LIMIT ?? 256), maxResidents = Number(process.env.BATTLE_RESIDENT_LIMIT ?? 64), idleSeconds = Number(process.env.BATTLE_IDLE_SECONDS ?? 300), timeoutMs = 10000, hostFactory = () => new BrainProcess({module:'mochi.battle_worker', timeoutMs}) } = {}) {
    this.maxPending=positive(maxPending,'queue limit'); this.maxResidents=positive(maxResidents,'resident limit');this.idleSeconds=positive(idleSeconds,'idle seconds');
    this.slots=Array.from({length:positive(count,'worker count')},()=>({tail:Promise.resolve(),pending:0,generation:0,host:null}));
    this.hostFactory=hostFactory;this.affinity=new Map();this.brains=new Map();this.pending=0;this.restarts=0;this.errors=0;this.rejected=0;this.closed=false;
  }
  async host(slot) {
    if(slot.host && (slot.host.child?.exitCode != null || slot.host.child?.signalCode != null || slot.host.failedError || slot.host.child?.killed)) {slot.host.close();slot.host=null;this.restarts++;}
    if(!slot.host){slot.host=this.hostFactory();slot.generation++;try {await slot.host.call({op:'ready'});}catch(error){slot.host.close();slot.host=null;this.errors++;throw error;}}
    return slot.host;
  }
  async ready(){try {await Promise.all(this.slots.map(slot=>this.host(slot)));}catch(error){await this.close();throw error;}}
  run(id, fn, {deadlineAt=Infinity}={}) {
    if(this.closed || this.pending>=this.maxPending){this.rejected++;return Promise.reject(Error('Battle worker queue unavailable'));}
    this.pending++;
    const submitted=performance.now(),prior=this.brains.get(id)??Promise.resolve();
    const result=prior.catch(()=>{}).then(()=>{
      let slot=this.affinity.get(id);
      if(!slot){
        for(const [key] of this.affinity){if(this.affinity.size<this.slots.length*this.maxResidents)break;if(!this.brains.has(key))this.affinity.delete(key);}
        const score=s=>s.pending*100000+[...this.affinity.values()].filter(v=>v===s).length;
        slot=this.slots.reduce((a,b)=>score(a)<=score(b)?a:b);this.affinity.set(id,slot);}
      slot.pending++;
      const task=slot.tail.then(async()=>{
        if(Date.now()>deadlineAt){this.rejected++;throw Error('Battle decision deadline expired before execution');}
        const host=await this.host(slot),generation=slot.generation;
        const call=async message=>{
          const response=await host.call({...message,maxResidents:this.maxResidents,idleSeconds:this.idleSeconds});
          if(slot.generation!==generation || slot.host!==host) throw Error('Stale battle worker generation');
          slot.stats=response;return response;
        };
        try{return await fn(call,{queue:performance.now()-submitted,generation});}
        catch(error){host.close();slot.host=null;this.errors++;this.restarts++;throw error;}
      }).finally(()=>{slot.pending--;});
      slot.tail=task.catch(()=>{});return task;
    }).finally(()=>{this.pending--;if(this.brains.get(id)===result)this.brains.delete(id);});
    this.brains.set(id,result);return result;
  }
  diagnostics(){return {pending:this.pending,limit:this.maxPending,restarts:this.restarts,errors:this.errors,rejected:this.rejected,workers:this.slots.map(s=>({pid:s.host?.child?.pid,healthy:!!s.host && !s.host.failedError && !s.host.child?.killed && s.host.child?.exitCode == null && s.host.child?.signalCode == null,generation:s.generation,pending:s.pending,residents:s.stats?.residents??0,coldLoads:s.stats?.coldLoads??0,saves:s.stats?.saves??0,rssBytes:s.stats?.rssBytes??0,cpuSeconds:s.stats?.cpuSeconds??0}))};}
  async close(){
    this.closed=true;
    await Promise.allSettled([...this.brains.values()]);
    await Promise.all(this.slots.map(async slot=>{
      const host=slot.host,child=host?.child;
      if(!host)return;
      host.close();
      if(!child || child.exitCode!==null || child.signalCode!==null)return;
      await new Promise(resolve=>{
        const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
        child.once('exit',()=>{clearTimeout(timer);resolve();});
      });
    }));
    this.affinity.clear();
  }
}
