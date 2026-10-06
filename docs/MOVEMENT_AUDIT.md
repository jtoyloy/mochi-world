# Movement audit — 2026-10-05

## Baseline, recorded before implementation

Pointer taps call root.toLocal → unproject → scene.moveTo. NavigationService checks world walkability and smooths a deterministic 20-unit A* grid into logical waypoints. The browser sends a destination but does not traverse locally. Multiplayer independently routes and validates it, accelerates toward 180 units/sec and broadcasts every 100 ms. World.sync replaces actor.target. Each display frame visualStep chases the latest point at 265 units/sec (pets 290), then projects logical position and orders by projected foot depth. Characters use four static facing textures plus wall-clock vertical sway. Camera follows that delayed presentation with exponential smoothing at 3/sec.

An isolated deterministic replay of the exact old functions measured:

| Probe | Result |
| --- | --- |
| 50 consecutive 20-unit waypoints, 180 units/sec, 100 ms ticks | 1,000 units in 10 seconds: 100 units/sec |
| Straight 180 units/sec snapshots at 10 Hz, old visualStep at 60 FPS | 100/600 display frames stationary; instantaneous speed 0–265 |
| Earliest local movement | after server validation and first movement broadcast; 0–100 ms tick wait plus round-trip delay |
| Walk frames | zero; four static directions per archetype |
| Camera smoothing time constant | 333 ms, applied to already delayed actor |

Waypoint overshoot is discarded; it is not an FPS issue. Latest-target chasing has stop/catch-up velocity pulses; it is not timestamp interpolation. NPC positions are sampled at 200–500 ms then chased similarly. Foot depth is already stable and logical projection is correct. Snapshot construction allocates actor/bubble collections each frame; allocation should be reduced, but no measured GC pause has yet established it as the cause. Renderer frame-time/network profiles and post-change measurements are appended below. Existing historical 59–60 FPS measurements are not treated as proof of smooth locomotion.

## New pipeline and post-change measurements

Clicks project back to logical coordinates, compute a shared deterministic route and immediately start a local Prediction. Every movement intent carries sequence and client timestamp; the server ignores proposed speeds/positions, recalculates the route, and acknowledges its position, speed, remaining path, sequence and server timestamp. The common acceleration/traversal core spends leftover distance across waypoints. Default server movement remains 10 Hz; MOVEMENT_HZ allows 15/20 for comparisons. Combat's brain-selected 65-unit Mochi movement now executes as a continuous 165-unit/sec motor path, rather than an instantaneous position change. No new action selector or neural mechanism was added.

Prediction uses visual velocity independently of the authoritative map. A matching authoritative update is advanced to estimated present time, then reconciled with an exponential correction offset at 18/sec. Corrections preserve the current displayed position; errors above 160 logical units or authoritative seats snap. Errors above three units count as corrections. Superseded sequences and stale timestamps are ignored. Authoritative collision checks, rewards, gathering and combat continue to use server coordinates. Room entry rejects delayed older acknowledgements. Ping estimates clock offset through round-trip timing.

Remote players and Mochis use sorted timestamp buffers with 120 ms initial delay, raised to the maximum recent observed arrival lag plus 100 ms when needed. Interpolation stays in logical coordinates. Extrapolation is limited to 120 ms; missing packets then hold. Adaptive delay can grow under severe latency: increased delay is an explicit quality/latency tradeoff. NPCs sample their authored route continuously each render frame, including intentional authored rests. The camera uses a critically damped spring at 16/sec on the predicted visual player. Foot-depth ordering remains unchanged. Snapshot arrays and bubble maps are cached until state changes rather than copied at render frequency.

| Comparison | Old | New |
| --- | --- | --- |
| 1,000-unit route with 20-unit waypoints, already at 180 units/sec | 10.0 seconds / 100 units/sec | 5.6 seconds / 178.6 units/sec; final partial tick included |
| 30/60/120 FPS logical movement, five seconds from rest | not previously a prediction core | 873 units at all three rates; gait phase difference <0.0002 |
| Synthetic 10 Hz, no latency/loss/jitter | 16.7% stationary render frames | 0% |
| Synthetic 10 Hz, 100 or 200 ms one-way delay | no prediction/buffering | 0.12% stationary remote frames, no hard snaps/backward steps |
| Full 144-case synthetic 10/15/20 Hz × latency 0/50/100/200 × jitter 0/25/50 × loss 0/1/3/5 | not available | worst stationary remote share 0.36%; no hard snaps/backward steps |
| Synthetic JSON movement bytes/entity/sec at 0 delay | not measured | roughly 1,102 / 1,867 / 2,205 at 10/15/20 Hz |

