# Real multiplayer soak

This harness runs `server/index.mjs`, PostgreSQL, native Cadence background ticks,
independent persisted accounts/game-session cookies, and real `/socket` upgrades.
Actors send destination intents; the server validates paths, moves at 10 Hz and
broadcasts authoritative companion snapshots. There are no synthetic sprites or
client-provided positions. Development login provisions accounts; the WebSocket
uses the ordinary unexpired-session and Origin checks.

## Run

Install npm dependencies and the native Python dependencies from `requirements.txt`.
Use a local/test PostgreSQL URL, never production. Each run creates a uniquely
named disposable schema, applies all four schemas, seeds the normal item/room/shop/achievement/trophy definitions and
adopts one owned companion per actor. It drops only that generated schema on
normal completion, including failure. No token, trade, sale, gathering, reward,
or combat action is sent. Native background paper trading remains enabled.

```
TEST_DATABASE_URL=postgresql://... npm run bench:multiplayer -- --profile=smoke
TEST_DATABASE_URL=postgresql://... npm run bench:multiplayer -- --users=150 --profile=test
TEST_DATABASE_URL=postgresql://... npm run bench:multiplayer -- --users=150 --profile=soak
```

Profiles are 300 seconds, 1,800 seconds and 14,400 seconds **at load**, plus
account setup, follow acceptance and cleanup. New runs isolate native checkpoint
files in a generated `data/soak_<uuid>-checkpoints` directory, removed only after
the owned server exits. `CHECKPOINT_DIRECTORY` configures that storage boundary.
Five-second windows are also written incrementally to ignored
`data/multiplayer-<CCU>-<seconds>s-soak_<uuid>-windows.jsonl`, so an interrupted longer soak
retains diagnostics. SIGINT/SIGTERM request orderly teardown and mark the result
interrupted rather than passed. `--seconds=28800` permits an
8-hour run. Default counts: 10,25,40,75,150. Runs are sequential. Configurable
`--capacity=40` keeps normal room instancing (1–100); `--rooms=town` deliberately
packs Town instances. Default weighted rooms are
`town,town,town,forest,lake,market,exchange`: 150 users start as 66 Town users
across two instances and 21 in each other room. Transitions change occupancy.

Use `--seed=42`, `--port=8898`, `--transition=.025`, `--reconnect=.002`,
`--move=.45`, `--stop=.15`, `--emote=.035`, `--interact=.025` to configure the
workload. Each actor makes one ordered choice per approximately one-second
round: reconnect, transition, emote, safe prop interaction, new destination,
stop at its latest authoritative location, or hold. Probabilities are conditional
on preceding branches not being selected. Every round sends an application ping; a ten-second keepalive also covers setup/follow;
ordinary WebSocket pong is automatic. Stop and changed destinations go through
normal validated movement intents. Staggered server responses jitter the rounds.

Forest/Lake fixture locations and destinations avoid mob activation radii. Before
returning to these rooms the test schema's saved avatar is set to the safe entry
and the ordinary active-companion refresh endpoint reloads it. This fixture
preparation adds database/HTTP work; movement and all snapshots remain server
owned. It is not a combat capacity assay. Existing autonomous speech, encounters,
adventure broadcasts and persistence timers are enabled.

## Metrics and acceptance

`MULTIPLAYER_METRICS=true` enables IPC diagnostics only, with no public endpoint.
The harness requests five-second windows and saves them in
`assays/multiplayer-<CCU>-<seconds>s.json`. JSON includes failures and does not
store cookies, tokens or database URLs. A failed acceptance returns a nonzero
exit status while preserving its assay. Tests cover query accounting through
both callback pool internals and transaction clients.

- Node CPU is elapsed process CPU / elapsed wall time: 1.0 means one fully busy
  core. RSS, heap, external/array buffers, event-loop p99/max are actual samples.
- Process-tree sampling uses `ps` cumulative CPU and RSS for Node and descendant
  Python hosts. It excludes the load generator and PostgreSQL. Summed RSS can
  count shared pages twice. Process churn can make cumulative CPU differencing
  undercount exited descendants; retain Node's exact CPU counter separately.
