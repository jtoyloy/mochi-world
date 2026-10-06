export interface Position {symbol:string;quantity:number;averageEntry:number;currentPrice:number}
export interface Portfolio {cash:number;startingBalance:number;positions:Position[];realizedPnl:number;unrealizedPnl:number;peakValue:number}
export interface Trade {id:string;symbol:string;side:'BUY'|'SELL';quantity:number;price:number;timestamp:number;pnl?:number}
export interface RiskConfig {maxAssetAllocationPct:number;maxPortfolioDrawdownPct:number;maxTradesPerHour:number;minSecondsBetweenTrades:number}
export interface MarketSnapshot {symbol:string;price:number;return1m:number|null;return5m:number|null;return15m:number|null;return1h:number|null;volume1m:number|null;volume5m:number|null;volumeChange:number|null;volatility:number|null;liquidity?:number;buySellRatio?:number;timestamp:number;source:string}
export interface MarketDataProvider {getSnapshot(symbol:string):Promise<MarketSnapshot>;getPrice(symbol:string):Promise<number>}
export interface EquippedItems {hat?:string;glasses?:string;shirt?:string}
export interface MochiNarrator {narrate(context: {action:string;snapshot:MarketSnapshot;risk:{allowed:boolean;reason:string};sleeping:boolean}):Promise<string>}
