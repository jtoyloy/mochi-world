/** @typedef {import('./types').Portfolio} Portfolio */
export const TradingAction = Object.freeze({ HOLD:'HOLD', BUY_SMALL:'BUY_SMALL', BUY_MEDIUM:'BUY_MEDIUM', SELL_SMALL:'SELL_SMALL', SELL_MEDIUM:'SELL_MEDIUM', SELL_ALL:'SELL_ALL' });
export const RISK = Object.freeze({ maxAssetAllocationPct:30, maxPortfolioDrawdownPct:20, maxTradesPerHour:6, minSecondsBetweenTrades:300 });
export const clamp = (v, low=0, high=1) => Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
export const newPortfolio = () => ({cash:10000, startingBalance:10000, positions:[], realizedPnl:0, unrealizedPnl:0, peakValue:10000});
export const portfolioValue = p => p.cash + p.positions.reduce((sum,x)=>sum+x.quantity*x.currentPrice,0);
export function markPortfolio(p, snapshots) {
  for (const x of p.positions) { const s = snapshots.find(s=>s.symbol===x.symbol); if (s && s.price>0) x.currentPrice=s.price; }
  p.unrealizedPnl=p.positions.reduce((sum,x)=>sum+x.quantity*(x.currentPrice-x.averageEntry),0);
  p.peakValue=Math.max(p.peakValue ?? p.startingBalance,portfolioValue(p));
  return portfolioValue(p);
}
export const drawdown = p => Math.max(0,1-portfolioValue(p)/(p.peakValue ?? p.startingBalance));
export function checkRisk(p, action, symbol, price, trades, sleeping, now=Date.now(), config=RISK) {
  if (!Object.values(TradingAction).includes(action)) return {allowed:false,reason:'Unknown action'};
  if (action==='HOLD') return {allowed:true,reason:'Watching the market'};
  if (sleeping) return {allowed:false,reason:'Sleeping: no new discretionary trades'};
  if (!Number.isFinite(price) || price<=0) return {allowed:false,reason:'Invalid market price'};
  const recent=trades.filter(t=>t.timestamp>now-3600000);
  if (recent.length>=config.maxTradesPerHour) return {allowed:false,reason:'Hourly trade limit'};
  if (trades.some(t=>now-t.timestamp<config.minSecondsBetweenTrades*1000)) return {allowed:false,reason:'Five-minute trade cooldown'};
  const position=p.positions.find(x=>x.symbol===symbol);
  if (action.startsWith('BUY')) {
    if (drawdown(p)*100>=config.maxPortfolioDrawdownPct) return {allowed:false,reason:'Drawdown safety limit'};
    const budget=portfolioValue(p)*(action==='BUY_SMALL'?.05:.15);
    if (p.cash+1e-8<budget) return {allowed:false,reason:'Insufficient simulated cash'};
    if (((position?.quantity ?? 0)*price+budget)/portfolioValue(p)*100>config.maxAssetAllocationPct+1e-8) return {allowed:false,reason:'Asset allocation limit'};
  } else if (!position || position.quantity<=0) return {allowed:false,reason:'No position to sell'};
  return {allowed:true,reason:'Risk checks passed'};
}
export function executePaperTrade(p, action, symbol, price, trades, sleeping=false, now=Date.now(), config=RISK) {
  const risk=checkRisk(p,action,symbol,price,trades,sleeping,now,config);
  if (!risk.allowed || action==='HOLD') return {risk,trade:null};
  let position=p.positions.find(x=>x.symbol===symbol);
  let quantity, pnl;
  if (action.startsWith('BUY')) {
    const cost=portfolioValue(p)*(action==='BUY_SMALL'?.05:.15); quantity=cost/price;
    if (!position) {position={symbol,quantity:0,averageEntry:0,currentPrice:price};p.positions.push(position);}
    position.averageEntry=(position.quantity*position.averageEntry+cost)/(position.quantity+quantity);
    position.quantity+=quantity; p.cash=Math.max(0,p.cash-cost);
  } else {
    quantity=position.quantity*(action==='SELL_SMALL'?.25:action==='SELL_MEDIUM'?.5:1);
    pnl=quantity*(price-position.averageEntry); p.realizedPnl+=pnl; p.cash+=quantity*price;
    position.quantity=Math.max(0,position.quantity-quantity);
    if (position.quantity<1e-12) p.positions=p.positions.filter(x=>x!==position);
  }
  position.currentPrice=price;
  const trade={id:`${now}-${trades.length}`,symbol,side:action.startsWith('BUY')?'BUY':'SELL',quantity,price,timestamp:now,...(pnl!==undefined?{pnl}:{})};
  trades.push(trade); markPortfolio(p,[]); return {risk,trade};
}
export function tradingReward({before,after,drawdown:dd=0,trades=0,invalid=false}) {
  return clamp(10*(after-before)/Math.max(before,1)-.2*dd-.01*Math.max(0,trades-3)-(invalid?.05:0),-1,1);
}
