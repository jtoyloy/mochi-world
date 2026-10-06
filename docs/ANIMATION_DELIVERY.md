# Full-body animation delivery — 2026-10-06

The normal player/NPC/Mochi renderer now uses cohesive full-body painted frames.
This delivers the allowed temporary full-body milestone and a replaceable asset
pipeline; it does not claim artist-final production animation.

| Requested report | Implemented result |
|---|---|
| 1. Old implementation | Static painted upper cutout plus procedurally drawn legs, four views, static idle. Generator removed; baked PNG retained only as developer control. |
| 2. New architecture | Shared character/species profiles; registered Texture frames; presentation-only AnimationPlayback; bounded precomposed AppearanceCache. |
| 3. Directions | Eight logical sectors; four current painted diagonal views. Registry/loader accept eight distinct ordered art directions. Explicit mirror fallback for fox NW and vendor rear gestures. |
| 4. Walk frames | Eight slots per direction, four directions × four bases = 128 walk slots. One human NW contact uses the adjacent compatible pose to correct a bad generated facing. |
| 5. Idle | Eight quiet frames per view/base = 128 idle slots. Blink, breathing and weight shift; beasts add ear/head/tail changes. Seeded NPC timing avoids synchronized idles. |
| 6. Full-body changes | Human opposite arm/leg motion, torso/hip response, satchel/clothing/hair response. Fox head/spine/tail/ear motion; deer deliberate steps, chest/head/antler/ear motion. No drawn leg strokes under static torsos. |
| 7. Distance sync | Playback consumes Gait.distance deltas. Frame = floor(wrapped phase × 8). Turns keep phase; walk is never wall-clock-only. Idle and 140ms settle are time-based. |
| 8. Stride | Profile data: humans 105, fox 82, deer 112 world units/loop. Catch-up profiles 105/140 with thresholds/hysteresis 195/175 and 200/180. These reuse walk poses as a provisional trot; separate trot artwork remains needed. |
| 9. Player variants | Both existing playable bases: chestnut/sage and dark curls/coral. Unknown appearances use compatible human base; existing appearance selection preserved. |
| 10. Mochis | Both current rendered beasts: Moonfox and Woodland Deer. Existing saved archetype/variant mapping preserved. |
| 11. Species differences | Light fox diagonal stepping/tail response versus heavier deer step/head/antler response; independent stride, idle timing, catch-up thresholds. Categories include biped/quadruped/hopper/floating/scuttler/serpentine for future art, not new gameplay species. |
| 12. NPCs | Shared animated bodies for all authored residents and vendors. Walk/idle/talk/gesture supported; major keeper accessories retained. Vendor gesture sheet lazy-loaded. Sit remains compatible original seated pose; unique vendor-action art can replace shared sets. |
| 13. Anchors | Fixed 224×224 source canvas, ground pivot (.5,.88), logical head anchor (.5,.12); sourceSize/spriteSourceSize/pivot retained for trimmed frames. Ground shadow/depth and stable nameplate/bubble anchors do not use current frame bounds. |
| 14. Cosmetics | Precomposed base outfits + cached equipment sheets, not extra unsynchronized full bodies. Existing placeholder badges/aprons/hats/capes are baked with shared frame/direction/anchor and subtle secondary phase. Local cache cells 192px, NPC/remote 128px. Eight-entry cap; beyond cap compatible attachment fallback remains. |
| 15. Atlases | Four original 1254² RGBA sheets, 64 source slots each; one shared 1402×1122 vendor sheet with 48 distinct gesture drawings. Registered metadata maps view/state frames and documents mirrors/reused poses. Normal locomotion uses four requests, not requests per frame. |
| 16. Viewer | Development World diagnostics → Animation viewer. Body/species, all eight logical directions, idle/walk/trot/talk/vendor idle/gesture, 50/100/150% speed, frame/phase/stride and optional source/trim/ground/head guides. Client-only 20/40 crowd controls and explicit legacy comparison. |
| 17. Performance | Live matched preliminary renderer comparison at1280×900/DPR2: base scene 60FPS/p95≈17ms;20+20 legacy60/p95 17.6ms/CPU4.1ms vs full-body60/17.5ms/4.3ms.40+40 both60 ticker FPS but p95≈33.4ms, CPU7.7 vs7.1ms. Same three GL draws. Those controls share the new controller and texture cache; this is a visual-path comparison, not a historical full-code benchmark or server soak. Later layout-read caching and lower-resolution appearance sheets further reduce update/cache costs; final samples in assays. |
| 18. Tests | Animation tests cover wrapped phase/frame selection,4/8-view mapping, turns,50/100/150% scaling, stop/settle, idle thresholds, remote numerical-noise hysteresis, fallback, species profiles, source dimensions, trim/pivots, all PNG/frame definitions. Existing movement/server/combat/gathering checks retained. |
| 19. Missing production art | Final distinct eight views, fully authored contact registration, separate trot/run, painted cosmetics and action sets. Current generated art includes uneven pose refinement, mirrored/reused rear fallbacks and provisional gait-contact timing. |
| 20. Exact remaining art tasks | Paint N/E/S/W for all four bases; replace fox NW mirror and human NW contact reuse; align planted feet to measured105/82/112 strides and refine hip/arm counter-motion; author eight-frame trot with105/140 strides; paint synchronized hat/cape/boots/accessories and outfit variants; paint vendor-specific talk/gesture/sit; author attack/cast/hurt/defend/defeat/fish/chop/interact states; refine animal-specific tail/ear/spine motion and stop/contact poses. |

