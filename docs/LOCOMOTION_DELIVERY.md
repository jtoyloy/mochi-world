# Locomotion delivery — 2026-10-05

1. **Root causes:** waypoint budget loss, snapshot catch-up/idle pulses, no local prediction, static poses, a slow camera and sampled NPC presentation. First-use grid preparation added about 31 ms; ordinary clicks also calculated their route twice. Detailed evidence: [MOVEMENT_AUDIT.md](MOVEMENT_AUDIT.md).
2. **Old architecture:** click → path validation → server-only movement → latest-target chase → four static textures plus wall-clock bob.
3. **New architecture:** shared logical-world continuous traversal, immediate local prediction, timestamped network buffers, distance-driven gait and visual-player spring camera.
4. **Prediction:** the client routes from its visual pose before sending a destination/sequence/timestamp; the server independently reroutes. Client positions/speeds never grant authoritative state.
5. **Reconciliation:** sequence/time guards, present-time advancement, continuous correction offset at 18/sec, three-unit correction counter threshold, 160-unit snap threshold. Rejections stop presentation and clear destination feedback.
6. **Remote interpolation:** initial 120 ms delayed logical-coordinate buffer, adaptive recent-arrival-lag cushion, 120 ms bounded extrapolation, then hold. Out-of-order/duplicate samples are ignored.
7. **Rates:** 10 Hz movement remains the default; MOVEMENT_HZ supports 15/20. Rendering is independent. Synthetic bandwidth comparison favors 10 Hz given successful presentation.
8. **Frames:** two villagers and two beast archetypes, each four directions × eight genuine articulated gait frames. Fixed 160×180 cells, original source/pivot metadata and a replaceable texture contract. Developer preview exposes all 128 frames.
9. **Directions:** SE/SW/NW/NE art now; eight-sector facing with boundary hysteresis is implemented. Full eight-direction artist art remains needed.
10. **Speed sync:** gait distance /105 human units or /82 Mochi units; projected foot-stride geometry matches those loops. Speed changes automatically change cadence; stopped entities stop their gait. Turns retain phase and alternating contact hooks.
11. **Waypoints:** unused distance carries through successive segments/corners in a single update. Render/prediction deltas are capped at 100 ms; the authoritative clock retains ordinary 10 Hz timer jitter and caps suspension gaps at 250 ms. The 1,000-unit test improved from 10.0 to 5.6 seconds.
12. **Camera:** critically damped 16/sec spring follows the predicted local pose; projection/depth remain world-derived. State collection copies are cached between updates.
13. **Mochi:** accelerated following, rotating rear/side formation, near/far bands, bounded catch-up and emergency relocation only beyond 650 units. Brain-selected combat movement uses the same continuous body traversal without replacing Cadence decisions.
14. **NPCs:** authored routes are evaluated at frame time and share the articulated gait; intentional route rests remain.
15. **Network tests:** 144 deterministic latency/jitter/loss/rate cases; worst stationary remote share 0.36%, no hard snaps/backsteps on the straight-path assay. Two live authenticated actors tested Town and Yard with 100/25/3 and 200/50/5 settings. Snapshot loss is application simulation over reliable WebSocket. [Synthetic results](assays/movement-network.json), [live observations](assays/movement-live-browser.json), [local 100 ms delay](assays/movement-local-100ms.json).
16. **Timing:** uncapped Town samples 57–62 FPS, p95 17.2–18.7 ms, CPU update 1.0–2.1 ms with two clients. Yard CPU 0.3–0.7 ms. A 30 FPS cap gave about 33–35 ms p95; screenshot capture itself caused a 49.5 ms stress frame. 120 Hz display unavailable; logic is verified at 120 FPS.
17. **Tests:** 21 new movement checks cover overshoot, frame-rate equivalence, delta clamps, blocked segments, facing, contacts/state/phase, timestamps, interpolation/extrapolation, adaptive delay, prediction/rejection/reconciliation, formation, camera spring, authoritative sequencing and continuous combat motors. Full suite: **145 JavaScript /21 Python tests pass**, plus successful Vite build.
18. **Limits:** no sustained 40-player/GC benchmark; extreme packet stalls hold, significant invalid corrections can snap; artist-quality arm/tail and interaction cycles remain future work. Live two-tab verification used distinct WebSocket actors in one local browser cookie jar, so it validates motion presentation rather than isolated-profile HTTP account flows. Use separate browser profiles for normal multi-account play.
19. **Art still needed:** production eight-direction idle/walk sheets with consistent source rectangles/pivots, original painted limb detail, arm/tail swing and richer species-specific walk/trot variation. The implemented temporary frames visibly articulate alternating legs and support replacement without changing movement code.

## Run and inspect

```sh
npm test
npm run test:brain
npm run bench:movement
npm run build
npm start
```

Use Development World diagnostics for network settings, FPS caps, movement metrics, route/anchor overlays and the walk-frame gallery. Existing combat, gathering, shops, trading and brain packs are preserved. No major gameplay system was added.
