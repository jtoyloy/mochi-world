# Providers
Default MOCK is an indexed deterministic smooth sequence, labeled everywhere.
It is synthetic market data, distinct from simulated execution of real live quotes.
`MARKET_MODE=live` selects public CoinGecko simple-price quotes via the local server.
CoinGecko was selected because its canonical public coin IDs cover SOL, BONK and WIF
without wallet/pair resolution or requiring a secret key for basic access. Optional
COINGECKO_API_KEY stays server-side. Providers implement getSnapshot/getPrice; another
vendor can be added without changing the simulator or Cadence.

Server caches the public three-asset quote response for a minute. A bounded two-hour
ring buffer computes actual sampled 1m/5m/15m/1h returns and volatility. Missing history
is null and displayed as collecting/unavailable. Short-window volume, liquidity and
buy/sell ratio are not invented from 24h volume. Mock snapshots have these known local
values; live volume sensors remain neutral until a capable provider is added.

Fetches timeout after 10 seconds. Errors become visible MOCK fallback with a console
error. No placeholder is presented as live. Provider-source changes drop pending
reward evaluations. This MVP does not store high frequency market history permanently;
Postgres schema reserves market_snapshots for latest quotes, currently ring data is
process-local. Prices are available while the page is active; offline trading is not
implemented. Live provider verification depends on public API access/rate limits.
