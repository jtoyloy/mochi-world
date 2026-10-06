import {clamp} from './trading.js';
export const newPersonality=()=>({confidence:50,stress:15,curiosity:60,lastInteraction:{},sleepUntil:0,lastUpdatedAt:Date.now()});
export function petStats(world,p){const n=world.m.needs;return {Happiness:clamp(1-(n.hunger+n.thirst+n.boredom+n.lonely)/4)*100,Energy:(1-n.fatigue)*100,Fullness:(1-n.hunger)*100,Confidence:clamp(p.confidence,0,100),Stress:clamp(p.stress+(n.hunger+n.fatigue+n.lonely)*10,0,100),Curiosity:clamp(p.curiosity,0,100)};}
export function updatePersonality(world,p,now=Date.now()){const hours=clamp((now-p.lastUpdatedAt)/3600000,0,24);p.confidence+= (50-p.confidence)*Math.min(.1,hours*.01);p.stress=clamp(p.stress-hours*(world.m.asleep?8:2),0,100);p.lastUpdatedAt=now;}
export function interact(world,p,kind,item,now=Date.now()) {
  if(now-(p.lastInteraction[kind]??0)<5000)return false;
  const n=world.m.needs;
  if(kind==='feed'){n.hunger=clamp(n.hunger-({plain:.22,strawberry:.28,sushi:.35,ramen:.4}[item]??.22));world.m.rewardAcc+=.12;}
  else if(kind==='pet'){world.praise();p.stress=clamp(p.stress-2,0,100);}
  else if(kind==='play'){if(item==='plushie'){n.lonely=clamp(n.lonely-.2);p.stress=clamp(p.stress-4,0,100);}else{n.boredom=clamp(n.boredom-(item==='puzzle'?.25:.35));n.fatigue=clamp(n.fatigue+.03);if(item==='puzzle')p.curiosity=clamp(p.curiosity+1,0,100);else world.spawnToy('ball',world.m.x+45,world.m.y+30);}world.m.rewardAcc+=.12;}
  else if(kind==='sleep'){p.sleepUntil=now+60000;world.m.asleep=true;world.setAction(10);}
  p.lastInteraction[kind]=now;return true;
}
export function applyTradeMood(p,pnl){if(!pnl)return;p.confidence=clamp(p.confidence+(pnl>0?.5:-.5),0,100);p.stress=clamp(p.stress+(pnl>0?-1:2),0,100);}
