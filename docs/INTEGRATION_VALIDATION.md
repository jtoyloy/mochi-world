# Battle, animation and multiplayer integration — 2026-10-06

Base: `697cd10de7d6a68a6b078ebec8578b1bea12270d`.

Integrated network scaling (`02bb7761cf8fba65154aea21b45d2e05130c7ff5`), selectively
ported checkpoint retention (`ac84141de596abd17d5cb86f20bda364c1082275`, original
parent `7e7066256352557684a062119ad99a83c1f01fae`), and selectively ported the
server physics evaluation (`7f8b079c18f2eec81a3c48b4d473f5816280cfaf`, original
parent `9eebca539d1d501228784bc35342df1b9415cd92`).
No published battle/trading pack or production reward function changed. The
no-protection-bonus experiment remains confined to the harness and is not promoted.

## Reconciliation

`server/adventure/service.mjs` was reviewed against all three original diffs.
It retains point-object walkability at pet MOVE_CLOSER/MOVE_AWAY and mob chase/return;
presentation events after accepted gameplay actions; and persistence before idle
state eviction, with pending combat settlement retained. Server damage, rewards,
action selection and navigation remain authoritative. No ours/theirs replacement
was used. The only textual merge conflict was `package.json`: retain both action
registration and the multiplayer benchmark script.

The guard regression now supplies an effect sink and asserts its authoritative
defense event without weakening the guard lifetime check. A new regression executes
both mob chase and return through the actual tick. The soak child uses the parent's
already loaded environment without inheriting optional env-file CLI flags. An
initial short run failed on a missing optional `.env` stderr warning; that failure
and the corrected result are both preserved in compact integration evidence.

The renderer diagnostic now counts only unique action textures (29.99 MiB RGBA),
rather than including unrelated room textures in its action-memory counter.

README and the multiplayer guide identify PixiJS painterly isometric rendering
as current, with Three.js/React Three Fiber tooling documented as historical.

## Evidence and exclusions

### Wave 3 integration — 2026-10-06

Checkpoint retention now owns a catalog namespace and schema marker, writes through
fsync-safe rename, protects current/lease/recent/pinned/age-window/foreign and
unverifiable files, and runs outside gameplay ticks. Production requires all four
retention settings explicitly; development defaults are keepRecent 3, age 0, 60s
interval and 600s grace. A real PostgreSQL lifecycle run retained two 6.49 MB
checkpoints after seven writes and deleted 32,439,480 bytes; the bounded-storage
benchmark remains a model, not a disk guarantee. Battle checkpoint storage is isolated.

The final 10- and 40-user authenticated PostgreSQL soaks both passed. Outbound rate
was 77,255 and 747,582 bytes/s, recipient rate 145 and 676 messages/s, tick p95
upper bounds were 4 and 8 ms, event-loop p95 maxima were 11.45 and 14.29 ms,
snapshot latency p95 was 3 and 8 ms, with zero rejections, unexpected disconnects,
missing companions or GC errors. These are short validations, not 150-user
certification. The retained historical 150-user comparison remains 28.860→5.909
MB/s and 42,016.9→2,829 messages/s (4.88× and 14.85× reductions); its strict
acceptance failed on recorded client/navigation/interaction errors and deadlines.

The battle harness remains experimental and isolated. Held-out scores were random
199/432, published 205/432, no-protection 199/432, 26-sense 208/432, causal 199/432,
combined 209/432, terminal 200/432 and reference 294/432. The combined +2.31 points
misses the five-point promotion gate. It selected 1,491 ATTACK actions, 1,292 invalid,
zero MOVE_CLOSER in frozen evaluation, and did not establish obstacle performance or
species transfer. Historical serialized BattleBrains p95 was about 334/851/1,635/2,807
ms at 10/25/50/100 concurrent, above the 1,400 ms decision interval at 50 and 100.
No candidate brain or published pack changed.

[Compact original multiplayer evidence](assays/multiplayer-summary.json) retains
seven representative completed runs, their original outcomes, client error counts,
species follow acceptance, cleanup, source-data hashes, the checkpoint disk
incident, preliminary harness failures and browser limits. All 19 original
`assays/multiplayer-*.json` files (7,647,082 bytes, roughly 314,000 added lines)
were excluded as raw files, including the 150-user five/thirty-minute traces,
short/preliminary windows and transient failure dumps. Their filenames identify
evidence in the sibling commit; summaries do not relabel failures. Future raw
JSON/JSONL outputs and `data/` remain ignored. Net tracked-content growth is
approximately 12.44 MiB across 61 files, mainly the five animation PNGs; compact
original multiplayer evidence is 41,005 bytes. This measures checked-in file bytes,
not compressed Git object storage (the sibling objects already exist locally).