- WebSocket inbound/outbound rates count application JSON payload bytes and
  recipient messages. They exclude TCP/TLS/WebSocket framing, retransmission,
  HTTP fixture requests, asset downloads and PostgreSQL traffic. The original assays count both closed-socket skips and backpressure as
  `droppedUpdates`; those totals cannot establish backpressure alone. New runs
  additionally separate `closedSocketSkips` and `backpressureDrops`.
- Room occupancy is sampled per instance in newer runs. Per-room tick duration
  sums synchronous actor work in each room; the whole movement pass is separately
  measured. Additional diagnostics were introduced during development; a missing
  metric in an earlier assay means unmeasured, never zero.
- Movement validation measures `handle(move)`; dispatch includes the socket's
  serial queue wait. Tick duration measures the entire authoritative movement
  pass across rooms. Timing histograms provide p95 **upper bucket bounds**,
  means and exact maxima; they do not pretend to be exact percentiles.
- Snapshot latency is server timestamp to Node client receipt on the same host
  clock. Arrival gaps and out-of-order updates are separate. Client ring samples
  retain up to 10,000 arrivals per actor; their percentiles describe the retained
  window. These are loopback transport measurements, not WAN or render latency.
- Companion update rates, missing/wrong owned companions, stale actors,
  disconnects/reconnects, room/socket/companion counts, adventure caches and
  active-resource types are recorded. There is no protocol sequence for every
  broadcast: gaps identify late arrivals, not proof of packet loss. WebSocket
  is reliable; dropped outbound updates are directly measured on the server.

Pass requires the intended session/companion count in sampled load windows,
no stale actors, late snapshots, backpressure drops, unexpected disconnects,
server/harness errors, failed follow acceptance, or retained room/socket/idle
adventure state after cleanup, plus a maximum movement pass below its 100 ms
budget. Planned reconnects are not failures. This does not assert 60 FPS.

## Companion reliability and Momo

Both profiles have independent persisted Mochis, including the explicit
`profile.beast.archetype` used by presentation. Before load the real session
executes walk, turn, catch-up, stop/settle, resume, and transition to Yard.
Acceptance checks moving owners, settled companion speed/distance, species and
unchanged owned companion ID. Raw received snapshots and phase captures are
retained in newer assays. The server uses the same follow controller for both
species; this is authoritative follow acceptance, not a painted-frame review.

The previous browser capture in `docs/assays/animation-acceptance.json` recorded
City Explorer at `(1309.38,964.55)` and Momo at `(1214.38,1004.55)`. The owner's
point is walkable; Momo's point is blocked. It exactly equals the unvalidated
spawn/refresh offset `owner + (-95,+40)`. `NavigationService.findPath` refuses
blocked starts, so the companion controller could not route out; the 650-unit
emergency distance was not yet reached (the final captured gap was about 629
units). This is a **room-state placement defect**
that strands the controller, with a separate recorded duplicate-session conflict.
There is no saved packet trace proving whether that historical browser also had
stale snapshots. The placement failure is independently reproducible and fixed;
the session-conflict explanation alone is insufficient.

Join and refresh now project the companion offset to the existing nearest
walkable floor. A regression uses the exact captured coordinates and verifies
movement away from the spawn. No follow speed, animation registry, assets,
Cadence mechanism, or tick frequency changed. Existing one-account/one-connection
protection stays enabled; load/observers use distinct accounts.

Reliability fixes also serialize each broadcast once rather than per recipient,
expire encounter cooldown entries, persist/evict disconnected idle adventure
states, and refuse late asynchronous connection/room registration after close.
Pending combat settlement deliberately remains retained; this safe-movement soak
does not certify cleanup for a disconnect during active combat.

## Checkpoint disk growth

