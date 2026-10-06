/** Experimental motors and observation diagnostics; combat remains AdventureService. */
import { ServerArena, distance, scenario } from './server_battle.mjs';
import { petBattleAbility } from '../server/adventure/service.mjs';
import { NavigationService } from '../web/js/game/NavigationService.js';
import { validSegment, walkable } from '../web/js/game/model.js';

export const MOTOR_V1='short-hop-v1', MOTOR_V2='approach-target-v2';
export function shapedReward(reward,invalid){return Math.max(-1,Math.min(1,reward-.24*invalid));}
export function curriculum(config,index){
 const c={...config},stage=Math.min(5,Math.floor(index/10));
 if(stage<4){c.geometry='open';c.distance=[40,140,260,260][stage];c.cooldown=stage<3?0:c.cooldown;}
 if(stage===4)c.geometry='obstacle';
 return c;
}
export class ActionArena extends ServerArena {
 constructor(config,{arm='published',...options}={}){
  super(config,options);this.arm=arm;this.body=arm==='persistent'?MOTOR_V2:MOTOR_V1;
  this.nav=new NavigationService('yard');this.recent=[];this.streak=0;this.invalidOwed=0;
  Object.assign(this.metrics,{decisionDetails:[],movingMs:0,approaches:0,attackAfterApproach:0,firstValidAttackMs:null,maxInvalidStreak:0,motorStops:{},shapedReward:0});
  if(config.ownerScale!==undefined){const hit=this.game.hit.bind(this.game);this.game.hit=(p,s,m,amount,pet=false)=>hit(p,s,m,pet?amount:amount*config.ownerScale,pet);}
  const petAction=this.game.petAction.bind(this.game);
  this.game.petAction=async(p,s,m,action)=>{
   if(action!=='MOVE_CLOSER'||this.body===MOTOR_V1)return petAction(p,s,m,action);
   const path=this.approachPath();
   if(!path){s.outcome.wasted=true;return;}
   if(this.valid(0)){this.stopMotor('already-close');return;}
   p.companion.motorPath=path;this.motor={id:m.id,target:{x:m.x,y:m.y},at:this.now};p.companion.state=action;
  };
 }
 approachPath(){
  const pet=this.p.companion;
  const path=this.nav.findPath(pet,this.m);
  return path?.length&&path.every(q=>distance(q,this.p)<350)?path:null;
 }
 physical(action){
  const pet=this.p.companion,ability=petBattleAbility(pet),d=distance(pet,this.m),range=action===3?ability.range:100;
  const cooldownMs=Math.max(0,(this.s.petSpecialAt??0)-this.now),los=validSegment('yard',pet.x,pet.y,this.m.x,this.m.y),reasons=[];
  if(this.terminal||!this.s.target||this.m.hp<=0)reasons.push('no-target');
  if(this.s.petHp<=0)reasons.push('pet-exhausted');
  if(action===0||action===3){if(d>range)reasons.push('out-of-range');if(!los)reasons.push('blocked-line');if(action===3&&cooldownMs>0)reasons.push('cooldown');if(action===3&&!ability)reasons.push('unavailable-species-action');}
  let pathReason=null;
  if(action===4||action===5){
   if(action===4&&this.body===MOTOR_V2){if(!this.approachPath()){reasons.push('no-valid-path');pathReason='no-valid-path';}}
   else{const sign=action===4?1:-1,n=d||1,q={x:pet.x+(this.m.x-pet.x)/n*65*sign,y:pet.y+(this.m.y-pet.y)/n*65*sign};
    if(!walkable('yard',q.x,q.y)||!validSegment('yard',pet.x,pet.y,q.x,q.y)){reasons.push('blocked');pathReason='blocked';}
    if(distance(q,this.p)>=350){reasons.push('owner-tether');pathReason='owner-tether';}}
  }
  return {executable:reasons.length===0,reasons:reasons.length?reasons:['valid'],distance:d,distanceToThreshold:d-range,cooldownMs,pathReason,
   alreadyClose:action===4&&d<=100&&los,ownerGuardMs:Math.max(0,(this.s.ownerGuardUntil??0)-this.now),petGuardMs:Math.max(0,(this.s.petGuardUntil??0)-this.now)};
 }
 valid(action){return this.physical(action).executable;}
 obs(){
  const expanded=this.arm.includes('expanded'),base=super.obs(expanded);
  this.observed=Array.from({length:7},(_,i)=>this.physical(i));
  if(!['published','expanded','random','mother'].includes(this.arm))base.push(Number(this.observed[0].executable),Number(this.observed[3].executable),Number(this.observed[4].executable&&!this.observed[4].alreadyClose));
  return base;
 }
 stopMotor(reason){if(this.motor){this.metrics.motorStops[reason]=(this.metrics.motorStops[reason]??0)+1;this.motor=null;this.p.companion.motorPath=[];}}
 async motion(dt=.1){
  if(this.motor){
   let reason=null;
   if(this.terminal||this.s.petHp<=0)reason='terminal';
   else if(this.s.target!==this.motor.id||distance(this.m,this.motor.target)>40)reason='target-changed';
   else if(this.valid(0))reason='in-range';
   else if(this.now-this.motor.at>=2800)reason='duration';
   else if(!this.p.companion.motorPath.length)reason='path-ended';
   else {const pet=this.p.companion,q=pet.motorPath[0];if(!validSegment('yard',pet.x,pet.y,q.x,q.y)||distance(q,this.p)>=350)reason='path-failure';}
   if(reason)this.stopMotor(reason);
  }
  const before={...this.p.companion},failures=this.metrics.pathFailures;
  await super.motion(dt);
  if(distance(before,this.p.companion)>0)this.metrics.movingMs+=dt*1000;
  if(this.motor&&this.metrics.pathFailures>failures)this.stopMotor('path-failure');
  if(this.motor&&this.valid(0))this.stopMotor('in-range');
 }
 async execute(request,host,frozen){
  const obs=this.observed[request.action],execution=this.physical(request.action),before=this.metrics.decisions;
  await super.execute(request,host,frozen);
  if(this.metrics.decisions===before)return;
  const invalid=!execution.executable;
  this.streak=invalid?this.streak+1:0;this.metrics.maxInvalidStreak=Math.max(this.metrics.maxInvalidStreak,this.streak);
  if(invalid)this.invalidOwed++;
  if(request.action===4)this.metrics.approaches++;
  if(request.action===0&&execution.executable){if(this.metrics.firstValidAttackMs===null)this.metrics.firstValidAttackMs=this.now-this.started;if(this.lastApproach)this.metrics.attackAfterApproach++;this.lastApproach=false;}
  if(request.action===4&&execution.executable)this.lastApproach=true;
  this.metrics.decisionDetails.push({action:request.action,at:request.at,executedAt:this.now,observation:obs,execution,stale:obs.executable&&!execution.executable,recentInvalid:this.recent.filter(r=>r.invalid),invalidStreak:this.streak,policy:this.lastPolicy??null});
  this.recent.push({action:request.action,invalid});this.recent=this.recent.slice(-8);
 }
 async run(options){
  const original=options.host;
  const host=original?{call:async message=>{
   if(message.op==='tick'){this.stopMotor('next-decision');}
   if(['tick','finish','cancel'].includes(message.op)){
    const reward=!message.frozen&&['penalty'].includes(this.arm)?shapedReward(message.reward,this.invalidOwed):message.reward;
    this.metrics.shapedReward+=reward;this.invalidOwed=0;message={...message,reward};
   }
   const response=await original.call(message);
   if(message.op==='tick')this.lastPolicy=response.policy;
   return response;
  }}:null;
  return super.run({...options,host});
 }
}
