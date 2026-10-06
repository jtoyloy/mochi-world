# Audit before browser-world migration (2026-10-05)

Current routes are landing, room, trade, shop, leaderboard/arena and brain debug.
The application shell imports the original room loop on every page, so the canvas
simulation/brain remains the center of the product even when hidden.

Preservable modules: original World needs/body/toys/furniture, local sensory sheet,
renderer/audio, word demonstrations, immutable Cadence packs, BrainLink/Pyodide,
complete life checkpoints and associative trading credit. Trading math, normalized
market providers, risk gates and narrator are independent and have tests.

Inventory, purchases, care rewards and equipment currently mutate browser state.
The server accepts whole snapshots including coins/inventory, so the economy is not
authoritative. File persistence and PostgreSQL/Drizzle exist, with 13 initial tables.
Brains are base64 inside JSONB life records; no version/lease protects browser writers.
There is no real account identity beyond DEV_USER, no stock, player shops, collection,
dailies, arcade, friends, competitions or event feed.

Baseline checks: 24 JS tests pass, PostgreSQL test separately enabled, 15 Python
contracts retained. The original pack is unchanged. A prior 120-step deterministic
Cadence replay produced one trade; no profitable learning claim is justified.

Migration plan: preserve the room as an isolated destination/iframe; replace only
the browser-world shell. PostgreSQL becomes authoritative for all economy operations.
Add account sessions for development, normalized economy/social/competition records,
transaction locks, item discovery, events and checkpoint-file metadata/version leases.
Reuse existing pet/trading/brain modules; do not change the neural mechanism or packs.

## Migration completed

This document preserves the pre-change audit. The current browser-world implementation
is described in ARCHITECTURE.md and WORLD_DELIVERY.md. The new economy is server-owned,
with PostgreSQL transactions, file checkpoints, exclusive room leases and one shared
native Cadence scheduler. The room remains available as a destination.

## Social-world pre-change audit · 2026-10-05

The current app was verified at localhost:8777. Baseline: 49 JavaScript and 15 Python
checks pass, with real PostgreSQL and no skipped tests. The framework is plain ES modules,
Node HTTP and PostgreSQL; no React or build step is required. Routes include home/explore,
seven locations, public user/pet profiles, inventory/storage/closet/collection, NPC and player
shops, friends/events, trading lab/portfolio/competitions/leaderboard, and the original room.
Guilds, messages, auctions and trading post are placeholders. Schema contains the original
13 tables plus 27 browser-world tables (see server/world/schema.sql).

Preserve transactional inventory/escrow, stock/restocks, care/elapsed clocks, rewards,
preferences, paper trading/risk math, competitions, native shared brain host, unique Life
checkpoints/version/leases and immutable packs. Authentication currently uses explicitly
local dev account switching; production identity is unfinished. Economy currently uses an
internal integer ledger. Room physics are separate from page rendering. No sockets, avatars,
wallet signatures, SPL settlement or dialogue provider exists in this baseline. Important
debt: single process presence/brain scheduling, browser training provenance, placeholder
art, arcade bot resistance, checkpoint retention and production authentication. This pass
adds adapters and additive schema rather than replacing these domain services.

## Current social-world implementation

The PixiJS painterly isometric world is now the primary `/home`/`/world/:room` experience. New routes `/home/:username`,
`/wallet`, `/treasury`, `/pets` coexist with the prior domain pages. Nine original rooms,
player penguins, active companions, real sockets/instances, emotes, owner/private dialogue,
owned cosmetics, token-intent settlement and reviewed treasury accounting are implemented.
The additive schema adds 12 tables to the existing40, detailed in SOCIAL_WORLD_DELIVERY.md.
Current suite: **76 JavaScript and 15 Python checks**, no skips; dependency audit0.

Preserved systems remain as audited above. Incomplete systems: production auth, real wallet
transaction builder/confirmation/reconciliation/refunds, distributed presence/workers/storage,
multisig treasury execution, bespoke art/physics, learned Cadence social behavior and prior
Coming Soon guild/post/auction/messages. Local fake tokens are distinctly labeled; configured
real-token mode validates mint/cluster rather than treating legacy Coins as tokens. No actual
payment, burn or deployment occurred. Existing training/checkpoint integrity caveats remain.

## Before 3D migration · 2026-10-05