Native checkpoints are real, not stubbed. During development, 790 generated life
files occupied 5.28 GiB; median life size was 6.23 MiB. Existing storage appends
versions and has no retention policy. At one five-minute decision per pet, 150
awake pets can write approximately **10.9 GiB/hour**, before variation in checkpoint
size or decision schedules. Allow roughly 45 GiB for a four-hour soak plus headroom.
The updated harness isolates and removes its own checkpoint folder after teardown;
it does not delete production history or change brain packs. Disk-retention policy
is a separate launch requirement. The early measurements used the default local
checkpoint folder; its test files are not evidence of a memory leak.

## Evidence retained in this integration

[Compact original evidence](assays/multiplayer-summary.json) preserves run summaries,
original pass/fail flags, species follow results, cleanup counts, client error counts,
checkpoint disk incident, preliminary failure explanations and renderer samples.
Source filenames and SHA-256 hashes identify the original runs in sibling commit
`7e7066256352557684a062119ad99a83c1f01fae`. Raw window logs, process samples,
full follow traces and transient failure dumps are excluded from this integration.
Generated `assays/multiplayer-*.json`/`.jsonl` and `data/` are ignored. Historical
filenames below identify original evidence; they are not shipped raw files.

**150 CCU is not launch-certified. Checkpoint retention is an unresolved launch
blocker.** This integration does not delete production checkpoints or implement
retention. A short integration recheck cannot replace capacity certification.

## Measured results

Completed assays below retain their original failures. CPU/RAM are workload-specific;
room occupancy and protocol fanout matter more than CCU alone. A 150-session
multi-room result does not establish a single 150-player room or client 60 FPS.

Measured on Apple M2, arm64, eight logical CPUs, Node 23.9.0 and local PostgreSQL
16.14. The five-minute suite overlapped the separate thirty-minute 150-user run
and other development work. These are per-application measurements under shared
host contention, **not isolated production hardware benchmarks**. PostgreSQL CPU
and RSS were not attributed; process-tree values include the real native Python
brain worker. No TLS proxy or WAN was involved.

Each row below is five minutes at the requested load. CPU units are busy cores;
RAM units are MiB. Tree CPU lists mean / p95 sampled intervals; RAM lists Node /
Node+Python peak. Outbound is decimal MB/s, inbound decimal kB/s, DB is queries/s.
Tick lists mean / p95 bucket upper bound / exact steady-window maximum in ms.

| Sessions | Node CPU mean | Tree CPU mean / p95 | Peak RAM Node / tree MiB | Out MB/s | In kB/s | DB q/s | Tick ms mean / p95 / max | Acceptance |
|---:|---:|---:|---:|---:|---:|---:|---:|:---|
| 10 | 0.016 | 0.032 / 0.134 | 212.9 / 599.7 | 0.206 | 1.01 | 44.6 | 0.42 / ≤1 / 10.19 | PASS |
| 25 | 0.035 | 0.077 / 0.833 | 220.6 / 747.7 | 1.297 | 2.50 | 107.7 | 1.41 / ≤4 / 101.26 | FAIL |
| 40 | 0.058 | 0.109 / 0.868 | 281.8 / 764.7 | 3.162 | 3.97 | 172.3 | 2.79 / ≤8 / 32.11 | FAIL |
| 75 | 0.123 | 0.233 / 1.027 | 291.5 / 836.2 | 10.163 | 7.39 | 311.0 | 7.72 / ≤16 / 70.43 | FAIL |
| 150 | 0.268 | 0.390 / 1.081 | 316.5 / 834.4 | 28.200 | 14.33 | 615.8 | 16.50 / ≤32 / 96.15 | FAIL |

The 10-user run passed. The 25-user run had a 101.26 ms movement pass; 40 had two
unreachable intents; 75 had one blocked-path intent. The 150-user smoke had four
unreachable intents, 399 stderr chunks reporting native checkpoint disk errors,
and about 715 send skips in steady windows. No result has been relabeled as a
pass after repairing tooling. All five cases passed both species' authoritative
follow sequence and ended with zero players, sockets, rooms, companions and idle
adventure states. Reconnect counts were 3, 18, 19, 46 and 83. No unexpected
socket disconnects, stale actors, wrong/missing companions or out-of-order
snapshots were recorded. Loopback snapshot p95 was 1, 3, 5, 10 and 23 ms.

### Thirty-minute 150-session result: failed

