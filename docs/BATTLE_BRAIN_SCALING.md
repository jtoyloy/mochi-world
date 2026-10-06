# BattleBrain workers — 2026-10-06

The worker pool reduces the measured 100-brain queue bottleneck. The final eight-worker
repeat reached 1,359 ms end-to-end p95 with **10 misses in 300** continuing decisions on
this local 8-logical-CPU, 16 GiB macOS machine. The initial matrix reached 713 ms with
zero misses; both runs remain recorded. Four workers reached 1,395 ms p95 with 11 misses. This is a persistence benchmark, not a 100-battle or multiplayer launch certificate.
No Cadence mechanism, published pack, reward, observation or combat motor changed.

## Profile before architecture changes

The original global promise queue puts every pet through one native process, with a
boot/tick/save every decision. A fresh initial reproduction reached 2,624 ms p95 at
100 outstanding requests, including 2,601 ms queue p95. A second completed run retained
3,123 ms p95; short-run variability matters. The original output-file failure was an
absent ignored runs directory; its measurements were not treated as a saved assay.

A separate baseline with independent owners measured native round-trip boot p50/p95/p99
9.52/20.21/56.94 ms, tick 2.93/11.92/43.03 ms, save 10.06/22.13/68.80 ms.
Its end-to-end p95 was 308/793/3,614/3,165 ms at 10/25/50/100. Validation tasks were finishing during part of this baseline; the contended 50-brain
spike is retained, not trimmed. Use the historical control as well, rather than infer
an exact speedup ratio from the contended repeat.
The historical main measurements were 334/851/1,635/2,807 ms. Queue time dominates
the large burst tail; loading and checkpoint serialization cost more than typical settlement.
The baseline did not separate Python compute from transport or instrument DB queries;
the new benchmark does. None of these timings establish combat competence.

## Architecture and ownership

Node coordinates N persistent `mochi.battle_worker` children. Each child wraps the
unchanged BattleHost and holds an LRU of complete BattleHost instances. Assignment
prefers the least queued worker and then the fewest assigned identities; affinity
persists within a bounded table. A hot brain remains serial. Different brains can
run concurrently. FIFO promises preserve local A1/A2/A3 order independent of B1/B2/B3.

The existing user advisory transaction lock, owned Mochi row lock and battle row
`FOR UPDATE` remain the mutation authority across coordinators. Locks cover load,
settlement, save and commit. Resident copies are speculative caches, not independent
authorities: reuse requires matching pack, database version **and checkpoint SHA-256**.
A rollback followed by another writer at the same version therefore cannot reuse
wrong state. A process generation token rejects responses from reassigned workers.
Optional `expectedVersion` rejects stale callers before computation.

Adventure submits decisions across independent rooms together, then applies motor
responses in player order before advancing enemies. A repeated room flushes the
batch first, preserving shared-room combat ordering. The global Adventure operation
queue remains; crowded shared-room combat, state IO and motor application can still
serialize. No claim that this benchmark measures that full path. A regression checks
actual tick batching and action/enemy ordering.

## Persistence and failures

Every successful decision and terminal finish serializes the complete brain and commits
its checkpoint, metrics and version to `mochi_battle_brains` before returning. Battle
checkpoints remain transactional PostgreSQL bytea; trading file namespaces, fsync,
retention and lease protection are untouched. No save coalescing or dirty eviction
exists. **Maximum committed learning/state loss under a worker process crash: zero**,
assuming PostgreSQL's durable commits. In-flight uncommitted computation may be discarded.

A last durable request receipt supports replay of the currently owed settlement using
`requestId`, without another learning step or version increment. Adventure retains an
ID on the outcome window and uses distinct tick/finish IDs. Callers replaying an older
receipt after a newer commit must supply `expectedVersion`; this is not an unlimited
idempotency ledger. A coordinator restart recovers neural state from DB. Atomic recovery
of the entire world motor/outcome across a coordinator death is **not** implemented:
brain and Adventure state have separate commits, as before. Receipt coverage does not
claim exactly-once gameplay execution across that crash boundary.

Native exit/error/timeout rejects pending IPC. Failed worker state is discarded and
lazily restarted/readiness checked on subsequent work. Idle death is visible in health;
there is no automatic retry of a possibly committed operation. Tests kill real workers
at load, before/after tick and before/after save; check idle death, response loss,
post-commit loss, receipt replay, coordinator restart, cross-coordinator races, stale
generations, 100 brains, a hot brain, bounded residency and graceful draining.

