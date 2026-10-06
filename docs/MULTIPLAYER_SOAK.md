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

## Checkpoint retention follow-up

The storage incident above remains the original measured result. New trading
checkpoints now use a cataloged database-bound namespace, durable fsync-before-commit
writes and background fail-closed retention. Production requires an explicit policy.
Current, leased, pinned, recent and age/grace-protected snapshots survive; legacy
files remain untouched. See [CHECKPOINT_RETENTION.md](CHECKPOINT_RETENTION.md) and
`assays/checkpoint-storage.json`. The representative 150-pet timestamp simulation
converges to 2.72 GiB retained / 3.63 GiB pre-GC peak under the development policy,
versus ~10.88 GiB/hour append-only growth. This resolves normal configured append-only
growth, not historical legacy storage or write bandwidth. A short live smoke checks
runtime integration; the failed original 150-CCU run has not been reclassified or
replaced by a sustained production-capacity test.