The thirty-minute run recorded 149–150 simultaneous sessions (a planned reconnect
was sampled), 492 reconnects, zero unexpected disconnects and zero wrong/missing
companions. It delivered 1,477 companion updates/s, 42,220 recipient messages/s,
28.435 MB/s outbound JSON payload (**227.5 Mbit/s**) and 14.411 kB/s inbound.
Database demand was 583 queries/s. Node CPU averaged 0.319 cores; Node+Python
averaged 0.569 cores, with sampled p95 1.196 cores. Peak RAM was 283.7 MiB Node
and 795.1 MiB summed process tree; peak Node heap was 108.1 MiB.

Steady-window whole tick mean was 20.79 ms, p95 upper bound 32 ms, maximum
173.20 ms. The first setup/at-load window, excluded from steady aggregates,
contained a **533.54 ms** tick; it remains in raw samples. Tick interval mean
was 101.48 ms, steady maximum 190 ms. Maximum window event-loop p99 was 70.91 ms;
movement validation mean 0.434 ms, p95 upper bound 4 ms, maximum 52.42 ms.
Dispatch maximum including queue wait was 796.33 ms. Loopback snapshot p95 was
28 ms; arrival-gap p95 124 ms, maximum 216 ms. This misses reliable 100 ms service
under the measured conditions.

Failures included 17 unreachable intents, four safe prop interaction requests
refused with "Walk closer to interact", about 4,142 steady send skips, and 258
stderr chunks of ENOSPC checkpoint failures. Closed-socket versus backpressure
counts were conflated in this run. Refused requests were not bypassed: authority
held the body to validated paths. The original generator selected merely walkable
points; the finalized generator also checks routing from the latest authoritative
position and uses seated approach points for stop intents. It retains exact
rejected-request metadata. These changes require a new sustained run; they do
not erase the measured errors. **150 CCU is not launch-certified.**

### Memory, timers and disk

In the thirty-minute run heap fell from 97.1 to 34.2 MiB across steady endpoint
samples. First/last five-minute heap low-water marks were 16.44 / 19.38 MiB;
Node RSS fell from 283.7 to 225.7 MiB. This does not show unbounded JS memory
growth over thirty minutes. All room/socket/companion/idle adventure maps were
empty after five-second teardown. Resource snapshots contained 0–10 Timeouts
at load and nine after cleanup, representing still-running server/pool/native
schedulers rather than one leaked timer per departed actor. Encounter entries
peaked at 2,375 and 1,832 remained immediately after cleanup; the new 120-second
expiry bounds their lifetime, but this run did not wait out that TTL. Pending
combat state and multi-hour retention remain unverified. Disk failure disrupted
native scheduling, so these memory results are **not a clean multi-hour leak
certificate**.

The two completed 150-user runs exhausted the shared test disk: about 128 MiB
remained and native checkpoint/temp-file writes failed. Cleanup removed 1,468
obsolete test checkpoint versions (10.20 GiB), preserving all 156 keys still
referenced by PostgreSQL and all published packs. See
`assays/multiplayer-disk-incident.json`. The harness now isolates its own storage;
production checkpoint retention is still unresolved and is a launch blocker.

### Browser presentation and reproducibility limits

`assays/multiplayer-presentation.json` separately records 39 authenticated socket
actors plus an independent authenticated browser owner/Mochi: 40 players and 40
Mochis through real snapshots, no synthetic crowd. One DPR-2 Town sample rendered
98 entities at **20 FPS**, frame p95 66.3 ms, interpolation 132 ms and zero hard
snaps. After actors left, 20 entities rendered at 60 FPS; the HUD incorrectly
retained the previous player count. Browser focus/visibility and cohost load were
uncontrolled, and no sustained browser/GPU-memory trace was collected. This does
not establish sustained 60 FPS at 40 players or painted follow acceptance for
both species. The raw species tests establish server follow and ownership.

