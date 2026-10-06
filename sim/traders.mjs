// Accelerated replay through the actual Cadence host, never a scripted trader.
import {mkdir,readFile} from 'node:fs/promises';
import {BrainProcess} from './brain_proc.mjs';
import {World} from '../web/js/world.js';import {sense} from '../web/js/senses.js';
import {TRADER_SPEC,tradingObservations,translateAction} from '../web/js/traders/brain.js';
import {MockMarketDataProvider,ASSETS} from '../web/js/traders/market.js';
import {newPortfolio,portfolioValue,markPortfolio,executePaperTrade,tradingReward,drawdown} from '../web/js/traders/trading.js';
import {newPersonality} from '../web/js/traders/pet.js';import {newEconomy} from '../web/js/traders/economy.js';
const steps=Number(process.argv[2]??120),id=process.argv[3]??'sim-momo';if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||!Number.isInteger(steps)||steps<1)throw new Error('Usage: npm run simulate -- <steps> <id>');
await mkdir('runs',{recursive:true});
const path=`runs/${id}.life`,statePath=`runs/${id}.json`;let state={portfolio:newPortfolio(),personality:newPersonality(),economy:newEconomy(),assetIndex:0,trades:[],step:0,pending:null};let exists=false;try{state=JSON.parse(await readFile(statePath,'utf8'));await readFile(path);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
const brain=new BrainProcess(),provider=new MockMarketDataProvider(),world=state.world?World.restore(state.world):new World({seed:7});let previousOutcome=state.previousOutcome??0,refused=0;
try{
 await brain.call({op:'boot',spec:TRADER_SPEC,path:exists?path:'web/brains/traders-0.74.0-v1/basic.life'});
 for(let i=0;i<steps;i++){
  provider.step=state.step;const snapshots=await Promise.all(ASSETS.map(x=>provider.getSnapshot(x.symbol)));markPortfolio(state.portfolio,snapshots);
  if(state.pending){const reward=tradingReward({before:state.pending.value,after:portfolioValue(state.portfolio),drawdown:drawdown(state.portfolio),invalid:state.pending.invalid});await brain.call({op:'trade_credit',obs:state.pending.obs,action:state.pending.action,reward});console.log(`reward=${reward.toFixed(5)}`);state.pending=null;}
  const obs=new Float32Array(TRADER_SPEC.inputs);sense(world,obs);obs.set(tradingObservations(world,state,snapshots,true),223);
  const answer=await brain.call({op:'tick',obs:[Array.from(obs)],reward:[previousOutcome],aroused:true,want:{policy:true}});const index=answer.action[0],action=translateAction(index),snapshot=snapshots[state.assetIndex];
  if(answer.refused){world.setAction(0);refused++;console.log(`${state.step}: REFUSED ${answer.error}`);}else{
   const before=portfolioValue(state.portfolio),result=executePaperTrade(state.portfolio,action,snapshot.symbol,snapshot.price,state.trades,world.m.asleep,state.step*60000+1000000);
   if(index>=17)state.pending={obs:Array.from(obs),action:index,value:before,invalid:!result.risk.allowed};
   world.setAction(index>=17?0:index);console.log(`${state.step}: motor=${index} ${action} ${snapshot.symbol} value=${portfolioValue(state.portfolio).toFixed(2)} risk=${result.risk.reason}`);
  }
  for(let j=0;j<10;j++)world.step();previousOutcome=world.takeOutcome().reward;state.step++;state.assetIndex=(state.assetIndex+1)%ASSETS.length;
 }
 await brain.call({op:'save',path});const {writeFile}=await import('node:fs/promises');state.previousOutcome=previousOutcome;state.world=world.snapshot();await writeFile(statePath,JSON.stringify(state));console.log(`Ending portfolio $${portfolioValue(state.portfolio).toFixed(2)} · ${state.trades.length} trades · ${refused} refusals · brain ${path}`);
}finally{brain.close();}
