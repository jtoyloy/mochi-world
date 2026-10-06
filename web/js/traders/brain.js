import {SPEC as BODY_SPEC} from '../spec.js';
import {normalizeMarket} from './market.js';
import {getUnlockedTradingFeatures} from './economy.js';
import {petStats} from './pet.js';
import {portfolioValue,drawdown,clamp,TradingAction} from './trading.js';
export const TRADE_ACTIONS=Object.values(TradingAction);
export const ADDED_INPUTS=6+3*6+5+1;
export const TRADER_SPEC={...BODY_SPEC,inputs:BODY_SPEC.inputs+ADDED_INPUTS,senses:[...BODY_SPEC.senses,{name:'trader',size:ADDED_INPUTS,area:'insula'}],actions:[...BODY_SPEC.actions,...TRADE_ACTIONS]};
export function tradingObservations(world,state,snapshots,opportunity){const stats=petStats(world,state.personality),p=state.portfolio,value=portfolioValue(p),features=getUnlockedTradingFeatures(state.economy);const position=p.positions.find(x=>x.symbol===snapshots[state.assetIndex]?.symbol);return [...Object.values(stats).map(x=>clamp(x/100)),...[...snapshots.slice(state.assetIndex),...snapshots.slice(0,state.assetIndex)].flatMap(s=>normalizeMarket(s,features)),clamp(p.cash/value),clamp((position?.quantity??0)*(position?.currentPrice??0)/value),clamp(p.unrealizedPnl/p.startingBalance,-1,1),clamp(p.realizedPnl/p.startingBalance,-1,1),clamp(drawdown(p)),opportunity?1:0];}
export const translateAction=index=>TRADE_ACTIONS[index-BODY_SPEC.actions.length]??'HOLD';