Assays include source hashes because diagnostics evolved during the suite:
room-timing/occupancy and GC fields are absent in some earlier cases. Completed
capacity cases seeded items, while final tooling seeds the full normal catalog.
Concurrent earlier runs reused account names in separate schemas, which can
share database advisory-lock IDs; final tooling uses a unique prefix per run.
Two short follow retries timed out, including one large host-clock jump; raw
timeout assays are retained. Setup/follow now also sends application pings.
Host suspension invalidates sustained timing acceptance. The final short recheck
validates the repaired generator/storage setup, not a
replacement for the five/thirty-minute suite. Preliminary failed harness runs
and aborted attempts remain saved alongside the completed assays.

### Launch sizing recommendation

A **4 vCPU / 8 GiB host** with a ≥1 Gbit/s network is a reasonable starting test
shape for an application and local PostgreSQL at this room distribution, or
separate 2 vCPU / 4 GiB application and 2 vCPU / 4 GiB PostgreSQL machines.
This is headroom extrapolated from measured app/native RSS and CPU; PostgreSQL
resources, x86 performance, TLS, assets, larger registered-pet populations and
WAN variance were not measured. The native scheduler scans registered pets, so
CCU alone does not bound its workload. Additional RAM will not resolve a single
thread's missed tick deadline.

Before approving 150 CCU: implement safe checkpoint retention/storage sizing,
repeat isolated thirty-minute and multi-hour runs on that candidate hardware
with the final full catalog and unique accounts, distinguish backpressure from
planned-close skips, verify TTL cleanup after departure, and repeat sustained
browser follow/FPS acceptance. Preserve server authority, configurable room
capacity and the existing 10 Hz movement architecture.


## Final verification

`assays/multiplayer-2-15s.json` is the final short regression run with full catalog,
unique accounts, isolated checkpoints, route-aware intents and setup/follow pings.
Both species passed, server/harness errors were empty, maximum tick was 8.63 ms,
and cleanup left no rooms, sockets, companions or idle adventure states. Its
owned checkpoint directory and schema were removed after server exit. This
small recheck does not certify revised tooling at 150 CCU.

Validation: 164 JavaScript tests passed with PostgreSQL integration enabled;
21 Python tests passed; asset validation and production build passed;
`git diff --check` passed. No multi-hour run was completed.

## Network scaling remeasurement — 2026-10-06

This work starts from canonical integration base `697cd10`; the historical worker
comparison below was collected against an older remote-main reference. The before
copy keeps that socket protocol and
adds only opt-in instrumentation. After changes are replication, bounded socket
delivery, client snapshot ingestion/interpolation and measurement tooling.
Cadence decisions, rewards, published packs, assets and economy are unchanged.

Reproduction uses PostgreSQL, the existing Python/Cadence environment, real
independent adopted pets and authenticated WebSockets. The generator retains
seed 42, 10 Hz, capacity 40 and the Town/Café/Forest/Lake/Exchange distribution.
Five-minute runs are sequential by population. Before/after 150-user runs are
sequential; early 10-user windows shared this laptop with tests and browser
validation, and the separate before component profile shared the host with a
small after run. These are local macOS/ARM loopback measurements, not WAN/TLS
or a controlled production-host benchmark.

```sh
TEST_DATABASE_URL=postgresql://... npm run bench:multiplayer -- \
  --users=10,25,40,75,150 --seconds=15 --seed=42 --label=smoke
TEST_DATABASE_URL=postgresql://... npm run bench:multiplayer -- \
  --users=10,25,40,75,150 --seconds=300 --seed=42 --label=after
```

Raw windows, source hashes and failed outcomes remain in ignored local assays.
[network-scaling-summary.json](assays/network-scaling-summary.json) contains the
reviewed compact comparison, exact message-size p95s and per-type rates.
Short smoke results include intermediate replication revisions; the five-minute
suite uses stable protocol hashes. A label separates runs without overwriting
evidence. A failed aggregate acceptance remains a failure even when its bandwidth
improves. All navigation/interaction rejections and missed deadlines are retained.

