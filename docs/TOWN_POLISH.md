# Town Square visual pass

This pass extends the existing React/Three scene and the existing multiplayer/shop
services. Other rooms retain their size and systems. It does not change Cadence
mechanisms, trained packs, learning claims, currency policy, or an owned brain.

1. **Clipping cause.** The Mochi GLB has world/asset minY −0.020; its procedural
   feet also extend to −0.020. Entity Y was always zero, while the old paving top
   was 0.025 (decorative strips up to 0.0455). Sleep scaling and roll further
   changed bounds. Penguin body minY is +0.050 but separate feet reach −0.030.
   Both exported rigs have no position/root-motion animation tracks.
2. **Grounding.** `grounding.js` and `Grounding.jsx` keep entity terrain contact
   separate from a measured visual offset. Current skinned Box3 bounds include
   parent rotation/scale. Optional scale, XYZ rotation and ground offset metadata
   support replacement art. Downward rays see only designated floor/ramp meshes.
   Explicit positive hops survive contact correction. No terrain hit holds the
   last valid contact height. Debug bounds/origin/ray and numeric contact readouts
   cover penguin and Mochi; all characters have shared soft contact gradients.
3. **Dimensions.** Main paved surface: 23×8m → 36×16m, **3.13× area**. Shared
   logical Town bounds expand from 60…1140/350…665 to −300…1500/100…900.
   Surrounding scenery is larger than the playable bounds. Other rooms stay put.
4. **Zones.** Central fountain/social apron, western café terrace and garden,
   eastern six-stall market street, northern paper exchange and arcade, and
   southern arrival paving with a guide/directions. Open gathering space remains.
5. **Landmark.** Original Wishing Lantern: Mochi-faced brass sculpture, halo,
   floating crystal and a two-tier fountain with animated ripple rings/streams.
6. **Materials.** Shared stone, painted timber, natural timber, brass, painted
   metal, glass, fabric, foliage, water and plaster presets; tinted coherent
   cream/teal/coral/terracotta palette and softened geometry.
7. **Textures.** Original 128² base/normal/roughness/AO tiles for four families,
   shared across tint variants. Stone grout, timber grain and restrained fabric
   weave add depth. Physical painted sign meshes replace environment HTML signs.
8. **NPC system.** Data-driven authored definitions, static roles and deterministic
   waypoint walk/pause states. Server-time offset keeps moving contact positions
   consistent with range validation. No LLM or brain scheduler per NPC.
9. **Population.** Twelve residents: six shopkeepers, one guide, one performer,
   courier, visitor and two seated regulars. Juniper visits for seven of each ten
   minutes; normally eleven or twelve are present. NPC labels explicitly say NPC,
   are smaller than player names, and appear nearby/on hover.
10. **Vendors.** Mina/foods, Tumble/toys, Loom/threads, Fern/home, Pixel/tech,
    Juniper/rare. Each has a matching stall, authored line and existing Shop overlay.
    Server contacts require ≤120 logical units (2.4m) and a 1.5s cooldown. Browsing
    creates no payment or inventory mutation. Hunger and hats are read from actual
    owned-companion state; clients cannot supply those facts.
11. **Ambient behavior.** Separated tested courier/visitor routes, vendor waves,
    a performer gesture, seated café/garden regulars, and four-second authored
    bubbles on 75s cycles only when nearby. Courier carries a parcel; Pixel has
    glasses, Mina a chef hat, Loom an apron and Bea an instrument.
12. **Environment.** Café tables/umbrellas/cups/menu, original miniature sushi,
    toys, clothing, plants, screens and keepsakes, stalls/awnings, crates, lamps,
    banners, mailbox, directionpost, event board, planters, 160 instanced flowers,
    subtle particles, clouds and a distant original neighborhood. Fountain/mailbox
    inspection and performer dance are reward-free; the board opens existing events.
13. **Navigation.** Town-only bounds, shared prop/terrace footprints, cached grids
    and neighbor-index A* searches instead of every-node neighbor scans. Routes
    are computed again by the server. Benches own server seating/occupancy and
    release into a valid approach on movement. The ramp raises rendered contact
    continuously to 0.6m. Debug grid and NPC route overlays are available.
