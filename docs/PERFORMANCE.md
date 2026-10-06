# 3D measurement notes

Browser: local Codex in-app browser,1280×720,1 authenticated player +1 Mochi,
Town Square, auto→medium, realtime shadows. Observed about60FPS,301 draw calls,
205,432 triangles,10 textures,107 geometries. These are renderer counters, not an
independent hardware benchmark. New garden styling changes counters slightly.
Low disables realtime shadows/DPR>1; high increases shadow map/DPR budget.

Vite bundle about1.59MB raw /383kB gzip. The server negotiates Brotli/gzip for the
bundle. Two character GLBs total under100kB; no other room model download.
Flowers use instancing; cached GLBs use isolated skeleton/mixers. The browser panel
reports actual FPS/draws/triangles/textures/geometries/player count/quality. Texture
memory bytes are explicitly not estimated from a texture count.

Before a capacity40 performance claim: profile5/20/40 visible avatars and pets on
integrated laptop graphics and touch devices; collect p50/p95 frame time, JS heap,
network bytes, A* latency and DB throughput; batch static rooms and cosmetic materials,
add character/cosmetic LOD and adaptive quality. No such stress result is claimed here.

## Town polish comparison

Same local IAB desktop test size (1280×720), medium, one player and one active
Mochi. Final Town has twelve resident definitions (eleven/twelve visible by the
traveling vendor schedule), six stalls, extra district/scenery geometry and a
larger floor. A stationary browser sample after walking to the east fountain
bench showed **60 FPS, 840 draw calls, 386,998 triangles, 49 textures, 352 geometries**.
Counts vary with camera/frustum, animation and traveling-vendor presence. This
is roughly 2.8× draws /1.9× triangles versus the recorded 301/205,432 baseline,
with approximately the same observed frame rate on this host. It is an increase
in visual cost, not a draw-call optimization claim.

A preliminary smaller viewport/low sample (before the final district prop additions)
showed 57–60 FPS, about 297 draws/128k triangles. Do not treat that intermediate
sample as the final mobile result; final responsive review is recorded separately
in TOWN_POLISH.md. Low omits the sun shadow pass; all qualities keep contact gradients.

The developer panel additionally times resident pose + ground update CPU work
(the average per resident update, not total GPU animation time), reports the
actual shadow-map preset, and exposes grounding contacts, free camera, material
swatches, terrain walkability and routes. Nearby NPCs update at 5Hz, distant at
2Hz; secondary distant gestures are omitted. All NPC sphere geometry is shared,
with no skeleton or Cadence instance per NPC. Vegetation flowers use one instanced
draw. Four material map sets share their 128² textures across color variants.

A native 50-query blocked fountain route probe measured p50 3.66ms, p95 7.49ms,
worst 21.31ms including initial grid setup. Town grid data is cached and A*
neighbor lookup uses a local cell index rather than scanning every node.
This microbenchmark does not simulate concurrent input or 40 pets routing.

The current bundle is about1.67MB raw/400kB gzip (Vite output varies slightly with
final UI instrumentation). No new downloaded model/texture/audio dependencies
were introduced by Town. Shared original procedural maps and sign textures still
need an artist atlas/trim/batching pass before a crowd release. See the unchanged
capacity40 measurement requirements above.


Final 390×844 responsive viewport (automatic low, one player/pet): **60 FPS,
271 draws, 122,362 triangles, 49 textures, 369 geometries**, NPC update average
0.059ms; sun shadow disabled. This measures the same desktop host at a mobile
layout size, not phone GPU performance. Saved counters: town-mobile-performance.png.

## Current Pixi isometric pivot

Final main renderer is PixiJS/WebGL. Desktop1280×720 with one human/player, one
beast and12 resident definitions:59–60FPS, p95 frame delta18.6ms,3 measured GL
draws/~1,909 triangles, sampled CPU update~0.5ms. Developer-only context wrappers
count actual drawElements/drawArrays/instanced calls and triangle primitives per
render; original functions are restored on teardown. Nav/depth/routes overlay
cost is separate (~5draws/51k triangles). Prior Three sample840draws/386,998tris
used different geometry/shadows, so this is a presentation comparison, not a
controlled engine speed test.

Responsive390×844 on the same desktop host:56FPS, p9518.6ms,3draws/~1,719triangles,
CPU sample~1.4ms. It is not a physical phone result. No40-player measurement.
Current clean Vite output totals1.03MB JS raw /267kB gzip /227kB Brotli including
split chunks; server serves compressed entry and chunks. Original PNGs total
8.94MB, so the asset download is substantially larger than procedural art. Shared
atlas sources and baked ground reduce draws, but artist offline packing/compression,
versioned caching and real target-device/crowd profiling are still required.
See ISOMETRIC_DELIVERY.md and isometric-*-performance.png for proof.


## Adventure milestone — 2026-10-05

Adventure mobs use viewport culling/interpolation; effects use a 16-entry pool and a bounded event ring. Combat ticks avoid overlapping queues. No new 40-player benchmark was performed; capacity and sustained latency remain unverified.

## Locomotion measurements — 2026-10-05

