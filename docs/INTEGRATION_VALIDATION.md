# Battle, animation and multiplayer integration — 2026-10-06

Base: `ad7d95980d7cb8d91bf0bde76f0ee4a1c1d0acad`.

Integrated the full Cadence investigation (`9eebca539d1d501228784bc35342df1b9415cd92`)
and action animation (`1033daa74ad0365f036ed468223b740f29b4606b`) diffs.
Selected reusable code, tests, instrumentation, tooling and documentation from
`7e7066256352557684a062119ad99a83c1f01fae`; that commit is not a history ancestor.
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

## Launch blockers and limits

150 CCU remains **not launch-certified**: historical tick overruns, invalid
intents, checkpoint disk errors and conflated send-skip counts remain failures.
Checkpoint append-only retention/storage sizing is unresolved: median 6.23 MiB
per life and approximately 10.9 GiB/hour for 150 awake pets. No production
checkpoint was deleted and no retention policy was introduced.

Repeat isolated 30-minute and multi-hour runs with final tooling on candidate
hardware, verify encounter TTL and active-combat departure settlement, and test
sustained browser/WAN performance. Painterly action art remains provisional with
mirrored/reused directions and poses; viewer spot checks expose cropped source
edges on some Deer/fishing frames. Dedicated directional art, contact refinement
and sustained GPU-memory measurement remain open. No improved Cadence combat
competence is claimed beyond the controlled counts in the battle investigation.
