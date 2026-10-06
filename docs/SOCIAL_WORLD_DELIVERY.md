# Social-world delivery · 2026-10-05

The app runs at http://127.0.0.1:8777/home in explicitly labeled TEST $MOCHI mode. No
Solana transfer, treasury execution, external dialogue request or deployment was performed.

1. **Current architecture:** existing ES-module web panels + Phaser 3, Node HTTP/ws,
   PostgreSQL, ephemeral room store, one serial native Cadence host and file checkpoints.
2. **Preserved systems:** original body/senses/settlement/refusal/learning, immutable packs,
   trained Momo/checkpoints, risk/market/portfolio/cups, inventory/escrow/stock/restocks,
   care/elapsed needs, equipment/preferences, friends/gifts, dailies/arcade/awards and Classic.
3. **Phaser architecture:** generated original textures in BootScene, reusable WorldScene,
   separate PenguinAvatar/MochiCompanion entities, shared movement/follow geometry,
   reusable SpeechBubbleSystem and DOM HUD/panels. No Three.js/framework rewrite.
4. **Scenes:** Town Square, Café, Park, Market, Arcade, Exchange, Arena, Research Lab,
   owner/accepted-friend Player Homes. Props open existing real domain UIs; map transitions
   join a distinct room instance. Decorative artwork remains procedural placeholders.
5. **Multiplayer:** authenticated same-origin WebSocket /socket; validated typed events,
   capacity default40, server speed/collision, 10Hz updates, interpolation, duplicate-tab
   replacement, clean leave/transition, heartbeat/stale timeout, reconnect and basic presence.
6. **Avatar:** one persistent penguin/user, color/name and owned catalog clothing in four
   layers, updated for room members. It is player controlled; public profile shows appearance.
7. **Companion:** one server-selected owned Mochi, bounded follow/roam/interact/rest/return,
   collision recovery, actual feed/pet/play/sleep, pet cosmetics, home inactive pets/furniture,
   actual pair familiarity and bounded template greetings. Learned social behavior is deferred.
8. **Bubbles:** anchored/wrapped/capped plain text, bounded queue, overlap separation,
   3–8s fade/dismiss, owner-only versus room fan-out; textual history/HUD alternatives.
9. **Conversation:** owned minimal context, actual paper summary/preferences/needs,
   private-by-default panel with optional public reply, bounded history and contact memory.
   Six messages/minute, one request/user, 400-character inputs, 220-character replies.
10. **Providers:** template default; optional server-only OpenAI Responses provider with
    explicit key/model, timeout/fallback and no tools. External provider was not exercised.
11. **Cadence:** neural mechanism/inputs/motors/published packs unchanged; brain/version/
    lease/isolation contracts retained. Phaser FPS does not trigger neural/trading ticks.
    Follow and social co-presence are declared game rules, not fabricated learned decisions.
12. **$MOCHI:** bigint/string raw amounts, mint/decimals, real finalized RPC balance cache,
    server-priced five-minute intents, stock/listing reservation, independently checked SPL
    payment proof and transactional once-only inventory. Mock ledger is separate/clearly labeled.
13. **Wallet:** nonce/account/origin-bound Ed25519 challenge, expiry/one-use, unique linked
    public key; injected wallet signing. No seed/private keys. Transfer link/signature UI is
    a foundation; integrated builder and live wallet matrix are not completed.
14. **Marketplace:** existing escrow preserved; one checkout reservation, cancel/expiry,
    direct verified seller payment and centralized item delivery. Real fee must be0 until
    split payments exist; mock fee tests cover accounting. This is not trustless atomic exchange.
15. **Treasury:** qualifying receipts/fees only, optional configured BPS (unset stays unset),
    review queue and offline finalized acquisition/burn verifier. No hot wallet or automated
    trade/burn. /treasury shows real verified signatures separately from mock revenue.