## Bounds, shutdown and observability

Defaults: `BATTLE_WORKERS=2`, `BATTLE_QUEUE_LIMIT=256` (running plus queued requests),
`BATTLE_RESIDENT_LIMIT=64` per worker, `BATTLE_IDLE_SECONDS=300`. Limits are positive
integers. Idle entries expire lazily on subsequent requests; a silent worker has at
most its configured resident limit. There is no process per pet and no per-pet timer.
Eight workers were the best measured setting on this machine; deployment must set
`BATTLE_WORKERS=8` explicitly for that experiment, not assume eight suits every host.

Workers report ready before server listening. Saturation rejects immediately. Ordinary
Adventure decisions have a 1,400 ms start deadline checked before worker work and again
after DB locking. Expired work returns through the existing unavailable/no-action path;
its owed outcome is retained. Finish remains eligible to close an owed settlement.
An already executing decision is not cancelled solely because its deadline passes.
The benchmark disables start rejection to count **all** late completions, including queue
wait, rather than hide them. No interval increase or scripted fallback was introduced.

Shutdown stops the Adventure timer, drains its operation queue and worker requests,
then closes child stdin before PostgreSQL shutdown. All resident decisions already have
durable checkpoints; no shutdown-only dirty state exists. Queue size, health, generation,
PID, resident count, cold loads, saves, restart/error/reject counts, CPU and peak native RSS
are exposed in worker diagnostics and the existing runtime metrics IPC. Recent successful
phase samples are capped at 10,000. Failures/rejections are separately counted.

## Measured matrix

Three synchronized continuing bursts per row; births and worker startup are separate.
Native RSS is summed process peak RSS, not current resident-only memory.

| Workers | Brains | E2E p50/p95/p99 ms | Queue p95 ms | Step p95 ms | Save p95 ms | DB query p95 ms | Misses / decisions | Throughput/s | Node + worker CPU core average | Native / Node MiB |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| 1 | 10 | 261/617/652 | 584 | 47.2 | 45.3 | 27.4 | 0 / 30 | 18.5 | 0.51 | 86/91 |
| 1 | 25 | 336/866/972 | 848 | 45.2 | 17.3 | 10.3 | 0 / 75 | 34.8 | 0.78 | 86/121 |
| 1 | 50 | 542/1025/1063 | 1005 | 3.9 | 13.5 | 8.1 | 0 / 150 | 47.2 | 0.77 | 86/125 |
| 1 | 100 | 1147/2248/2458 | 2194 | 7.1 | 12.6 | 7.7 | 110 / 300 | 46.3 | 0.76 | 113/120 |
| 1 | 150 | 1587/3103/3381 | 3085 | 4.2 | 11.6 | 9.9 | 249 / 450 | 45.9 | 0.71 | 145/122 |
| 2 | 10 | 157/359/359 | 296 | 9.0 | 25.5 | 40.9 | 0 / 30 | 37.3 | 0.81 | 148/131 |
| 2 | 25 | 276/482/569 | 460 | 49.3 | 19.9 | 21.8 | 0 / 75 | 51.8 | 1.16 | 148/134 |
| 2 | 50 | 400/704/752 | 670 | 6.1 | 18.7 | 16.8 | 0 / 150 | 68.3 | 1.19 | 148/126 |
| 2 | 100 | 757/1543/1731 | 1518 | 7.1 | 16.4 | 16.0 | 25 / 300 | 68.4 | 1.24 | 152/107 |
| 2 | 150 | 1035/2121/2414 | 2075 | 6.9 | 15.3 | 15.0 | 155 / 450 | 67.1 | 1.23 | 176/121 |
| 4 | 10 | 92/202/221 | 102 | 11.3 | 74.6 | 25.9 | 0 / 30 | 49.9 | 1.25 | 230/126 |
| 4 | 25 | 219/1349/1503 | 1228 | 427.2 | 72.6 | 32.0 | 1 / 75 | 33.8 | 1.00 | 230/116 |
| 4 | 50 | 333/691/794 | 606 | 10.4 | 26.5 | 23.5 | 0 / 150 | 72.4 | 1.63 | 230/113 |
| 4 | 100 | 591/1395/1505 | 1249 | 20.8 | 23.5 | 29.2 | 11 / 300 | 81.8 | 1.89 | 230/117 |
| 4 | 150 | 853/1668/1823 | 1600 | 7.0 | 22.3 | 33.0 | 79 / 450 | 87.0 | 1.92 | 245/127 |
| 8 | 10 | 105/308/354 | 135 | 79.7 | 74.9 | 51.4 | 0 / 30 | 49.8 | 1.33 | 396/128 |
| 8 | 25 | 205/499/562 | 426 | 64.9 | 39.4 | 130.4 | 0 / 75 | 69.8 | 1.99 | 396/122 |
| 8 | 50 | 238/456/478 | 409 | 10.0 | 35.0 | 40.4 | 0 / 150 | 114.6 | 2.48 | 396/133 |
| 8 | 100 | 399/713/772 | 661 | 11.1 | 24.8 | 42.0 | 0 / 300 | 133.6 | 2.97 | 396/140 |
| 8 | 150 | 455/1270/1386 | 1192 | 7.7 | 20.7 | 37.6 | 4 / 450 | 134.5 | 2.86 | 396/138 |