The primary culprit was `playerMoved`: approximately 41,000 recipient messages
per second at roughly 700 JSON bytes, with about 27 recipients per encoded update.
Full companion profile/name/equipment descriptions alone accounted for about
10.64 MB/s in the separate short component profile. Player and companion motion
are now embedded in client batches; their embedded component byte totals are
reported separately from packet totals. NPC routes have no socket state stream.
The safe capacity workload does not engage combat. A separate real two-account
native-pet probe observed **12 identical combat effect sequences per recipient**,
including hit, spell and victory, without errors: 169 mean/180 p95 bytes,
1.46 recipient effects/s, 246 bytes/s and fan-out 2 over 16.49 seconds including
setup/idle. See [network-combat-profile.json](assays/network-combat-profile.json).
This is delivery evidence, not a combat capacity test.

### Browser and queue acceptance

Two real browser clients used separate localhost host cookies and independent
accounts against the real server. Town walking, remote motion and the active
pet remained visible; changing interest frequency never removes room identities.
Observed 60 FPS, frame p95 about 17.4 ms, 120 ms near interpolation, zero
corrections/hard snaps. Emote and public `Hello!` appeared in both clients.
Training Yard target/auto-hit reduced dummy HP, fire reduced mana and HP, the
observer rendered effects, and the owner received `Victory · +0 combat XP`.
[Browser evidence](network-scaling-browser.png) and
[combat evidence](network-scaling-combat.png) capture these local checks.
These samples do not establish crowd FPS, WAN smoothness or a sustained 150-client
browser result. Existing synthetic crowd rendering is not used as load evidence.

Tests verify nested pet/static identity merge, stale sequence/room rejection,
projected hysteresis, idle suppression, immediate stops, owner-only paths,
recovery after intentional delta loss, FIFO critical delivery before movement,
queue/time limits, continuous 5 Hz interpolation with a 220 ms delay, and
monotonic motion through near↔mid delay changes. The first transition test exposed
a backward step; presentation-clock slewing repairs that measured failure.
Deliberate blocked-socket tests coalesce movement, drain hit/result events in
order, and close explicitly at bounded capacity or five seconds. A disconnected
client resynchronizes durable authoritative state; transient effects are not
promised replay after disconnect. Critical events awaiting resync are counted.

A 30-minute 150-pet extension is not practical on this nearly full laptop:
available disk fell to about 7 GiB during validation, while append-only native
checkpoints in the five-minute baseline consumed roughly 1.4 GiB before cleanup.
A sixfold extension risks exhausting the shared filesystem. This work leaves
checkpoint implementation untouched. Repeat 30-minute and multi-hour acceptance
with adequate isolated disk and retention before capacity certification.

### Five-minute results

| Users | Outbound MB/s | Recipient msg/s | Node mean cores | App/native max MiB | Tick mean/max ms | Workload acceptance |
|---:|---:|---:|---:|---:|---:|---|
| 10 | 0.077 | 149 | 0.022 | 473 | 0.96/81.52 | pass; 0 client errors |
| 25 | 0.357 | 411 | 0.071 | 784 | 3.86/50.09 | fail; 1 client errors |
| 40 | 0.751 | 682 | 0.085 | 681 | 4.83/56.93 | fail; 1 client errors |
| 75 | 2.168 | 1355 | 0.181 | 811 | 12.53/76.75 | fail; 2 client errors |
| 150 | 5.909 | 2829 | 0.306 | 856 | 20.61/131.01 | fail; 5 client errors |

| 150-user metric | Before | After |
|---|---:|---:|
| Outbound MB/s | 28.860 | 5.909 |
| Recipient messages/s | 42016.933 | 2828.983 |
| Node mean CPU cores | 0.297 | 0.306 |
| App + native mean CPU cores | 0.522 | 0.513 |
| Node max RSS MiB | 340.359 | 317.344 |
| App + native max RSS MiB | 645.219 | 856.469 |
| Node max heap MiB | 117.490 | 119.012 |
| Maximum window event-loop p95 ms | 35.455 | 35.029 |
| Maximum window event-loop p99 ms | 71.500 | 39.715 |
| Mean tick ms | 22.636 | 20.612 |
| Maximum tick ms | 146.538 | 131.006 |
| Stringify mean ms | 0.003 | 0.011 |
| Serialized JSON MB/s (allocation proxy) | 1.340 | 5.583 |
| GC events/s | 3.264 | 18.130 |
| Client snapshotLatencyP95Ms | 30 | 21 |
| Client arrivalGapP95Ms | 110 | 705 |
| Client arrivalGapMaxMs | 306 | 1102 |
| Client reconnects | 82 | 85 |
| Client unexpectedDisconnects | 0 | 0 |
| Client lateUpdates | 0 | 0 |
| Client wrongCompanions | 0 | 0 |
| Client missingCompanions | 0 | 0 |
| Client moveRejections | 4 | 4 |