14. **Lighting.** Warm afternoon default, cool fill, soft hemisphere, wider sun
    shadow coverage, window/lamp glow, sky gradient, cloud silhouettes, and a
    developer evening-key comparison. Shop/stall occluders fade for player/pet.
15. **Animation.** Named clip crossfades, smoothed follow/sleep scale transitions,
    blinks, care/emote clip selection, separate seated upper-body pose and feet,
    fountain/flags/particles, nearby NPC gestures and throttled distant poses.
16. **Audio.** Original synthesized water/noise bed and bird chirps after gesture,
    pet/vendor chirps, shop bell and actual moving footsteps. Volume zero mutes;
    room changes/unmount stop ambience. These are placeholders, not final music,
    recordings or voice acting. The hooks support later town/chatter/music assets.
17. **Performance.** See PERFORMANCE.md for measured final browser counters and
    comparison. Flower instancing, shared maps/geometry, no NPC realtime shadows,
    2–5Hz resident poses, one sun shadow map, cached nav and quality/DPR controls.
    A local 50-query fountain-route probe measured p50 3.66ms/p95 7.49ms (worst
    21.31ms including setup). This is not a multiplayer capacity benchmark.
18. **Tests.** 93 JS tests pass, no skips; 15 Python tests pass; Vite build passes.
    New coverage: world-space contact with rotation/scale/hops, all shipped skin
    clips, actual designated/elevated/ramp probes and no-hit, routes to six vendors,
    moving resident positions/range, route collision/spacing, owned dialogue and
    no purchase from browsing, bench range, server seating/stand-up and seated
    client navigation. Existing economy/lease/privacy/cup/socket checks stay green.
19. **Review.** Screenshots in `docs/screenshots/town-*.png` show the old scene,
    final plaza, café/market views, grounding and responsive review. Browser review
    includes physical contact, vendor→existing stock UI, seating and standing,
    route/material/lighting inspection and browser errors. See review notes below.
20. **Limits.** Character skins remain original prototype rigs; there is no artist
    IK, full cloth/facial morph rig, baked indirect light, HDRI reflection probe,
    texture compression/trim atlas, or 40-player GPU measurement. Audio is original
    placeholder synthesis. Two roaming routes and vendor gestures are modest
    authored activity, not an economic NPC simulation. Other rooms are not enlarged.
    Existing real-wallet/live-fund production limitations remain documented.
21. **Next polish.** Commission final silhouette/animation passes, improve door
    clearances, atlas/batch static trims and props, author 1K hero materials against
    these conventions, measure target-device crowds, and refine composition and
    musical ambience using the same Town benchmark before expanding other rooms.

## Visual review notes

The prior scene was an isolated small floor with four shop boxes and no Town
residents. The updated scene reads as a populated, zoned town with a larger
street, storefront displays, an arrival edge, an identifiable fountain sculpture,
and an accessible terrace. Several camera directions are checked rather than
using a single successful render as proof. This is a substantial visual foundation;
commercial art direction and final character animation still need an artist pass.


Final browser review used 1280×720 desktop and 390×844 responsive viewports.
The responsive final scene reported 60 FPS, 271 draws, 122,362 triangles,
49 textures and 369 geometries on automatic low quality, with sun shadows
disabled and contact shadows retained. This is a desktop browser viewport
check, not a physical phone benchmark. The mobile HUD stayed within the viewport.

Verified actions: distant Mina click walked into server range and opened her
actual hungry-Momo line; Browse opened the existing food stock UI without a
purchase; an east bench seated the player and a floor click stood them up;
Mochi and penguin contact readouts followed the raised ramp; market/café angles,
free orbit, route grid, material swatches and evening comparison rendered.
The browser recorded no console errors during this final review. Free orbit
currently also permits a floor movement click at the end of a drag; separating
those inputs is a remaining developer-tool refinement. Review settings and
temporary viewport overrides were reset afterward.

Saved proof: `town-before.png`, `town-plaza.png`, `town-cafe.png`,
`town-market.png`, `town-grounding.png`, `town-seating.png`, `town-vendor.png`,
`town-shop.png`, `town-performance.png`, `town-debug.png`, `town-mobile.png`,
and `town-mobile-performance.png`, all under `docs/screenshots/`.