16. **Migrations:** additive server/social/schema.sql adds12 tables: player_avatars,
    connected_wallets, wallet_challenges, world_rooms, mochi_conversation_messages,
    mochi_memories, token_payment_intents, listing_reservations, mock_token_balances,
    mock_token_ledger, platform_revenue_records, cadence_buyback_records. Existing40
    tables/checkpoints remain. `npm run db:migrate` applies/seeds; `db:import` remains idempotent.
17. **New environment:** MOCK_TOKEN_MODE, MOCK_MARKET_DATA, MAX_PLAYERS_PER_ROOM,
    MOCHI_DIALOGUE_PROVIDER, optional OPENAI_API_KEY/MOCHI_DIALOGUE_MODEL,
    SOLANA_NETWORK/RPC_URL, MOCHI_TOKEN_MINT/DECIMALS/TREASURY_WALLET,
    CADENCE_TOKEN_MINT/BUYBACK_BPS/DEX_PROGRAM_ID, MARKETPLACE_FEE_BPS,
    ALLOW_MAINNET_PAYMENTS. Secrets remain server-only. See .env.example.
18. **Tests added:**27 tests for companions, collisions, owned avatar, capacity/ghosts,
    actual two-user socket protocol, speech privacy, dialogue context/caps/concurrency,
    wallet signatures/replay, token config/cluster/mint/proof/reservations/expiry/replay,
    actual pair encounters/home privacy, marketplace accounting and burn verification.
19. **Results:**76 JavaScript +15 Python tests passed, no skips, using isolated PostgreSQL
    schemas. Production dependency audit: zero vulnerabilities. Browser confirmed world
    rendering, private actual-state conversation, travel and care/panels (see screenshots).
    Token proofs are mocked; no real payment/buyback/burn was tested or executed.
20. **Limits:** production identity; learned Cadence social motors/observations; live wallet
    transaction/confirmation testing, late-payment reconciliation/refunds; multisig treasury;
    multi-server presence/queue/shared storage; placeholder art/physics; stronger arcade
    integrity/training provenance. Guilds/post/auction/messages remain Coming Soon.
21. **Exact local setup:** `npm ci`; `python3.12 -m venv .venv`; `.venv/bin/python -m pip
    install numpy pytest web/brains/traders-0.74.0-v1/cadence_net-0.74.0-py3-none-any.whl`;
    `npm run db:local`; copy .env.example only for a fresh setup and set printed database
    URLs; `npm run db:migrate`; `npm run db:import`; `npm start`. See README code blocks.
22. **Development mode:** DEV_MODE=true, MOCK_TOKEN_MODE=true,
    MOCHI_DIALOGUE_PROVIDER=template, MOCK_MARKET_DATA=true, MARKET_MODE=mock,
    SOLANA_NETWORK=devnet, ALLOW_MAINNET_PAYMENTS=false, MAX_PLAYERS_PER_ROOM=40,
    MOCHI_TOKEN_DECIMALS=6, MARKETPLACE_FEE_BPS=0, CADENCE_BUYBACK_BPS unset.
    No keys/funds/Redis needed. Different browser profiles permit two distinct test accounts.
23. **Deployment:** HTTPS Node/socket server + PostgreSQL + native Cadence worker/files;
    optional RPC/dialogue; Redis/shared checkpoint storage next. A real identity provider,
    legal/token policy review and reconciliation/security work are required before live launch.
24. **Next five:** identity/integrity/abuse controls; devnet wallet/reconciliation/escrow;
    shared workers/presence/storage; original assets/interiors/pathfinding/accessibility;
    measured Cadence social learning with the simpler control retained.

Major files: web/js/game/{Game,model,entities,scenes,systems,ui}; web/social.css;
web/js/world/app.js and room integration; server/social/{avatar,multiplayer,dialogue,tokens,
treasury,events,schema}; server/index.mjs; additive migrate/helper scripts; tests/social and
HTTP socket/token tests; README and the documented architecture/security/domain files.

This checkout was already wholly untracked before this pass. No commit or PR was created.