The transport assay uses a straight path and deterministic injected transport. It is not a multiplayer capacity or GPU benchmark. Keep 10 Hz: measured smoothness is adequate with presentation and 15/20 Hz increase payload volume. Source/results: tools/movement-benchmark.mjs and docs/assays/movement-network.json.

Live browser checks used two distinct authenticated WebSocket actors, City Explorer and motionwitness, in Town and Training Yard. The witness applied 100 ms one-way latency /25 ms jitter /3% snapshot loss, then 200/50/5 with a 30 FPS cap. The witness observed continuous movement, including a sampled 181.8-unit/sec remote velocity in the stress run. Raw DOM diagnostics and local/Pet animation phases are saved in docs/assays/movement-live-browser.json. Local gait advanced through frames 7→3→7→2 at sampled speeds 130.3→178.2→180.4→176.8 units/sec. Mochi advanced through separate quadruped gait frames, turned and came to rest. No hard snaps appeared in the recorded diagnostics.

Uncapped Town browser samples with two clients: 57–62 FPS, p95 17.2–18.7 ms, sampled CPU update 1.0–2.1 ms. Training Yard CPU update sampled 0.3–0.7 ms. With a 30 FPS cap, settled samples were approximately 30–31 FPS and p95 33–35 ms. Capturing many screenshots perturbed a stress-run frame to 49.5 ms /20 FPS; capture overhead must not be mistaken for a steady renderer baseline. A true 120 Hz browser/display was not available; 120 FPS consistency is covered by the logical replay, and a developer cap is available. No GC trace or sustained 40-player load test was performed.

Developer-only World diagnostics now expose FPS/frame delta, server Hz, snapshot buffer lengths/delay, accepted packet interval maximum, ping, prediction error, corrections/sec, hard snaps, local/remote speed, animation/facing, waypoint and remaining path nodes. Controls inject the required latency/jitter/loss values, cap rendering, inspect anchors/routes, and preview every walk frame. Loss drops movement snapshots only; it simulates application-level missed updates over a reliable WebSocket, not actual TCP loss.

## Art and limitations

Two villagers and both Mochi archetypes have four diagonal directional walk sets × eight frames (128 frames), plus directional idle. Gaits have grounded contact/stance, lifted passing/up, articulated knees/feet and alternating contacts. Quadrupeds use diagonal leg pairs. Progress is accumulated world distance /105 units for humans or /82 for Mochi; direction changes preserve phase. Eight logical facing sectors use hysteresis and map to the current four art directions. Body movement only complements the articulated legs. Camera/network motion is not projected-axis interpolation.

The temporary rig retains original painted upper bodies with code-drawn articulated legs; it is coherent prototype art, not production animation. Full eight-direction artist frames, arm/tail motion and richer species-specific gait styling are still needed. The atlas adapter uses fixed untrimmed 160×180 cells and a common ground pivot. Trimmed replacements must retain original source-frame rectangle and trim offsets. See web/assets/isoworld/locomotion-v1.json and docs/ASSET_PIPELINE.md. Foot-contact hooks fire at gait half cycles; surface-specific audio remains a hook rather than a new gameplay system.

Gathering still validates an approach, stops the authoritative path, and does not teleport to nodes. Combat approach uses the same prediction/traversal; stopping clears walk and existing attack effects remain. Fishing/chopping currently use their existing interaction effects, not new full skeletal interaction animations. Emergency companion reposition now occurs only beyond 650 units; disconnected/invalid rooms still reset presentation authoritatively. Extreme outages, sudden collision rejection and major corrections can visibly hold/snap by design.

The unchanged navigation implementation was also profiled natively: first obstructed Town route to Neri took 30.9 ms, warmed mean 5.7 ms; Alder route warmed mean 7.0 ms, maximum 8.2 ms; unobstructed direct route averaged 0.05 ms. Grid preparation now runs during room load on both client and server. Ordinary click-to-move calculates the route once, rather than once for eligibility and again for prediction. No claim is made that all large-grid routes have the same cost.

