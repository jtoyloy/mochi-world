# Browser-world delivery

The implementation runs locally at http://127.0.0.1:8777/home. PostgreSQL and the web/brain
service are running. No public deployment, pull request or profitability claim was made.

1. **Architecture:** plain ES-module world shell, session-owned HTTP domain APIs,
   PostgreSQL transactions, file checkpoints and one serial native Cadence service.
   The original room is loaded only at a home/research destination.
2. **Major files:** `web/index.html`, `world.css`, `js/world/app.js`, `catalog.js`,
   `room-embed.html`, adapted `js/game.js` and `js/traders/game.js`/`persistence.js`;
   `server/index.mjs`, `server/world/{service,checkpoints,brain-service,competitions,
   migrate,import-legacy}.mjs`, SQL/types; world tests, local DB helper, CI and docs.
3. **Routes:** all specified MVP routes work: home/dailies/explore + seven locations,
   generic NPC shop pages, pet/profile/home/brain, user profile, inventory/storage/
   closet/collection, player shops, lab/portfolio/competitions/leaderboard, friends.
   Guilds, auctions, trading post and messages are explicit Coming Soon pages.
4. **Preserved systems:** World needs/body, senses, renderer, audio, motion, toys,
   demonstrations, word learning, diary, neural viewer, immutable packs, life continuation,
   portfolio math, risk rules, market normalization/providers and deterministic narrator.
   The original Classic page remains. Existing saved Momo was imported without resetting
   its trained checkpoint or original possessions.
5. **Database:** 27 new tables: game_sessions, player_inventory, collection_entries,
   shops, shop_stock, player_shops, player_shop_listings, currency_transactions,
   daily_claims, user_events, mochi_preferences, mochi_relationships,
   achievement_definitions, user_achievements, trophies, user_trophies, mochi_trophies,
   friend_requests, friendships, arcade_rounds, arcade_scores, competitions,
   competition_entries, trading_post_offers, auctions, guilds, guild_members.
   Existing user/pet/brain tables gain profile, Coin, clock, checkpoint-version and lease
   metadata. The original 13 tables remain compatible.
6. **Item/economy:** shared 20-item catalog; mechanical rarity; deterministic finite
   restocks; integer Coins/ledger; bag/storage; four clothing and five furniture slots;
   permanent discoveries; item consumption; listing escrow and atomic sales; gifting;
   one calendar-day claim per activity; once-only achievements/cup payouts; 100/day arcade cap.
   Browser-submitted balances/items/results are ignored.
7. **World locations:** original CSS city scene and responsive cards for Market Row,
   Arcade, Park, Trading Floor, Arena, Bank and Research Lab. Six shopkeepers use one
   stock/purchase/page implementation. Art is replaceable CSS/icon placeholder work.
8. **Social:** public identities, real pet discovery, friend request/accept/decline/remove,
   friends' Mochis, accepted-friend item gifts, actual events/read notifications. Pet
   relationships and guild membership have schema foundations; chat and autonomous
   encounters are deferred.
9. **Trading:** real Cadence chooses six paper actions, with retained allocation,
   drawdown, rate and cooldown gates. No manual order endpoint. Native scheduler uses
   five-minute normal and one-minute cup intervals, isolated cup portfolios, genuine
   entrants, configurable payouts and trophies. Live public CoinGecko or labeled mock
   data; saved raw/normalized observations, risk, reward and narrator in the Lab.
10. **Cadence:** each pet has its own continuing immutable-pack Life. Actual bytes are
    atomic files, metadata in PostgreSQL. Locks/version checks and renewed room leases
    prevent simultaneous writers. One native host is reused across pets; an open room
    temporarily owns the same brain. Normal room ticks retain original arousal behavior.
    No neural mechanism or published pack was changed in this migration.
11. **Validation:** 49 JS tests and 15 Python tests passed, with no skips using the
    dedicated PostgreSQL test database. New tests include concurrent stock/listing/daily
    races, insufficient funds, storage/equipment, consumption, permanent discovery,
    friends/gifts, timed server arcade scoring and cap/replay checks, sleep catch-up,
    repeated favorites, leases/versioning, state forgery, ownership/Origin HTTP checks,
    isolated competition settlement and two actual Cadence lives through one shared host.
    All specified routes serve the shell. Desktop/mobile pages, an actual shop purchase,
    food consumption and room save/exit were also checked in the browser. Dependency
    audit reports zero production vulnerabilities. Original pack comparison is identical.
12. **Limits:** local dev account switching is not production authentication. Placeholder
    art/furniture overlays need asset/physics work. The arcade timing protocol can be
    automated. Browser-owned training can be tampered with; public competitions need
    provenance/server-hosted training. A single serial worker is not a high-scale queue.
    Open rooms pause scheduled trading. Object-storage adapter and checkpoint cleanup
    are not implemented. Guilds/auctions/post/messages are intentionally unfinished.
    Older pre-migration room tabs need a reload; their unleased writes are rejected.
13. **Setup:** `npm install`; create `.venv` with Python 3.12; install NumPy, pytest and
    the bundled Cadence wheel; copy `.env.example` to `.env`; start/configure PostgreSQL
    (`npm run db:local` helper optional); run migration/import; `npm start`.
14. **Migration:** `npm run db:migrate` applies the original and additive schema and
    seeds shared catalog/awards. `npm run db:import` creates devuser/Momo and imports
    `data/momo.json` once if present, extracting its real checkpoint into file storage.
    Re-running does not overwrite imported training. Back up database and checkpoints.
15. **Environment:** DATABASE_URL, TEST_DATABASE_URL, DEV_MODE, HOST, PORT, MARKET_MODE,
    optional COINGECKO_API_KEY, GAME_TIMEZONE, TRADING_INTERVAL_MS,
    COMPETITION_INTERVAL_MS; local helper PG_BIN/LOCAL_PG_PORT. `.env` and all `data/`
    files remain ignored. Browser APIs expose no database/API secrets or checkpoint paths.
16. **Next three:** production identity/checkpoint provenance/abuse controls; supervised
    worker queue plus durable shared storage and retention; original art and deeper
    pet/world attachment with measured behavioral controls.
