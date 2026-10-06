/** Deterministic driver of AdventureService physical stages, not a second combat engine. */
import { AdventureService, petBattleAbility } from '../server/adventure/service.mjs';
import { battleObservation, battleReward, BATTLE_ACTIONS, MOB_DEFINITIONS, MOCHI_ABILITIES, combatStats, damage } from '../web/js/game/adventure.js';
import { validSegment, walkable } from '../web/js/game/model.js';
import { traverse } from '../web/js/game/locomotion/core.js';

export function seeded(seed) {
  let state=seed>>>0;
  return ()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clip=(n)=>Math.max(0,Math.min(1,n));

export function scenario(seed,index,phase='training') {
  const rng=seeded(seed*65537+index*1009);
  const pick=(values)=>values[Math.floor(rng()*values.length)];
  const shifted=phase==='evaluation';
  return {seed:seed*65537+index*1009,phase,index,type:pick(['slime','boar','thornling']),
    distance:pick([40,140,260]),ownerHp:pick(shifted?[.85,.23]:[1,.4]),petHp:pick(shifted?[.85,.23]:[1,.4]),
    cooldown:pick([0,5000]),pressure:pick(['owner','pet']),geometry:pick(['open','obstacle']),species:pick(['moon','forest']),
    jitter:shifted?(rng()-.5)*40:(rng()-.5)*10,statScale:shifted?pick([.85,1.15]):1,
    latency:pick([0,200,800]),obstacleShift:shifted};
}

export function expandedObservation(s,p,m,now) {
  const pet=p.companion, ability=petBattleAbility(pet);
  const d=distance(pet,m)||1, path=pet.motorPath??[];
  return [...battleObservation({...s,now},p,m,pet),
    clip(((s.ownerGuardUntil??0)-now)/1800),clip(((s.petGuardUntil??0)-now)/1800),
    clip((m.attackAt-now)/1600),clip(distance(p,m)/400),ability.range/400,
    Number(validSegment(p.roomId,pet.x,pet.y,m.x,m.y)),
    clip(path.reduce((sum,q,i)=>sum+distance(i?path[i-1]:pet,q),0)/65),
    clip(((s.cooldowns.attack??0)-now)/2000),(1+(m.x-pet.x)/d)/2,(1+(m.y-pet.y)/d)/2];
}
export function rewardFor(arm,outcome) {
  const base=battleReward(outcome);
  if (['no_protection','causal','expanded_causal'].includes(arm)) return Math.max(-1,Math.min(1,base-(outcome.protection??0)/90));
  if (arm==='terminal') return Math.max(-1,Math.min(1,base+(outcome.victory?.25:0)-(outcome.ownerDefeated?.6:0)-(outcome.petExhausted?.25:0)));
  return base;
}
export function referenceAction(arena) {
  const {s,p,m,now}=arena,pet=p.companion,d=distance(pet,m),ability=petBattleAbility(pet);
  // Disclosed privileged reference only. Never called for Cadence.
  if (s.hp<20 && m.attackAt<=now+400 && distance(p,m)<=m.range && (s.ownerGuardUntil??0)<=now) return 1;
  if (s.petHp<15 && m.attackAt<=now+400 && d<=m.range && (s.petGuardUntil??0)<=now) return 2;
  if (!validSegment(p.roomId,pet.x,pet.y,m.x,m.y)) return 4;
  if (d<=ability.range && (s.petSpecialAt??0)<=now) return 3;
  return d<=100?0:4;
}

export class ServerArena {
  constructor(config,{timing='production-blocked',trace=false}={}) {
    this.config=config;this.now=10000;this.started=this.now;this.timing=timing;this.trace=trace;
    this.random=seeded(config.seed);this.policyRandom=seeded(config.seed^0xCADA);this.events=[];this.credits=[];this.guards={};this.ledger=new Map();this.eventId=0;
    const geometry=config.geometry==='obstacle';
    // Use existing Yard trees. Held-out approaches another existing collider.
    const anchor=geometry?(config.obstacleShift?{x:1040,y:190}:{x:110,y:210}):{x:600,y:400};
    const pet={x:anchor.x+10,y:anchor.y+(geometry?35:0),profile:{variant:config.species==='forest'?'Woodland Deer Mint':'Moonfox'},id:'pet',motorPath:[]};
    this.p={userId:'owner',roomId:'yard',room:'arena',x:anchor.x,y:anchor.y,companion:pet};
    const stats=combatStats({weapon:'basic-sword'},1);
    this.s={hp:stats.maxHp*config.ownerHp,mp:stats.maxMp,petHp:80*config.petHp,stats,
      equipment:{weapon:'basic-sword'},xp:{combat:0},cooldowns:{},outcome:{},target:'enemy',activePet:'pet',
      inBattle:true,enemyCount:1,ownerDamage:0,petDamage:0,damageDealt:0,nearbyAllies:0,
      petSpecialAt:this.now+config.cooldown,now:this.now,progress:{}};
    // Far starts point toward room interior to remain inside walkable bounds.
    const sign=anchor.x>900?-1:1;
    const x=anchor.x+sign*config.distance+config.jitter;
    this.m={...structuredClone(MOB_DEFINITIONS[config.type]),type:config.type,id:'enemy',
      maxHp:MOB_DEFINITIONS[config.type].health*config.statScale,hp:MOB_DEFINITIONS[config.type].health*config.statScale,
      damage:MOB_DEFINITIONS[config.type].damage*config.statScale,x,y:anchor.y+(geometry&&config.distance===40?65:0),
      home:{x,y:anchor.y},target:'owner',state:'CHASE',contributors:{},attackAt:this.now,
      zone:{respawnMinSeconds:60,respawnMaxSeconds:60}};
    if (!walkable('yard',this.p.x,this.p.y)||!walkable('yard',pet.x,pet.y)||!walkable('yard',this.m.x,this.m.y)) throw new Error('invalid predeclared scenario placement');
    this.metrics={wins:0,defeats:0,timeouts:0,ownerSurvival:0,petSurvival:0,ownerHp:0,petHp:0,
      petDamageDealt:0,ownerDamageDealt:0,ownerDamage:0,petDamage:0,protection:0,causalProtection:0,delayedProtection:0,
      wasted:0,invalidAttack:0,invalidSpecial:0,staleAttack:0,staleSpecial:0,pathFailures:0,
      specials:0,specialDamage:0,guardActions:0,decisions:0,refused:0,discardedResponses:0,
      latencyOutcomeDropped:0,latencyRewardDropped:0,latencyMs:[],enemyDisplacement:[],petDisplacement:[],actions:Array(7).fill(0),reward:0,timeMs:0,killMs:null};
    const service={now:()=>this.now,pool:{},transaction:async(_ids,fn)=>fn({query:async()=>({rowCount:1,rows:[]})}),inventory:async()=>{}};
    this.game=new AdventureService(service,{random:()=>this.random(),brains:{close(){}},rewards:{}});
    this.game.states.set('owner',this.s);
    const room={roomId:'yard',mobs:new Map([['enemy',this.m]])};this.game.instances.set('arena',room);
    this.game.multiplayer={store:{players:new Map([['owner',this.p]]),rooms:new Map([['arena',{players:new Map([['owner',this.p]])}]])},
      send:()=>{},broadcast:()=>{},join:async()=>{this.p.roomId='town';this.metrics.defeats=1;}};
    this.game.save=async()=>{};this.game.progress=async()=>{};this.game.publicRoom=()=>({});
    this.game.effect=(_p,name,event)=>this.effect(name,event);
    const originalHit=this.game.hit.bind(this.game);
    this.game.hit=async(p,s,m,amount,pet=false)=>{
      const before=m.hp;await originalHit(p,s,m,amount,pet);
      const dealt=before-m.hp;this.metrics[pet?'petDamageDealt':'ownerDamageDealt']+=dealt;
      if(pet && this.executing?.action===3)this.metrics.specialDamage+=dealt;
      if(m.hp===0){this.metrics.wins=1;this.metrics.killMs=this.now-this.started;}
    };
    // Controlled pressure uses the existing injectable RNG for the target draw.
    // Loot/respawn draws retain seeded RNG. The target remains conditional on range.
    const originalEnemies=this.game.advanceEnemies.bind(this.game);
    this.advanceEnemies=async(now,dt)=>{
      const originalRandom=this.game.random;
      this.game.random=()=>this.config.pressure==='pet'?.1:.9;
      this.enemyClock=now;
      try {await originalEnemies(now,dt);}finally{this.game.random=originalRandom;}
    };
  }
  get terminal(){return !!(this.metrics.wins||this.metrics.defeats);}
  obs(expanded=false){this.s.now=this.now;return expanded?expandedObservation(this.s,this.p,this.m,this.now):battleObservation(this.s,this.p,this.m,this.p.companion);}
  effect(name,e={}) {
    if(name!=='mob-hit')return;
    if(e.poison){this.metrics.ownerDamage+=e.amount;return;}
    const pet=!!e.pet, key=pet?'pet':'owner';this.metrics[pet?'petDamage':'ownerDamage']+=e.amount;
    const guard=this.guards[key],active=(pet?this.s.petGuardUntil:this.s.ownerGuardUntil)>(this.enemyClock??this.now);
    if(active){
      const raw=damage(this.m.damage,pet?2:this.s.stats.defense+(this.s.shieldUntil>this.now?8:0),1);
      const avoided=Math.max(0,raw-e.amount);
      this.metrics.protection+=Math.max(0,this.m.damage-e.amount);
      if(guard && avoided>0){
        const delayed=guard.id!==this.lastActionId;
        this.metrics.causalProtection+=avoided;this.metrics.delayedProtection+=delayed?avoided:0;
        const event={eventId:++this.eventId,decisionId:guard.id,reward:Math.min(1,avoided/90)};
        this.credits.push(event);
        if(this.trace)this.events.push({at:this.now,type:'protection',...event,delayed,lastActionId:this.lastActionId,avoided});
      }
    }
  }
  async motion(dt=.1) {
    const pet=this.p.companion;
    if(this.s.petHp>0 && !this.terminal && pet.motorPath?.length){
      const result=traverse(pet,pet.motorPath,165*Math.min(dt,.25),(a,b)=>validSegment('yard',a.x,a.y,b.x,b.y));
      if(!result.moved && result.remaining)this.metrics.pathFailures++;
    }
  }
  valid(action) {
    const pet=this.p.companion;
    if(this.terminal||this.s.petHp<=0)return false;
    if(action===0||action===3)return distance(pet,this.m)<=(action===0?100:petBattleAbility(pet).range)&&validSegment('yard',pet.x,pet.y,this.m.x,this.m.y)&&(action!==3||(this.s.petSpecialAt??0)<=this.now);
    if(action===4||action===5){const d=distance(pet,this.m)||1,sign=action===4?1:-1,q={x:pet.x+(this.m.x-pet.x)/d*65*sign,y:pet.y+(this.m.y-pet.y)/d*65*sign};return walkable('yard',q.x,q.y)&&validSegment('yard',pet.x,pet.y,q.x,q.y)&&distance(q,this.p)<350;}
    return true;
  }
  async execute(request,host,frozen) {
    if(this.terminal||this.s.petHp<=0){this.metrics.discardedResponses++;if(host)await host.call({op:'cancel',frozen,reward:frozen?0:battleReward(this.s.outcome),credits:frozen?[]:this.credits.splice(0)});return;}
    const {action,id}=request;
    // Production clears the shared window after awaiting its response. Concurrent
    // stress events during that wait are dropped, never rewarded as the new action.
    if(Object.keys(this.s.outcome).length){this.metrics.latencyOutcomeDropped++;this.metrics.latencyRewardDropped+=battleReward(this.s.outcome);this.s.outcome={};}
    this.executing=request;this.lastActionId=id;
    this.metrics.actions[action]++;this.metrics.decisions++;
    this.metrics.latencyMs.push(this.now-request.at);
    this.metrics.enemyDisplacement.push(distance(this.m,request.enemy));this.metrics.petDisplacement.push(distance(this.p.companion,request.pet));
    const valid=this.valid(action);
    if(!valid){
      this.metrics.wasted++;
      if(action===0||action===3){this.metrics[action===0?'invalidAttack':'invalidSpecial']++;if(request.valid)this.metrics[action===0?'staleAttack':'staleSpecial']++;}
      if(action===4||action===5)this.metrics.pathFailures++;
    }
    if(action===1||action===2)this.metrics.guardActions++;
    const beforeSpecial=this.s.petSpecialAt;
    await this.game.petAction(this.p,this.s,this.m,BATTLE_ACTIONS[action]);
    if(action===1)this.guards.owner={id,at:this.now};
    if(action===2)this.guards.pet={id,at:this.now};
    if(action===3&&this.s.petSpecialAt!==beforeSpecial){this.metrics.specials++;if(MOCHI_ABILITIES[this.config.species].guardMs)this.guards.owner={id,at:this.now};}
    if(host)await host.call({op:'executed',decisionId:id});
    if(this.trace)this.events.push({type:'action',at:this.now,id,action,valid,obsAt:request.at});
    this.executing=null;
  }
  async run({arm,host=null,frozen=false,latency=this.config.latency,maxMs=60000}) {
    const expanded=arm.includes('expanded');let pending=null,nextDecision=this.now,lastAdventure=this.now-400,id=0;
    const causal=arm==='causal'||arm==='expanded_causal';
    const dispatch=async(dt)=>{
      const outcome=this.s.outcome;this.s.outcome={};this.metrics.reward+=battleReward(outcome);
      const obs=this.obs(expanded),at=this.now,enemy={x:this.m.x,y:this.m.y},pet={x:this.p.companion.x,y:this.p.companion.y};
      let action,decisionId;
      if(arm==='random'){action=Math.floor(this.policyRandom()*7);decisionId=++id;}
      else if(arm==='mother'){action=referenceAction(this);decisionId=++id;}
      else {
        const result=await host.call({op:'tick',obs,reward:frozen?0:rewardFor(arm,outcome),frozen,credits:causal&&!frozen?this.credits.splice(0):[]});
        if(result.refused){this.metrics.refused++;return null;}action=result.action[0];decisionId=result.decisionId;
      }
      this.s.ownerDamage=0;this.s.petDamage=0;this.s.damageDealt=0;
      const request={action,id:decisionId,at,enemy,pet,dt,due:at+latency,valid:this.valid(action)};
      this.ledger.set(decisionId,{obs,action,at});nextDecision=at+1400;
      return request;
    };
    while(!this.terminal && this.now-this.started<maxMs){
      await this.motion();
      if(pending && this.now>=pending.due){
        await this.execute(pending,host,frozen);
        if(this.timing==='production-blocked'&&!this.terminal)await this.advanceEnemies(pending.at,pending.dt);
        pending=null;
      }
      if(this.terminal)break;
      if((this.now-this.started)%400===0){
        if(!pending){
          const dt=Math.min(.6,(this.now-lastAdventure)/1000);lastAdventure=this.now;
          await this.game.advancePoison(this.p,this.s,this.now);
          if(!this.terminal)await this.game.ownerAttack(this.p,this.s,this.m,this.now);
          if(this.terminal)break;
          if(this.s.petHp>0 && this.now>=nextDecision){
            pending=await dispatch(dt);
            if(pending && latency===0){await this.execute(pending,host,frozen);pending=null;}
          }
          if(!pending&&!this.terminal)await this.advanceEnemies(this.now,dt);
        }else if(this.timing==='continuing'){
          await this.game.advancePoison(this.p,this.s,this.now);
          if(!this.terminal)await this.game.ownerAttack(this.p,this.s,this.m,this.now);
          if(!this.terminal)await this.advanceEnemies(this.now,.4);
        }
      }
      this.now+=100;
    }
    if(pending)this.metrics.discardedResponses++;
    this.metrics.timeouts=Number(!this.terminal);this.metrics.timeMs=this.now-this.started;
    this.metrics.ownerSurvival=Number(!this.metrics.defeats);this.metrics.petSurvival=Number(this.s.petHp>0);
    this.metrics.ownerHp=this.metrics.defeats?0:this.s.hp;this.metrics.petHp=this.s.petHp;
    this.metrics.reward+=battleReward(this.s.outcome);
    if(host)await host.call({op:pending?'cancel':'finish',obs:this.obs(expanded),reward:frozen?0:rewardFor(arm,this.s.outcome),frozen,credits:causal&&!frozen?this.credits.splice(0):[]});
    return {scenario:this.config,...this.metrics,...(this.trace?{events:this.events}:{})};
  }
}