## Validation and practical limits

- Actual observer used two independently authenticated clients: browser City
  Explorer/Momo and a Node WebSocket motionwitness sending validated destination
  intents. Browser animation state/speed/frame samples are saved in assays; this
  is not a second rendered browser profile or a many-client capacity test.
- Synthetic crowd draws one local player/Mochi plus20/40 players and20/40 beasts,
  alongside the existing12 Town residents and six additional vendor/buyer actors.
  It exercises real sprite/gait/label rendering but bypasses snapshot networking
  for synthetic circles. It never joins fake users or modifies server state.
- Four full-body source sheets decode to23.99MiB RGBA; optional shared gestures
  add6.0MiB. Appearance caches add4MiB per NPC/remote appearance or9MiB per local
  appearance (maximum eight entries). Original seated art, world atlases, text
  textures/render targets are extra. These are allocation estimates, not total
  GPU VRAM measurements. Legacy comparison retains newer cached textures.
- Source frames use a single height per state; no independent per-frame size
  normalization. Generated contact timing still needs artist refinement; no
  claim of perfect physical foot planting or zero visual drift.
- No new sprint, Cadence mechanism, combat rule, gathering rule, navigation,
  prediction, reconciliation, network message or server Hz change.

## Run / inspect / replace

```
npm run assets:register
npm run assets:validate
npm run test:animation
npm test
npm run build
npm start
```

`assets:register` writes metadata only, never modifies PNG pixels. Its authored
row boundaries and explicit rear-view mappings are specific to these provisional
sheets. Artist exports should provide their own source rectangles, sourceSize,
spriteSourceSize, fixed pivot and directional row maps; validate before loading.
Add art-defined states to the atlas selector using the same canvas/anchor contract.

## Final measured pass and execution evidence

After caching viewport reads/unchanged speech text and precomposing equipment,
the final1280×900/DPR1 samples were:

| Scene | FPS HUD | p95 | CPU update sample | GL draws | Visible sprites | RGBA caches |
|---|---:|---:|---:|---:|---:|---:|
| Local player/Mochi + existing Town actors |60|17.5ms|0.4ms|1|75|37MiB|
|20 simulated players +20 Mochis|60|17.4ms|1.0ms|2|114|37MiB|
|40 simulated players +40 Mochis|60 before capture /30 during capture|33.9–34.0ms|1.2–1.3ms|2|154|37MiB|

These final samples have different DPR from the preliminary matched comparison.
Do not attribute all timing differences to the code/art change. The40/40 scene
has not demonstrated sustained60FPS/p95≈16.7ms; screenshot/focus perturbations
and desktop load remain part of the observation. Total VRAM was not measured.

Final automated results: **156 JavaScript tests passed,21 Python tests passed,
asset validation and Vite production build passed.**

Browser observer recorded motionwitness walking at170.89 units/sec with frame0,
while the local player executed a new validated path and retained northward
facing after stopping with four small corrections and zero hard snaps. The
species viewer and synthetic crowd exercised both beast profiles across speed,
turn, idle and catch-up states. A later same-user connection conflict showed
“Open in another tab”; the temporary observer was closed rather than competing
with the user's active game. Therefore final live server-follow acceptance for
each species is **not claimed**. Momo stayed near the original Town spawn during
the sampled local route; this route/follow/session interaction needs a separate
isolated-client check. No movement/follow mechanism was changed to hide it.

Evidence: `assays/animation-acceptance.json`, `assays/animation-crowd.json`,
`screenshots/animation-human-viewer.png`, `animation-moonfox-viewer.png`,
`animation-crowd-40.png`.

An isolated controller→Gait→AnimationPlayback integration test now covers both
species following in Yard, turning, catching up, settling idle and resuming.
This passes using the existing follow controller and does not override the live
browser-session limitation above.
