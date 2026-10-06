import { clamp } from "./trading.js";
export const ASSETS = [
  { symbol: "SOL", coinId: "solana", base: 150 },
  { symbol: "BONK", coinId: "bonk", base: 0.00002 },
  { symbol: "WIF", coinId: "dogwifcoin", base: 1.2 },
];
/** Deterministic sequence indexed by epoch minute; no Math.random or wall-clock dependency. */
export class MockMarketDataProvider {
  constructor(step = 0, { drift = true } = {}) {
    this.step = step;
    this.drift = drift;
    this.mode = "MOCK · deterministic development data";
  }
  priceAt(symbol, step) {
    const i = ASSETS.findIndex((x) => x.symbol === symbol);
    if (i < 0) throw new Error("Unsupported asset");
    return (
      ASSETS[i].base *
      Math.exp(
        0.0004 * (this.drift ? step : 0) +
          0.04 * Math.sin(step / 9 + i) +
          0.015 * Math.sin(step / 3 + i),
      )
    );
  }
  async getSnapshot(symbol) {
    const t = this.step,
      p = this.priceAt(symbol, t),
      ret = (n) => p / this.priceAt(symbol, t - n) - 1;
    return {
      symbol,
      price: p,
      return1m: ret(1),
      return5m: ret(5),
      return15m: ret(15),
      return1h: ret(60),
      volume1m: 10000,
      volume5m: 50000,
      volumeChange: 0.2 * Math.sin(t / 4),
      volatility: 0.02,
      liquidity: 1000000,
      buySellRatio: 1,
      timestamp: 1700000000000 + t * 60000,
      source: "mock",
    };
  }
  async getPrice(symbol) {
    return (await this.getSnapshot(symbol)).price;
  }
}
/** Live public CoinGecko proxy; sampled history measures only windows with actual coverage. */
export class LiveMarketDataProvider {
  constructor() {
    this.mode = "LIVE · public CoinGecko";
  }
  async getSnapshot(symbol) {
    const response = await fetch(`/api/market/${encodeURIComponent(symbol)}`);
    if (!response.ok) throw new Error(`Live provider HTTP ${response.status}`);
    return response.json();
  }
  async getPrice(symbol) {
    return (await this.getSnapshot(symbol)).price;
  }
}
export function normalizeMarket(s, features = new Set(["basic"])) {
  const returns = ["return1m", "return5m", "return15m", "return1h"].map((k) =>
    features.has("basic") ? clamp(s[k] / 0.1, -1, 1) : 0,
  );
  return [
    ...returns,
    features.has("volume") ? clamp(s.volumeChange / 2, -1, 1) : 0,
    features.has("quant") ? clamp(s.volatility / 0.2) : 0,
  ];
}
export class MarketService {
  constructor(mode = "mock") {
    this.mock = new MockMarketDataProvider();
    this.provider = mode === "live" ? new LiveMarketDataProvider() : this.mock;
    this.error = null;
  }
  async refresh(step) {
    this.mock.step = step;
    try {
      const snapshots = await Promise.all(
        ASSETS.map((x) => this.provider.getSnapshot(x.symbol)),
      );
      this.error = null;
      return { snapshots, mode: this.provider.mode };
    } catch (error) {
      this.error = error.message;
      console.error("Live market unavailable; using labeled mock data", error);
      return {
        snapshots: await Promise.all(
          ASSETS.map((x) => this.mock.getSnapshot(x.symbol)),
        ),
        mode: `MOCK fallback · ${this.error}`,
      };
    }
  }
}
