// Disclosed offline demonstrations, never consulted by the running page.
// Measured failure: a migrated pet selected one trading motor in the first 120 opportunities.
import {BrainProcess} from '../sim/brain_proc.mjs';import {TRADER_SPEC,tradingObservations} from '../web/js/traders/brain.js';
import {World} from '../web/js/world.js';import {sense} from '../web/js/senses.js';import {Mother} from '../web/js/mother.js';
import {MockMarketDataProvider,ASSETS} from '../web/js/traders/market.js';import {newPortfolio,executePaperTrade,markPortfolio,portfolioValue} from '../web/js/traders/trading.js';import {newPersonality} from '../web/js/traders/pet.js';import {newEconomy} from '../web/js/traders/economy.js';import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('runs',{recursive:true});
const pack='web/brains/traders-0.74.0-v1',brain=new BrainProcess(),world=new World({seed:7}),provider=new MockMarketDataProvider();const state={portfolio:newPortfolio(),personality:newPersonality(),economy:newEconomy(),assetIndex:0,trades:[]};
const mother=new Mother();let refused=0,freeTrades=0,total=0;
try{await brain.call({op:'boot',spec:TRADER_SPEC,path:pack+'/basic.life'});
 for(let step=0;step<240;step++){
  provider.step=step;const snapshots=await Promise.all(ASSETS.map(x=>provider.getSnapshot(x.symbol)));markPortfolio(state.portfolio,snapshots);state.assetIndex=step%3;
  const opportunity=step%2===0;const obs=new Float32Array(TRADER_SPEC.inputs);sense(world,obs);obs.set(tradingObservations(world,state,snapshots,opportunity),223);
  const snapshot=snapshots[state.assetIndex],owned=state.portfolio.positions.some(x=>x.symbol===snapshot.symbol);
  // A declared teacher demonstrates basic market affordances, not a profit guarantee.
  const action=opportunity?(snapshot.return5m>.01?(step%4===0?18:19):snapshot.return5m<-.01&&owned?(step%4===0?20:22):17):mother.act(world);
  const answer=await brain.call({op:'tick',obs:[Array.from(obs)],reward:[0],guide:[action],margin:2,record:false,aroused:true});
  if(answer.refused)refused++;else{total++;if(opportunity&&answer.own[0]>=17)freeTrades++;if(opportunity)executePaperTrade(state.portfolio,TRADER_SPEC.actions[action],snapshot.symbol,snapshot.price,state.trades,false,1000000+step*60000);else world.setAction(action);}
  for(let i=0;i<10;i++)world.step();world.takeOutcome();
  if(step%40===0)console.log(`lesson ${step}, free trading motor ${freeTrades}/${total}, refusals ${refused}`);
 }
 await brain.call({op:'streams'});await brain.call({op:'save',path:'runs/trader-demonstrations.life'});
 const report={lessons:240,freeTradingMotors:freeTrades,qualifiedTicks:total,refusals:refused,teacher:'Explicit offline momentum/position examples alternating with original Mother pet lessons. Runtime never consults this teacher.'};await writeFile('runs/trader-demonstrations.json',JSON.stringify(report,null,2));console.log(report);

}finally{brain.close();}
