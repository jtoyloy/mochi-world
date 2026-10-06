# Local MVP delivery

1. **Structure:** imported upstream from commit 39dbb4c; added independent pet, brain,
   trading, market, economy, persistence and UI modules under web/js/traders/, server/
   API plus Drizzle schema, native simulator, tests and docs. No web framework rewrite.
2. **Preserved:** original World, senses, renderer, audio, hunger/thirst/fatigue/boredom/
   loneliness, sleep, toys, movement, furniture editing, teaching, rewards, complete
   brain life serialization, IndexedDB backup and neural viewer. Original pack unchanged;
   original page accessible at /classic.html. New graph's behavioral parity is unproven.
3. **Routes:** /, /room, /trade, /shop, /leaderboard, /debug/brain; /arena aliases rankings.
4. **Database:** PostgreSQL/Drizzle tables users, mochis, mochi_pet_state, mochi_brains,
   inventories, items, equipped_items, portfolios, positions, trades, market_snapshots,
   leaderboard_entries, achievements. Writes transactional; atomic server files work
   without a database. Latest market table is reserved, sampled history is bounded RAM.
5. **Providers:** deterministic MockMarketDataProvider and live public CoinGecko through
   a server proxy; optional server-side key, timeout and explicitly labeled fallback.
   A real public SOL quote was successfully fetched in verification. Missing windows/
   short-volume data are unavailable, never presented as known observations.
6. **Inputs:** original 223 retained, 30 appended: six pet stats, 18 market features,
   five portfolio ratios and opportunity cue. Target's six market values are first.
   Inventory gates volume/volatility, normalized values remain bounded.
7. **Actions:** six added Cadence motor neurons: HOLD, BUY_SMALL, BUY_MEDIUM, SELL_SMALL,
   SELL_MEDIUM, SELL_ALL. Single whole-brain settlement; no LLM or runtime teacher.
8. **Reward:** clamp(10*intervalReturn - .2*drawdown - .01*max(0,hourlyTrades-3)
   - .05*invalid, -1,1). Exact prior action/observation is written into the existing
   associative store; intervening pet eligibility is not credited with trading P&L.
9. **Verification:** 24 JavaScript tests, 15 Python tests, plus one separately enabled
   real PostgreSQL transaction/isolation/rollback test passed. npm audit: zero known
   advisories after patched Drizzle update. Real 120-step native Cadence replay: one
   autonomous BUY_MEDIUM, zero refusals, ending mock portfolio $10,123.25. No claim of
   profitable learning follows from a single synthetic sequence. Browser verified
   adoption, original pet behavior, feeding, Coins, shop, dress, Arena and save/reload.
10. **Limits:** active-browser simulation; DEV_USER and client-proposed local state;
    untrained/sparse trading behavior; emoji outfits; no 7-day ranking or tournament
    payouts; no short-window live volume from this provider; original saved lives stay
    in classic mode; migration clears graph-size-dependent transient state. Market
    reward teaches associative value, not a new delayed cortical learning mechanism.
11. **Commands:** see README.md for full environment and database setup. Quick start:

    npm install
    cp .env.example .env
    npm start

    Native evaluation:

    python3.12 -m venv .venv
    .venv/bin/python -m pip install web/brains/mochi-0.74.0-a/cadence_net-0.74.0-py3-none-any.whl pytest
    npm test
    npm run test:brain
    npm run simulate -- 120 my-mochi

    PostgreSQL (after setting DATABASE_URL in .env):

    createdb mochi_traders
    npm run db:migrate
    npm start

12. **Next three steps:** measured pet-retention/trading-learning assays with matched
    baselines; authenticated authoritative economy plus offline scheduler; richer
    volume data and recorded competitions with server-issued rewards. See ROADMAP.md.
