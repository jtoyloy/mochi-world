# Current painterly isometric presentation

The main world uses **PixiJS 8.14.3**, selected because the existing project already
owns room networking, pathfinding, movement, shops and dialogue. Pixi provides
rendering, sprite batching, transforms and input without adding a second game
state/physics stack. Phaser would duplicate systems already working here.
React remains for domain/conversation overlays; Three remains historical source
and optional character tooling, not the active world.

`web/js/isoworld/entry.jsx` adapts the existing scene/bridge contract.
`World.js` loads immutable original sprite sheets, constructs ground/object/effect
layers, interpolates server poses, sorts at projected feet, and anchors DOM
labels/bubbles after projection. `projection.js` owns invertible display math.
`layout.js` and game/town.js own authored Town records shared by server navigation,
renderer and minimap. All move/NPC/shop/seat decisions remain server validated.
Projection and animation do not introduce brain actions or trading instructions.

Pixi textures are loaded through Assets and shared; object children sort via
zIndex. Distant NPC route targets update at 2Hz, nearby at 5Hz. Only visible
labels render; offscreen entity sprites are marked non-renderable. Occluding
foreground props fade locally for readability, without changing collisions.
The minimap routes through the same move validation. Developer overlays show
walk cells, footprints, depth/foot labels, routes and spawn.

Official API references: [Pixi quick start](https://pixijs.com/8.x/guides/getting-started/quick-start),
[container sorting](https://pixijs.com/8.x/guides/components/scene-objects/container),
[Assets](https://pixijs.com/8.x/guides/components/assets).

Below is the retained history of the earlier presentation, not the active renderer.

# Mochi World architecture

The existing plain ES-module application remains the account/inventory/profile/shop UI.
`web/js/game/Game.js` mounts Phaser 3 at `/home` and `/world/:room`; detailed pages open
inside same-origin web panels. Node's existing HTTP server owns session identity and adds
`/socket` using ws. PostgreSQL retains items, pets, transactions and checkpoint metadata.

A user owns one `player_avatars` row and multiple Mochis. `users.profile.activeMochi`
is a single server-validated reference. The penguin is player controlled. Companion
locomotion is a bounded deterministic presentation/gameplay controller; Cadence continues
its actual body simulation and autonomous PAPER decisions in the original shared host.

New `server/social/` modules add avatars, presence, dialogue, tokens and treasury verification.
They use the existing WorldService transaction/inventory/stock/escrow primitives. Published
packs and Python neural mechanisms are unchanged. Dialogue has no actions/tools. Token
settlement has no player private keys, and treasury execution has no hot wallet.

Rendering (60 FPS), authoritative movement (10 Hz), environmental speech/encounters (15s,
45–60s cooldown), and paper decisions (5m/1m competitions) are independent clocks. No UI
frame triggers a brain or financial decision. One server is the initial deployment; production
requires real identity, shared presence/queues, durable checkpoint storage and integrity work.

## Current3D presentation

The main world now uses React Three Fiber/Three.js. The previous Phaser section is
historical. See [3D_DELIVERY.md](3D_DELIVERY.md) for implemented scope and limits and
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for models/rigs. Domain services and Cadence
contracts remain preserved. Build with `npm run build` before serving/deploying.


## Adventure milestone — 2026-10-05

server/adventure owns combat, gathering, progression, quests and rewards. BattleBrains serializes native Cadence requests with timeout/recovery and transactionally persists per-Mochi battle checkpoints. Trading remains a separate brain domain. Multiplayer supplies authoritative actors and room instances. The browser sends intentions and renders server snapshots. New additive schema lives in server/adventure/schema.sql.