Payload fell **4.88×** and recipient message rate **14.85×**. Node CPU includes diagnostics; app/native RSS and CPU exclude PostgreSQL and the load generator. The before five-minute copy lacked component-stringify instrumentation; its separate short profile includes it. Idle one-second heartbeats make aggregate arrival gaps longer by design. Wire latency is not presentation delay. The near client remains at 120 ms; far motion trails at about one second. Serialization byte volume increases because recipient-specific batches replace shared actor strings, despite much lower delivered payload. Heap/GC numbers and string volume do not measure exact V8 allocation bytes.

### 150-user packet breakdown

Each frequency is recipient messages/s; sizes are JSON payload bytes, and fan-out is recipients per encoded payload. Component rows are separate below.

| Type | Before msg/s | Before mean/p95 bytes | Before MB/s | Before fan-out | After msg/s | After mean/p95 bytes | After MB/s | After fan-out |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| playerMoved | 40651.34 | 694/766 | 28.214096 | 27.35 | 0 | — | 0 | — |
| movementSnapshot | 0 | — | 0 | — | 1474.47 | 3575/7326 | 5.271067 | 1.00 |
| moveAccepted | 69.30 | 1068/1135 | 0.074035 | 1.00 | 69.26 | 1065/1108 | 0.073747 | 1.00 |
| adventureRoom | 372.16 | 564/1933 | 0.209713 | 24.99 | 372.22 | 554/1933 | 0.206158 | 24.99 |
| adventureState | 372.20 | 304/304 | 0.113148 | 1.00 | 372.26 | 304/304 | 0.113166 | 1.00 |
| playerEmoted | 128.39 | 79/80 | 0.010176 | 27.14 | 125.66 | 79/80 | 0.009957 | 27.55 |
| mochiSpoke | 34.00 | 159/161 | 0.005412 | 25.11 | 28.31 | 159/161 | 0.004510 | 24.88 |
| playerJoined | 130.44 | 885/999 | 0.115482 | 27.28 | 129.04 | 884/997 | 0.114113 | 27.40 |
| playerLeft | 99.14 | 63/64 | 0.006271 | 26.26 | 97.71 | 63/64 | 0.006180 | 26.38 |
| roomSnapshot | 3.78 | 26433/39818 | 0.099790 | 1.00 | 3.71 | 26458/39939 | 0.098196 | 1.00 |
| pong | 154.98 | 78/78 | 0.012089 | 1.00 | 155.07 | 78/78 | 0.012095 | 1.00 |
| interaction | 0.92 | 52/56 | 0.000048 | 1.00 | 0.99 | 52/56 | 0.000051 | 1.00 |
| combatEffect | 0 | — | 0 | — | 0 | — | 0 | — |
| battleDecision | 0 | — | 0 | — | 0 | — | 0 | — |
| error | 0.01 | 61/61 | 0.000001 | 1.00 | 0.00 | 61/61 | 0.000000 | 1.00 |
| moveRejected | 0.01 | 1060/1104 | 0.000014 | 1.00 | 0.01 | 1074/1112 | 0.000015 | 1.00 |
| ready | 0.27 | 58/59 | 0.000016 | 1.00 | 0.27 | 58/59 | 0.000016 | 1.00 |

NPC state: zero socket bytes; routes are authored locally. Combat zeroes in this safe workload are unexercised, not a reliability claim; the separate combat probe above measures effects. Public phrases share `playerEmoted` and were verified between browsers; autonomous `mochiSpoke` rates are measured in the soak. Discrete seating retains the legacy `playerMoved` event.

