# Painterly isometric world delivery · 2026-10-05

This is an implemented presentation pivot in the existing repository. It retains
owned pets, their actual Cadence brains and domain services. The new art is original
project-bound imagegen output. Reference screenshots were described in the request
but not attached, so no screenshot-specific composition or asset match is claimed.

1. **Current architecture.** Node HTTP/WebSocket server, PostgreSQL domain services,
   versioned brain files/leases and the shared native Cadence scheduler. Plain
   browser modules mount a Pixi scene through the existing Game bridge. React still
   supplies conversation/backpack/domain overlays. See CURRENT_STATE.md for audit.
2. **Renderer decision.** PixiJS 8.14.3 is the main renderer. Existing room authority,
   routing, entities and interactions did not need Phaser physics/state machinery.
   Invertible fixed isometric projection, layered sprites and foot sorting directly
   fit the requested painterly presentation. Official API references are in ARCHITECTURE.md.
3. **Preserved systems.** Accounts/sessions, ownership, pet state/preferences/relationships,
   checkpoint versions/leases, inventory/equipment, NPC/player shops, collections,
   dailies, arcade, friends/gifts, notifications/events, achievements/trophies/profiles,
   paper portfolios/cups, market/risk modules, wallet/token verification and treasury
   accounting. Existing production-readiness limits remain. No pack or brain mechanism changed.
4. **Replaced/adapted systems.** Active Three world presentation → Pixi; penguin players
   → human villagers; blob presentation → beast sprites. Old Three sources, GLBs and
   tests stay as historical tooling. Build output now uses isoworld.js and compressed
   split chunks. Town visual layout/collisions/renderer/minimap use authored shared data.
5. **Town design.** Lantern District: large central stone meeting square framed by
   café, observatory, exchange, arcade and individual market pockets, with greenery,
   garden seating and paths extending beyond the playable edges.
6. **Spacing.** Logical bounds −650…2200 and −650…1750: **57×48m**, versus36×16m,
   **4.75× bounds area**. Main plaza is26.2×24.2m. Stalls have340×300 logical paving
   pockets and >350 logical units between centres. Entrances/setbacks are navigation
   tested. Buildings frame the social space; props do not fill its centre. Arrival
   players spread to valid anchors instead of stacking; companion offset widened
   after measured silhouette overlap. This is declared safety, not neural learning.
7. **Landmark.** Original painted stone/brass **Wishing Lantern fountain**, with
   turquoise water, visible lamp silhouette and animated ripple rings. The separate
   domed Lantern Observatory provides northern orientation and the Lab doorway.
8. **Sub-zones.** Central plaza, western Hearth Café/food/garden edge, eastern paper
   exchange/tech, southeastern arcade, separated toy/textile/furniture/rare pockets,
   Willow Park route and southern arena route. Map menu preserves all nine rooms.
   Other rooms receive common isometric art and humans/beasts; their map design
   remains a basic adaptation, not equal to the Town art pass.
9. **Human avatars.** Two original four-facing human base styles, foot anchors,
   interpolated movement/facing, idle/walk sway, seated upper-body crop/legs and
   dance response. Owned hats/face/top/back/hand/feet/accessory contracts still
   render layered accents. body_color now controls clothing/cape accent. Wardrobe
   saves an additive style selection. Hair/skin are currently paired base styles,
   not independent full character creation; outfits need item-specific artist art.
10. **Beast Mochis.** Original creamy lavender moonfox and moss woodland-deer,
    distinct four-legged silhouettes/ears/tails/antlers and markings. Existing pet
    identity/profile/brain remains intact. Explicit profile.beast.archetype overrides
    a deterministic variant fallback. Accessories, following/idle/reaction, names
    and bubbles stay attached. No pet was reset/re-adopted to change presentation.
11. **NPC/vendors.** Twelve scripted residents (eleven/twelve present by rare vendor
    schedule), now humans. Six existing vendors, Pip guide, Bea performer, Otto
    courier, Luna visitor and two seated regulars. Role accents include chef hat,
    apron, glasses, parcel and instrument. Clock-synced walk/pause routes, nearby
    ambient bubbles,2–5Hz target updates. NPC name/role help identifies them.
    Vendor server range/cooldown and real pet hunger/hat context remain authoritative.
12. **Conversation/bubbles.** Existing recent-history/input/Send/privacy panel works.
    Manual private question received Momo's actual hungry-state template response;
    no dialogue controls paper trades. Public/private socket contracts remain tested.
    Renderer uses bounded, queued, timed speech at projected head anchors. Cadence
    remains behavior/persistence; language remains expression. Actual Mina dialogue
    led to stock overlay; no browser purchase was made during this review.