See MOVEMENT_AUDIT.md for isolated route/transport tests and browser samples. The old latest-target chase caused stationary presentation frames despite near-60 FPS. Movement now carries waypoint distance, predicts locally and buffers remote snapshots. Default movement stays 10 Hz. A 144-case synthetic network sweep across 10/15/20 Hz found no hard snaps/backsteps on straight paths and at most 0.36% stationary remote frames. Town two-client samples were 57–62 FPS, p95 17.2–18.7 ms with 1.0–2.1 ms sampled CPU update. Screenshot capture affected stress-run frame time. These are local samples, not a capacity guarantee or a GC analysis.

### Full-body animation (2026-10-06)

Developer-only World diagnostics provides client-only20/40 player+Mochi crowds,
legacy/full-body presentation comparison, GL draws/triangles, visible sprites,
RGBA source/cache estimates and existing FPS/p95/update timings. See
`docs/assays/animation-crowd.json` and `ANIMATION_DELIVERY.md` for matched live
samples and limits. Source art23.99MiB plus lazy gestures6.0MiB; bounded appearance
sheets4MiB remote/NPC,9MiB local. Do not interpret these as total VRAM: world,
seated-art and render-target allocations are additional. Crowds use scripted
visual routes and are not real networking capacity tests. Cached viewport
sizes and unchanged bubble text avoid repeated DOM layout/content work per actor.

## Real multiplayer follow-up

See [MULTIPLAYER_SOAK.md](MULTIPLAYER_SOAK.md) for authenticated WebSocket capacity
and native-process measurements. A separate real Town instance with 39 Node users
and one independently authenticated browser owner, each with an active Mochi,
sampled **20 FPS, p95 66.3 ms, CPU update 1.2 ms, two GL draws, 6,098 triangles**
at DPR 2. Synthetic Animation crowd stayed at zero. This was one loaded diagnostic
sample on a contended development host, with uncontrolled visibility/focus; it
does not establish a sustained renderer trace or 60 FPS. After load actors left,
the renderer returned to 60 FPS/p95 17.6 ms with 20 entities, while the population
HUD still displayed 40. That stale HUD must not be used as proof of visible load.
Raw observations: [multiplayer-presentation.json](../assays/multiplayer-presentation.json).

## Multiplayer protocol scaling — 2026-10-06

Real 150-account/pet five-minute loopback payload fell from **28.86 to 5.91 MB/s** (4.88×), and recipient messages from **42017 to 2829/s**. Authority remains 10 Hz. Recipient batches, static descriptions on join/change, changed dynamic fields and projected viewport frequency tiers replace per-actor full broadcasts. Hysteresis retains presence at boundaries; interpolation smoothly retimes tier delay.

Node mean CPU: 0.297 → 0.306 cores; app/native maximum RSS: 645 → 856 MiB. Peak app/native RSS increased; no memory reduction is claimed. Opt-in byte/GC/serialization counters are enabled; PostgreSQL and the generator are excluded from these process figures. Per-recipient batches increase generated string bytes while lowering delivered bytes, so this is not a universal serialization-allocation improvement.

Two-browser near-motion samples were about 60 FPS /17.4 ms p95, with no reported hard snaps or corrections. Unit tests pin continuous 5 Hz motion and monotonic tier transitions. These are not sustained crowd or WAN/GPU results. The 30-minute extension was skipped for disk headroom; request errors/deadline failures remain in the evidence. **150 CCU is not launch-certified.** See [MULTIPLAYER_SOAK.md](MULTIPLAYER_SOAK.md) and [network-scaling-summary.json](assays/network-scaling-summary.json) for complete before/after types, counts, failures and limitations.

## Action art cleanup renderer fixture — 2026-10-06

Actual `IsometricWorld`, 1280×900, two-second warm-up and ten-second samples per
scene. Reproduce via Vite rooted at `web`,
`/dev/animation-benchmark.html?dpr=1` or `?dpr=2`.
Evidence: [action-art-performance.json](assays/action-art-performance.json).

| Scene | DPR | Mean FPS | Frame p95 | CPU update p95 | GL draws |
|---|---:|---:|---:|---:|---:|
| Town, 20 actors | 1 | 60.05 | 17.6 ms | 1.2 ms | 1 |
| Forest combat, player/pet + two mobs | 1 | 60.09 | 17.5 ms | 0.4 ms | 1 |
| Town, 20 actors | 2 | 60.05 | 17.6 ms | 0.7 ms | 1 |
| Forest combat, player/pet + two mobs | 2 | 60.09 | 17.6 ms | 0.4 ms | 1 |

Unique loaded action sources total **45.62 MiB RGBA**, up from 29.99 MiB by five
fixed shared 1280×640 exports (15.625 MiB). Total tracked loaded texture sources
are **93.62 MiB RGBA**; this excludes appearance cache (20 MiB observed), text and
render targets and is not actual total GPU VRAM. Original optional v1 sheets are
still needed by unchanged states. Full-resolution cleanup source PNGs are not
requested by the renderer. No per-actor action allocation/cache expansion occurs.

The fixture uses offline authoritative-result replay and includes new sword art;
it loads fishing/Deer art but does not measure a full fishing/Deer encounter.
These are local desktop samples, not sustained/live/mobile/crowd certification.
Filling export-only spare cells with recovery art after sampling changed neither
used frame pixels, dimensions nor memory estimates.

Final cleanup validation: asset validation and Vite build pass; **19 animation
checks and 221 JavaScript tests pass, zero skipped** with local PostgreSQL and
the existing native Python environment. Historical failed setup runs (missing
Python environment/unmigrated test database) were resolved before this acceptance.
Original v1 clipping warnings remain documented in the per-state audit.