Baseline rerun: 76 JavaScript tests and 15 native Cadence tests passed, zero skips.
The app and persistent PostgreSQL run locally; migrations are additive. Phaser 3 is
the current renderer and no frontend build existed. Preserve all 52 tables, native
Cadence leases/checkpoints/worker, paper trading/risk/cups, elapsed pet needs, care,
owned inventory/equipment/escrow/shops/collections/trophies/achievements/dailies,
friends/events, session isolation, wallet challenges, bigint payment intents and
reviewed treasury accounting. Production authentication, live wallet execution and
learned social behavior remain incomplete. Replace only the primary 2D renderer,
page-framed presentation, direct-line navigation and four-slot avatar presentation.
React/R3F will own the world; established domain panels remain compatible during migration.

## Current3D migration

PixiJS is now the primary world renderer; Vite builds a local ES bundle. React Three Fiber
and Three.js remain historical prototype tooling.
Shared navigation includes A* routes around actual static prop footprints and server
acceleration/rotation. Original rigged GLBs, socket cosmetics, React conversation and
backpack,3D room props and owned home snap placement are implemented. No neural
mechanism or published brain pack changed. Existing domain screens remain inside React
overlays. See3D_DELIVERY.md for all26 requested delivery topics and honest limitations.

## Town visual follow-up (2026-10-05)

Town Square now has a36×16m paved hub, original Wishing Lantern, six existing-shop
vendors,12 authored residents (one scheduled traveling keeper), an accessible
0.6m terrace/ramp, shared mapped materials, district displays, original audio hooks,
server seating and proximity checked resident dialogue. Gameplay uses the same
services and Cadence host. Grounding derives the visual offset from current world
bounds and terrain rays, including fallback/skins and declared care/emote motion.
The new developer benchmark controls are development-only. 93 JS/15 Python checks
pass. See TOWN_POLISH.md for21 delivery topics and the screenshot review; the final
artist/crowd/real-wallet limitations are still explicit rather than production claims.


## Painterly isometric pivot · current (2026-10-05)

Pre-change audit: the active browser world used React/Three with a penguin
avatar, blob-like Mochi GLBs, server-owned 36×16m Town bounds, six vendor stalls,
twelve authored NPCs, shared server/client navigation, and working domain overlays.
The repository already contains account sessions, owned Mochis, PostgreSQL-backed
inventory/equipment/shop stock/player listings, collection discovery, calendar
dailies, arcade rounds, friends/gifts, events, achievements/trophies/profiles,
paper portfolios/cups, normalized market providers and risk gates, wallet/token
verification and treasury records. Brains have versioned file checkpoints,
leases and an actual shared native Cadence scheduler. Dialogue uses provider
interfaces with a template fallback. These services, contracts and records are
preserved, not reimplemented by the new renderer. Production identity/token
limitations from earlier reports still apply.

Current presentation: PixiJS 8, original painterly atlases, fixed isometric camera,
foot depth sorting, human villagers and moonfox/woodland-deer beast companions.
Town logical bounds are −650…2200 / −650…1750; 57×48m at the existing
50 units/metre convention, 4.75× the prior Town bounds area. Shopkeepers now
occupy separate market pockets. Existing rooms use the same projection and
character art without a backend rewrite; Town remains the art benchmark.

Only schema addition: player_avatars.appearance JSONB, default classic, added
idempotently. body_color becomes a clothing/cape accent; equipment stays owned
inventory. Existing Mochis select presentation from profile.beast.archetype or
a deterministic variant fallback; no brain, identity, life or ownership reset.
The old Three implementation remains source/archive tooling and is not the
main world renderer. See ISOMETRIC_DELIVERY.md for validation and limitations.

Validation of the completed pivot:102 JavaScript tests, zero skips;15 Python
contracts; clean Vite build. Live vendor/shop, private conversation, human
wardrobe, corrected Café/Town teardown, debug projection/follow and responsive
HUD reviewed. New room layouts preserve their existing domain actions; artist
room/furniture presentation still needs work.


## Adventure milestone — 2026-10-05

Adventure milestone: authoritative combat, independent actual Cadence battle checkpoints, fishing/woodcutting, resource vendors, free starters and quests are implemented. Production rewards remain configuration-gated with externally executed transfers. Combat competence is not established; current combat assay underperforms random. See ADVENTURE_DELIVERY.md for scope, reproducible checks and remaining work.