13. **Multiplayer.** Existing instances, authoritative10Hz movement, companions,
    emotes/public speech and one-live-socket-per-account behavior are preserved.
    Actual two-authenticated-user WebSocket integration passes. Renderer draws every
    player as a human and every active pet as a beast. A stopped-snapshot race in
    pending NPC interactions was found and fixed: arrival must match the requested
    destination, not merely any stationary tick. Room teardown now releases old
    fountain effects so Café transitions do not leave stale Town pixels/entities.
14. **Performance.** Desktop1280×720, one player/pet plus12 residents: about59–60FPS,
    p95 frame delta18.6ms, **3 measured WebGL draws / ~1,909 triangles**, ~0.5ms
    sampled CPU update. Prior Three sample:60FPS /840draws /386,998triangles. These
    are different render approaches/visual assets, not a controlled engine benchmark.
    Mobile-sized390×844 on the same desktop:56FPS, p9518.6ms,3draws/~1,719triangles,
    ~1.4ms sampled CPU. Debug nav/depth/routes adds cost (~5draws/51k triangles).
    All JS chunks total1,030,039bytes raw /267,242gzip /226,982Brotli; source PNGs
    total8,938,482bytes. Entry is~524kB raw. Both entry and split chunks serve Brotli.
    DPR capped2, shared atlas sources, baked ground, entity culling, cached nav and
    throttled NPC targets. No phone hardware or40-player capacity claim.
15. **Schema.** One idempotent additive column: player_avatars.appearance JSONB,
    default classic. Name, body_color, owned equipment and saved room/position stay.
    No pet-life/checkpoint/economy migration or destructive table replacement.
16. **Art pipeline.** Four original PNG atlases plus manifest/prompt provenance.
    Immutable source art; runtime alpha component extraction trims cell bleed,
    shared atlas sources, bottom-centre feet, projected depth, separate collision
    footprints and logical walk cells. Terrain uses original painted patterns in
    one3072×2048 ground texture. See ASSET_PIPELINE.md and assets/isoworld/PROMPTS.md.
17. **New tests.** Projection inverse/boundaries, facing/depth, spacious stall setbacks,
    every building entrance/path, tree collisions, beast mapping, interpolation
    limits, companion silhouette spacing, actual-arrival interaction race, room
    effect teardown, validated human appearance and nonstacked multiplayer arrivals.
    Older grounding/GLB tests remain as preservation checks, not main-renderer claims.
18. **Results.** **102 JS tests pass, zero skips;15 Python tests pass; Vite build passes.**
    Live review covered path/minimap travel, vendor→stock, private conversation,
    wardrobe, Café→Town transition, debug overlays, camera zoom and responsive HUD.
    Earlier transition error was corrected; no new console errors after that fix.
19. **Limits.** Generated art needs artist cleanup/consistent pivots. Four static
    facing poses with procedural motion, not full walk-frame animation or8-way
    skeletal rigs. Hair/skin are paired styles; generic cosmetic layer art remains.
    Only two beast bases; independent species/variant/marking creation UI is not
    complete. Depth is foot sorting with occlusion fade; long multi-footprint assets
    need segment authoring. Secondary scenes remain basic; home furniture layout
    placement/editor presentation needs a dedicated art pass. Audio is retained
    original synthesis, not finished music/voice. ~9MB PNG load, no-store asset
    caching, runtime trimming and crowd/phone profiling remain production work.
    Existing real identity/payment reconciliation/distributed-service limits remain.
20. **Exact existing-checkout setup.** Keep the configured .env and existing brain
    files. Node22.12+/24+, Python3.12 and PostgreSQL16+ are prerequisites.

    ```sh
    npm ci
    npm run db:migrate
    npm run build
    npm start
    ```

    Open http://127.0.0.1:8777/home. Checks:

    ```sh
    npm test
    npm run test:brain
    ```

    For a fresh machine only, first run npm run db:local, create .env from
    .env.example with the printed database URLs, and install the native host:

    ```sh
    python3.12 -m venv .venv
    .venv/bin/python -m pip install numpy pytest web/brains/traders-0.74.0-v1/cadence_net-0.74.0-py3-none-any.whl
    npm run db:migrate
    npm run db:import
    npm run build
    npm start
    ```

    See README.md for exact mock-token/template-dialogue settings. Existing local
    preview is already running at8777; no deployment or real token action performed.
21. **Highest priorities.** Artist-authored layered humans/beasts with consistent
    feet,8 directions and walk/emote/care frames; offline trimmed/packed/compressed
    atlases and versioned caching; target-device/crowd profiling; independent human
    hair/skin and beast variants; segmented occluders; curated secondary-room/home
    layouts; finished musical ambience. Continue using this spacious Town benchmark.

## Screenshot proof

Under docs/screenshots/: isometric-town.png (play camera), isometric-overview.png
(wide northern composition), isometric-mobile.png, isometric-performance.png,
isometric-mobile-performance.png, isometric-debug.png, isometric-vendor.png,
isometric-shop.png, isometric-conversation.png, isometric-wardrobe.png,
isometric-cafe.png. Prior town-*.png files remain the before-pivot record.
