# Wave 4 worker tail follow-up — 2026-10-06

**No concurrent battle certification.** Two independent eight-worker repeats of
50/100/150 direct BattleBrains bursts completed with zero responses over the
unchanged queue-inclusive 1,400 ms deadline. This characterizes short local bursts;
it does not overturn the previous 100-brain 10/300 misses or variable 150 results.
No Cadence mechanism or published brain changed.

The added benchmark reports phase p50/p95/p99/**max**, CPU seconds, worker peak RSS,
Node RSS, repeat identity, source hashes, host load/memory, Adventure tick/motor
latency, PostgreSQL pool busy/waiting maxima, event-loop maximum and unavailable
responses. Independent repeats recreate the worker pool and truncate transactional
battle rows, reclaiming toast data instead of retaining deleted rows between repeats.
Owned schemas are dropped on completion/error. The local 3 GiB disk floor remains.

## Preserved intermediate failed arm

The first fixture ran the lifecycle specialist's intermediate implementation with
**pre-motor, serial acknowledgement checkpoint transactions**. Subsequent lifecycle
work moves acknowledgement after the motor and batches independent receipts; this
arm must not be represented as the final implementation. Its complete compact
phase evidence is in [the retained assay](assays/wave4-tail-pre-ack-batching.json).

| Brains | Repeat | Direct p50/p95/p99/max ms | Direct misses | Adventure max tick ms | Adventure late completed native requests | Adventure unavailable presentations |
| ---: | ---: | --- | --- | ---: | ---: | ---: |
| 50 | 1 | 150/257/282/291 | 0/150 | 1740 | 0 | 0 |
| 50 | 2 | 337/625/689/706 | 0/150 | 2654 | 0 | 0 |
| 100 | 1 | 328/632/673/680 | 0/300 | 3773 | 0 | 0 |
| 100 | 2 | 291/480/517/567 | 0/300 | 3432 | 0 | 0 |
| 150 | 1 | 462/886/1027/1091 | 0/450 | 5485 | 7 | 7 |
| 150 | 2 | 374/701/789/808 | 0/450 | 7220 | 17 | 133 |

Adventure samples include both native decisions and acknowledgement operations.
Expired requests are absent from successful phase samples; unavailable presentations
and worker rejection counters remain separately visible. They are not zero-latency
successes. Birth/startup are separate; all continuing direct decisions save durably.
Native RSS peaked about 504 MiB; Node reached about 185 MiB in direct bursts.

Queue dominates the direct tail: 150-brain queue maxima were 1,028/791 ms against
1,091/808 ms end-to-end maxima. Direct DB body query maxima were 40/46 ms, save
71/34 ms, step68/75 ms. Service includes transaction pool admission, user advisory
locks and commit; `db` sums body query waits and cannot independently identify
PostgreSQL lock duration. IPC transport includes encoding, pipe transit and host
scheduling. Measurements do not justify claiming DB locks caused the queue tail.

Actual Adventure was materially slower than direct calls: ordered application awaited
a durable acknowledgement per actor. That finding was assigned to the lifecycle
specialist for correctness-preserving post-motor receipt batching. A direct benchmark
alone would have concealed the failure. Independent room fixture uses real owner
attacks, pet actions, enemy stages, operation serialization and Adventure DB saves;
only multiplayer transport is in memory. Targets have high HP to keep the measurement
active; enemy attacks are paused to avoid deaths ending the burst. It is not mixed
CCU, socket/WAN/TLS or combat competence evidence.

## Reproduction and limits

```sh
TEST_DATABASE_URL=postgresql://... PYTHON=.venv/bin/python \
 node sim/server_battle_benchmark.mjs --workers 8 --sizes 50,100,150 \
 --rounds 3 --repeats 2 --adventure true --output runs/wave4-tail.json
# Concentrated-room diagnostic, five actors per room:
TEST_DATABASE_URL=postgresql://... PYTHON=.venv/bin/python \
 node sim/server_battle_benchmark.mjs --workers 8 --sizes 50 \
 --rounds 3 --repeats 2 --adventure true --roomGroupSize 5 \
 --output runs/wave4-tail-shared.json
```

The benchmark now additionally measures tick-submission-to-motor completion, which
includes the Adventure operation queue, all earlier ordered bodies and durable
receipt overhead. Keep that distinct from native-response latency. Eight workers
are a host-specific experiment, not a universal deployment default. Reserve room
for PostgreSQL, movement/trading and other jobs; provision against repeated **actual
Adventure** motor/tick tail on production hardware. Shared-room ordering remains a
serialization limit. Final repeats are required after lifecycle changes stabilize.