[Fresh integration evidence](assays/integration-validation.json) records this
integration's checks. Local database, checkpoint directories, raw soak output and
build caches are not committed. Published packs have no diff from the base;
Python tests verify the battle manifest and reject actual trading lives, including
forged battle envelopes. Existing isolation tests keep trading checkpoints intact.

## Validation

- `npm ci`, `npm run assets:validate`: passed.
- `npm run test:animation`: 17 passed, zero skipped.
- `npm run test:movement`: 29 passed, zero skipped.
- `npm test`: 177 passed, zero skipped, PostgreSQL enabled. A fresh dedicated local
  test database had the legacy schema/catalog initialized for the trading test;
  the world/social/adventure suites create and drop their own schemas.
- `npm run test:brain`: 27 passed.
- `npm run build`: passed.
- `python -m sim.battle_assay`: reproduced Cadence wins 0/0/3, random 8/7/9,
  mother 100/100/100 (600 decisions per seed).
- `python -m sim.battle_acquisition`: reproduced 578/578/570 Cadence hits,
  random 89/84/74 and mother 600 each.
- `python -m sim.battle_experiment --output docs/assays/battle-learning.json`:
  exact original JSON reproduced across all eight seeds/six arms. Frozen wins:
  published 20/480, random 121/480, experimental no-protection-bonus 180/480,
  mother 480/480. Candidate paired bootstrap interval remains −5.21 to +29.79
  percentage points; it does not qualify as reproducibly better than random.
- Short real two-user/15-second load recheck: both species follow acceptance
  passed, maximum movement tick 3.11 ms, no server/harness errors, zero retained
  players, sockets, rooms, companions or idle adventure states. Owned schema and
  checkpoints removed after the server exited. This does not certify capacity.
- Actual renderer offline fixture: 10-second Town and Forest combat samples at
  DPR2 measured 60.05/60.08 FPS, frame p95 17.6 ms and one GL draw each. Viewer
  spot checks displayed human gathering and both pet/early-mob attack art.
  Automated checks cover action interruption, fallback, registration and return
  to distance-driven locomotion. These are short fixture checks, not sustained
  live browser/network acceptance or production art approval.

## Final Wave 3 validation

- JavaScript: 219 passed, 0 failed, 0 skipped with PostgreSQL enabled.
- Python: 33 passed, 0 failed, 0 skipped.
- Asset validation: passed.
- Build: passed.
- Movement tests: passed, including network protocol/queue coverage.
- Checkpoint tests: 21 passed, 0 failed, 0 skipped, including wall-clock
  stabilization and deleted-byte accounting.
- Multiplayer protocol tests: passed; the fresh 10- and 40-user short soaks
  both passed with zero rejections, unexpected disconnects or missing companions.
- Battle tests: 21 passed, 0 failed, 0 skipped for the deterministic smoke and
  shared production helper regressions. The documented multi-arm evaluation remains
  historical; no hours-long reproduction was run during this cleanup.
- `git diff --check`: passed.

## Launch blockers and limits

150 CCU remains **not launch-certified**: historical tick overruns, invalid
intents, checkpoint disk errors and conflated send-skip counts remain failures.
Bounded checkpoint retention is implemented. Current, lease, recent, pinned,
age-window and unverifiable checkpoints remain protected. The BEFORE condition was
median 6.23 MiB per life and approximately 10.9 GiB/hour for 150 awake pets under
append-only writes; the modeled keepRecent=3 example remains approximately 281.25 GB
after 24 hours reduced to approximately 2.92 GB retained. Production retention values
are not finalized, legacy unmanaged checkpoint cleanup remains conservative/manual,
and production-hardware GC throughput still needs measurement.

Repeat isolated 30-minute and multi-hour runs with final tooling on candidate
hardware, verify encounter TTL and active-combat departure settlement, and test
sustained browser/WAN performance. Painterly action art remains provisional with
mirrored/reused directions and poses; viewer spot checks expose cropped source
edges on some Deer/fishing frames. Dedicated directional art, contact refinement
and sustained GPU-memory measurement remain open. No improved Cadence combat
competence is claimed beyond the controlled counts in the battle investigation.