Final local delayed-input check: 100 ms one-way latency, 25 ms jitter, 3% missed snapshots and 30 FPS cap. The first captured pose was already walking at 9.87 units/sec during acceleration; later captured speed was 182.29. Sampled prediction error was 0.31 units with zero hard snaps; the completed route recorded nine small corrections and returned to idle. See assays/movement-local-100ms.json. Developer controls were reset and the second test tab closed afterward. Authoritative movement retains normal timer jitter and caps suspended gaps at 250 ms; render/prediction deltas cap at 100 ms. This avoids throwing away a few milliseconds on every slightly-late 10 Hz tick.

Gathering now records an authoritative facing vector toward the validated resource when it stops movement. Idle player facing follows that confirmed pose; WALK still depends on actual visual velocity. Seated upper-body scaling remains consistent with existing chair art, and repeated seated snapshots do not inflate hard-snap counts. Atlas validation, seating metrics and ordinary authoritative timer jitter have regression coverage. Final validation: 145 JavaScript tests, 21 Python tests, successful production build.

## Production Animation Upgrade

2026-10-06: the previous presentation used `WalkFrames.createWalkFrames`: the
original painted upper 77% (human) / 80% (beast) was placed over newly drawn
hip/knee/foot strokes. Only the cutout translated slightly; arms, clothing, hair,
head and tails did not participate. Idle was one static direction pose. The
128-frame PNG was a useful control, not finished art.

That generator has been removed. Normal play now loads original painterly
**full-body** walk and idle frames through `animation/registry.js` and
`animation/atlas.js`. Two human outfits, Moonfox and Woodland Deer each have
four art directions and eight walk/eight idle frame slots per direction. Eight
logical directions remain supported, and eight distinct art rows can replace the
four-view sets without changing movement. Human arm swing, torso/hip response,
cloth/satchel/hair motion are painted into each frame; the beasts include head,
spine, ear and tail changes. Basic idle includes breathing, blinking and weight
shift. A short grounded crossfade settles walk into compatible idle.

`AnimationPlayback` consumes **actual gait distance**, not elapsed walk time;
turns preserve phase. Metadata supplies strides/body types/idle timing and
catch-up thresholds. Remote animation continues to consume interpolated visual
velocity. The underlying Gait, paths, prediction, settlement, camera spring,
network protocol and server rate are unchanged.

Generated grids required registration: explicit row boundaries, largest alpha
silhouette source rectangles, original 224×224 canvas, trim offsets and one
normalized foot pivot (.5,.88). Pixels are preserved, and frames are never
individually resized by their silhouette. One shared median source height per
state keeps idle/walk scale comparable. Nameplates/bubbles use fixed logical
entity height; shadows and depth remain at the world ground anchor.

`AppearanceCache` precomposes existing equipment placeholders into synchronized
sheets (128 pixel cells for NPC/remotes, 192 for the local player), with common
224-unit logical canvas/pivot. Clothing/hair/boots in base outfits are painted
full-body art. Additional existing hats/aprons/charms/capes remain simple
placeholders; a boot color overlay follows the painted feet. Cache limit eight
bounds memory; excess appearances retain compatible base and attachment layers.
The obsolete baked-leg atlas loads only through an explicit developer comparison
control, never normal play.

The new art is **cohesive provisional full-body art**, not artist-final production
cycles. Generated rear views required row mapping, a mirrored Moonfox NW fallback
and reuse of a compatible human NW contact pose. Rich eight-view painted art,
authored separate trot cycles, contact/stride polish and painted cosmetic/action
sets remain artist work. See `ANIMATION_DELIVERY.md` and the exact prompts in
`ANIMATION_PROMPTS.md` for evidence and replacement details.

## Multiplayer reliability follow-up

The real session harness now checks both Moonfox and Woodland Deer through walk,
turn, catch-up, settle, resume and a room transition. See
[MULTIPLAYER_SOAK.md](MULTIPLAYER_SOAK.md) and the multiplayer assays for evidence.
Momo's captured spawn offset was blocked; an exact-coordinate regression verifies
nearest-walkable companion placement. The existing controller and movement rate
remain unchanged. Renderer performance is reported separately from server timing.
