# Adventure room lanes — 2026-10-06

The repeated-room flush previously waited for every pending motor before submitting
work for later rooms. With five adjacent actors per room, native requests from the
next room waited behind the earlier room despite independent world state.

Adventure now snapshots actors into room lanes. Each lane retains authoritative
owner attack → pet decision/motor → next owner ordering. Distinct rooms progress
concurrently. Durable execution acknowledgement still follows the motor and owns
the exact request/version. Receipt settlement and saves for distinct users drain
before the tick returns. Enemies advance only after every successful lane and
receipt completes. The existing global Adventure operation/shutdown barrier stays.
A failing lane drains other lanes and started receipts before releasing that
barrier. Actors leaving or moving to another room while queued are skipped.

No observation, reward, learning, Cadence mechanism, decision interval, navigation
rule or published pack changed. Within-room combat still serializes, and a room
with many actors remains a capacity constraint.

## Scoped measurement

[Compact source-hashed evidence](assays/adventure-room-lanes.json) retains direct
native phase distributions, Adventure tick/motor distributions, receipt-inclusive
native sample counts, unavailable presentations, deadline misses, host and memory
measurements for both arms. Each arm uses eight workers, five actors per room, one
synchronized burst and two independent repeats. The lane arm ran first and the
serialized control second, each in its own process/schema. This is a small sequential
comparison with possible host jitter, not a sustained or alternating capacity trial.

| Actors | Serial tick max ms, repeats 1/2 | Lanes tick max ms, repeats 1/2 | Serial motor max ms, repeats 1/2 | Lanes motor max ms, repeats 1/2 |
| ---: | --- | --- | --- | --- |
| 10 | 340 / 323 | 250 / 223 | 319 / 295 | 227 / 192 |
| 25 | 774 / 762 | 406 / 394 | 752 / 741 | 386 / 336 |

All four Adventure bursts in each arm had zero motor completions over 1,400 ms
and zero unavailable presentations. Motor timing ends when the authoritative pet
motor completes; tick timing also covers its durable acknowledgement and state save.
The fixture exercises real owner/pet/enemy stages with high-health mobs and paused
enemy attacks, using in-memory multiplayer transport. It measures no socket, TLS,
WAN, browser, mixed gameplay or learned combat competence acceptance.

50/100/150 actors were excluded because this machine had about 4 GiB free and the
existing 3 GiB floor leaves insufficient conservative checkpoint/write headroom.
The historical 50/100/150 Adventure failures remain failures; these smaller counts
do not overturn them or certify 150 CCU. Production hardware, crowded rooms and
sustained mixed-load certification remain required.

## Verification

The native PostgreSQL Adventure suite passed 79 tests with zero failures/skips
before the final additional queued-room-change regression. All four deterministic
room regressions pass, covering concurrent submission, local owner/pet order,
independent progress, stale bodies, queued room changes and receipt/operation queue
draining on lane failure. Existing native lifecycle cases still cover disconnect,
reconnect, pet switch, target changes/removal/death, TTL, shutdown and response loss.

Reproduce the lane arm against a disposable database with sufficient disk headroom:

```sh
TEST_DATABASE_URL=postgresql://... PYTHON=.venv/bin/python \
 node sim/server_battle_benchmark.mjs --workers 8 --sizes 10,25 \
 --rounds 1 --repeats 2 --adventure true --roomGroupSize 5 \
 --output runs/adventure-room-lanes-small.json
```