## Battle worker scaling follow-up

The historical single-host figures above remain the control. Bounded persistent workers,
version/checkpoint cache validation and per-brain transaction ownership now replace the
global BattleBrains queue. The initial matrix reached 713 ms p95 at 100 distinct brains with eight workers;
the final repeat reached 1,359 ms with 10/300 deadline misses. Final 150-brain p95 was
1,017 ms with zero misses; the earlier matrix had four. Both remain recorded.
No brain pack, learning rule, observation, reward or decision interval changed. Shared-room
Adventure operations remain serialized. See [BATTLE_BRAIN_SCALING.md](BATTLE_BRAIN_SCALING.md)
for the full matrix, crash boundary, receipt limits and capacity exclusions.
## Authoritative navigation and capacity follow-up

Started exactly from main `925cdbec4399b249bbf1872a26edfaad217d2547`.
[CCU_CERTIFICATION.md](CCU_CERTIFICATION.md) records the predeclared protocol and
fresh sequential real-account/PostgreSQL stages. The repaired segment validator
uses continuous collision geometry with unchanged footprints/authority/ranges.
The initial failing navigation diagnostic and all failed acceptance arms remain
reported. Active-combat disconnect retention and pending-native-response departure
races were independently reproduced using real PostgreSQL and BattleBrains.
No brain mechanism, checkpoint domain, trading policy or published pack changed.
**150 CCU is NOT CERTIFIED.** Full validation and exact stage/profile results are
recorded in the certification report and its compact assay.

## Final Wave 4 release gate — 2026-10-06

Final tree: `0705d70bd6064e6ad05550b7aeae83da91404428`; base:
`925cdbec4399b249bbf1872a26edfaad217d2547`. The release gate passed 262 JavaScript
tests and 49 Python tests, with zero failures and zero skips. Lifecycle coverage passed
28 native PostgreSQL/BattleBrain cases. Asset validation, 19 animation tests, 42 movement
tests, build and `git diff --check` passed.

The final lifecycle code rejects stale motors across disconnect, room change, reconnect,
pet switch, target death/removal/change, TTL, shutdown and response loss. It preserves
prior owed feedback, rejects duplicate/old receipts, recovers persisted proposals and
evicts abandoned combat. A persisted disconnected state without an in-memory encounter
is covered by the recovery regression.

On final code with eight workers, three direct repeats produced zero >1400 ms misses:
50 brains had p50/p95/p99/max ranges 161–352/327–603/347–741/347–741 ms; 100 had
324–351/515–643/535–658/535–658 ms; 150 had 536–733/960–1178/992–1217/1011–1246 ms.
The separate one-repeat 150 smoke had three misses and remains reported as host-jitter
evidence. Direct queue, step, save and DB timings are retained in
`runs/wave4-final-gate.json` locally.

The concentrated Adventure fixture used five actors per room. Motor completion maxima
were 1.61–2.04 s at 50, 3.27–3.56 s at 100 and 4.86–5.34 s at 150, with 9–18,
56–63 and 108–109 motor deadline misses. Tick maxima were 1.64–2.06 s, 3.30–3.59 s
and 4.89–5.37 s respectively. This is a remaining shared-room/acknowledgement blocker;
it is not a capacity certification.

The physical checkpoint fixture still passed byte-exact latest recovery and repeated
fourth-write → GC delete → three-file plateau cycles. Warm lives measure about 9.16 MB;
the documented 150-pet peak and 3 GiB floor require about 8.12 GiB free. The 150-user,
30-minute CCU run remains **NOT CERTIFIED** and was not rerun unsafely.

Cadence remains **NO PROMOTION**: random 211/432, published 203/432, curriculum 219/432,
reference 286/432; curriculum interval −1.39 to +5.09 pp and pet damage 4.18% versus
random 14.96%. Context diagnostics still fail to acquire the required strategic split.
Sword, fishing and Deer cleanup art are integrated and validated; remaining directional,
staff/bow/dagger, chopping, Moonfox, mob and cosmetic alignment work remains provisional.
Remaining launch blockers are Adventure-level tail latency and full CCU resource headroom.