All rows had zero worker restarts/errors/rejections. CPU figures exclude PostgreSQL and
other processes on the local machine. Eight workers at 100 brains used
about 396 MiB summed native peak RSS plus 140 MiB Node RSS (see exact assay values).
Cold loads during the matrix's continuing bursts were zero; all decisions still saved.
The matrix used a 192-resident-per-worker cap so even the one-worker control retained
150 brains. The deployment default is 64; one/two-worker larger runs may evict and reload.

DB timing sums the measured transaction body query waits per decision; service timing
also includes pool admission, user locks and BEGIN/COMMIT. IPC includes Node serialization,
pipe round-trip and Python execution. `transport` subtracts Python handle time from IPC,
so it includes scheduling/output encoding, not just pipe transit. Python load/step/save
and host durations have p50/p95/p99 in the [compact assay](assays/battle-brain-scaling.json).

Save serialization, IPC/JSON copies and database commits remain substantial even with
residency. Eight workers were faster than four here; they still missed four of 450
150-brain deadlines, despite 1,270 ms p95. No 150-battle support is claimed. Shared-room
Adventure serialization, remote database latency, competing trading/movement and longer
runs remain outside this burst evidence. Provision based on a production hardware repeat.

Reproduce against a disposable PostgreSQL database:

```sh
TEST_DATABASE_URL=postgresql://... node sim/server_battle_benchmark.mjs \
  --workers 1,2,4,8 --sizes 10,25,50,100,150 --rounds 3 \
  --output runs/battle-scaling.json
TEST_DATABASE_URL=postgresql://... npm test
npm run test:brain
.venv/bin/python -m pytest -q tests
npm run build
```

The benchmark creates/drops its own schema, independent owners and pets. It never
uses the production database or token actions. Raw windows remain ignored under runs/.

## Final eight-worker repeat

After receipt and lifecycle changes, the same real fixture produced:

| Brains | E2E p50/p95/p99 ms | Misses / decisions | Node + worker CPU core average | Native peak / Node RSS MiB |
| ---: | --- | --- | ---: | --- |
| 10 | 59/120/137 | 0 / 30 | 2.46 | 394/117 |
| 25 | 137/264/285 | 0 / 75 | 2.55 | 394/125 |
| 50 | 227/399/431 | 0 / 150 | 2.65 | 398/142 |
| 100 | 649/1359/1476 | 10 / 300 | 2.12 | 421/125 |
| 150 | 576/1017/1086 | 0 / 450 | 3.07 | 421/121 |

The final 100-brain result has queue p95 1,243 ms, step p95 and checkpoint serialization
shown in the assay. Ten responses still exceeded 1,400 ms. At 150, the final repeat
had zero misses, but the earlier matrix had four. Three bursts are insufficient to
establish a reliable deadline guarantee; p95 alone hides tail failures. All final
rows had zero worker errors/restarts/rejections and zero continuing cold loads.

Validation: PostgreSQL `npm test` passed 234 tests, zero skips; `npm run test:brain`
and `.venv/bin/python -m pytest -q tests` each passed 35 tests. `npm run build` and
`git diff --check` passed. Published packs have no diff. Final lifecycle and externally signalled child-exit checks also pass; no production deployment or multi-hour test ran.