### Embedded component profile

Before uses the separate 150-user short profile; after uses the five-minute run. These are JSON fragments per carrying packet, including batched actors, not individual entity sizes and not additional messages.

| Component | Before carrying msg/s | Before mean/p95 bytes | Before MB/s | Fan-out | After carrying msg/s | After mean/p95 bytes | After MB/s | Fan-out |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| playerState | 37910.21 | 224/287 | 8.489166 | 26.36 | 1607.23 | 1559/3730 | 2.505054 | 1.08 |
| companionState | 37910.21 | 148/164 | 5.610076 | 26.36 | 1607.02 | 1425/3031 | 2.289969 | 1.08 |
| companionDescription | 37910.21 | 281/287 | 10.638688 | 26.36 | 132.75 | 487/287 | 0.064693 | 15.76 |
| mobState | 350.76 | 382/1476 | 0.133875 | 24.99 | 372.22 | 346/1475 | 0.128769 | 24.99 |
| resourceNodes | 350.76 | 133/514 | 0.046574 | 24.99 | 372.22 | 124/514 | 0.046004 | 24.99 |

### Delivery accounting and remaining limits

| 150-user counter | Before | After |
|---|---:|---:|
| backpressureDrops | 0 | 0 |
| closedSocketSkips | 701 | 96 |
| coalescedMovementSnapshots | 0 | 22 |
| criticalEventsQueued | 0 | 0 |
| criticalEventsFlushed | 0 | 0 |
| criticalEventsAwaitingResync | 0 | 0 |
| slowClientDisconnects | 0 | 0 |

Before request errors: `{'That path is blocked': 1, 'Walk closer to interact': 3, 'That destination is unreachable': 3}`. After request errors: `{'That path is blocked': 1, 'That destination is unreachable': 3, 'Walk closer to interact': 1}`. Aggregate acceptance before: **False**; after: **False**. Planned reconnects can produce closed-socket skips/coalescing; they are separate from slow-client drops. No congestion was intentionally induced in the real workload. The unit stress test accounts for all 257 events at queue overflow (256 queued plus the overflowing event) and counts 43 later closed-socket attempts; the FIFO recovery test delivers hit/result before the fresh movement keyframe. The previous harness pass flag omitted non-movement client errors: the 75-user raw flag was true despite two interaction-range rejections. The table applies strict client-error acceptance, and the final harness now enforces it alongside cache/queue teardown and slow-client counters. Final diagnostic/acceptance changes received a post-suite smoke; wire behavior did not change. Both species passed follow in every completed short/five-minute run, and all five-minute teardowns left zero players, rooms, sockets, pets, adventure instances/states, snapshot caches and queued bytes.

**150 CCU remains un-certified.** Checkpoint storage/retention, authoritative navigation rejections and any recorded tick deadline misses still need resolution. Repeat isolated long runs on candidate production hardware, with WAN/TLS and real-browser crowds; measure PostgreSQL separately and budget native work by registered pets, not only CCU. Distributed room/session/rate state remains unimplemented. Transient combat effects after an explicit slow-client disconnect do not have durable replay.

Validation: 185 JavaScript tests passed with PostgreSQL, zero skips; movement/queue tests and production asset validation/build passed; whitespace checks passed. No Cadence/reward/checkpoint mechanism or published pack was changed.

## Navigation and capacity certification follow-up

See [CCU_CERTIFICATION.md](CCU_CERTIFICATION.md) for predeclared final-main
10/40/75/150 stages, exact acceptance failures, WAN/TLS/crowd profiles, real disk
telemetry and encounter departure evidence. The prior 150-user failures above
remain historical failures. Checkpoint retention is now implemented; its presence
alone does not prove a live storage equilibrium or 150-user capacity. The new
harness uses the real development-default retention settings and stops below
3 GiB free. No existing production/legacy checkpoint files are deleted by the test.
A measured collider corner defect is repaired without loosening validation.
**150 CCU remains NOT CERTIFIED.**
