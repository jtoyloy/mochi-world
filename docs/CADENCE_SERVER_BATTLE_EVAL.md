# Cadence in server-physics combat — 2026-10-06

**No candidate qualified for promotion.** The 26-sense + causal-credit arm won 209/432
held-out encounters, versus random 199/432 and the published control 205/432. Its gain
is 2.31 percentage points, below the predeclared 5-point meaningful-margin threshold.
No published brain pack or trading brain changed. No new pack was created.

## Baseline and ownership

Wave 3 integrates the reviewed `7f8b079` diff onto canonical base
`697cd10de7d6a68a6b078ebec8578b1bea12270d`, after network scaling `02bb776`.
The original experiment ran on `9eebca5`; its measurements below are historical.
Integration validation is recorded in [INTEGRATION_VALIDATION.md](INTEGRATION_VALIDATION.md).
The existing immutable pack is `battle-0.74.0-v1`, Cadence 0.74.0,
`Brain.compose(16, 7, modules=(64,))`.

The only production refactor extracts existing poison, owner attack, enemy update and
species-ability lookup into shared functions/methods. Production `tick` and `petAction`
call those same stages; their formulas and conditions are preserved. The harness invokes
`AdventureService.ownerAttack`, `advanceEnemies`, `advancePoison`, `petAction`, `hit` and
`defeat`, and shared `traverse`/collision validation. It does not maintain independent
combat damage/cooldown/guard/movement equations. Trading logic is untouched.

Persistence, inventory and broadcasts are in-memory adapters in the behavioral harness.
Loot/XP/death still run through the real hit method. The performance assay separately
uses real PostgreSQL, `WorldService`, `BattleBrains.decide` and the production Python host
in a disposable test schema. Neither behavioral harness nor benchmark touches saved pets.

## Predeclared protocol

[Protocol](../sim/server_battle_protocol.json) was saved before evaluation. Eight arms:
random; published; no protection bonus; expanded observation only; causal credit only;
expanded + causal; terminal emphasis; disclosed mother/reference. All arms are reported;
validation was not used for tuning or selection.

There are **12 independent brain/world seed pairs per arm**. Each brain has 60 training,
12 frozen validation and 36 frozen held-out encounters. Thus each arm has 720/144/432
encounters in those phases. Seeds are respectively 1000–1011, 2000–2011 and 3000–3011.
Checkpoints are saved after training and reloaded independently before each frozen phase.
Assertions require unchanged weights, reward-update counts and memory-write counts.

Scenario factors are slime/boar/thornling, nominal owner-to-enemy offsets 40/140/260
(actual pet distance includes its offset and jitter), healthy/damaged owner and
pet, ready/cooling special, owner/pet pressure, open/obstacle geometry and Moonfox/Woodland
Deer. Factors are independently seeded rather than a claim to cover every Cartesian
combination. Held-out HP fractions are 0.85/0.23 versus 1/0.4 during training; enemy
HP/damage scales are 0.85/1.15 versus 1; position jitter widens from ±5 to ±20; obstacle
encounters approach another existing Yard collider. The production catalog has no
projectile enemy; Thornling is the longer-range (100) poison/spacing case, not a fabricated
ranged combat rule. Both actual species mappings, ranges, powers and forest special guard
are pinned by tests. A preliminary driver used abstract `forest` as a profile variant,
which production treats as Moonfox; its smoke/run output was discarded, not reported as
a species experiment. The final driver shares the production ability lookup.

Pressure is a controlled stress intervention through the production injectable random
source: owner pressure supplies 0.9 and pet pressure 0.1 for enemy target draws. Pet
pressure still requires a living pet inside enemy range. This tests feasible deterministic
target sequences, not their frequency under the live uniform 30% draw. Neither pressure
label nor random seed is a sensory input. Owner stands at its seeded position and uses the
real basic-sword auto-attack; owner healing, spellcasting and commanded movement are absent.
One enemy is present per encounter; crowd/party/PvP behavior is outside this measurement.

Each encounter has a 60-second cap. Movement advances every 100 ms at the production pet
speed and uses real path validation; combat stages use the production 400 ms clock and
1400 ms decision threshold (normally quantized to 1600 ms). All policies have the same
assigned response delays, 0/200/800 ms, independent of wall-clock compute load. The recorded reward metric uses the common original environment signal in every arm,
not a comparison of differently shaped learning rewards. Source
hashes in the raw record identify the actual physical/host/protocol code used.

## Observations and local learning

Control keeps the original 16 senses. A separate experimental architecture has 26 senses,
one 64-cell reciprocal processing region and unchanged library defaults. Its ten additions
are owner/self guard time remaining (/1800), enemy attack time remaining (/1600),
owner–enemy distance (/400), effective special range (/400), target line-of-sight,
remaining motor-path length (/65), owner attack cooldown (/2000), and relative target
bearing X/Y shifted to [0,1]. These resolve demonstrated guard, cooldown, species range,
owner geometry, direction and in-progress movement ambiguities. No action validity mask,
optimal answer, teacher, instance identity, pressure label or future draw enters the brain.

All actions remain ATTACK, DEFEND_OWNER, DEFEND_SELF, USE_SPECIAL, MOVE_CLOSER, MOVE_AWAY,
WAIT. Invalid actions retain their selected identity, execute the real body's range/path
checks and accrue waste; no script substitutes a better choice. The reference is a
separate disclosed script and is never called by a Cadence arm.

Reward arms retain the original bounded `battleReward`; no-protection removes its
protection contribution and clips again; terminal emphasis adds the original victory/
defeat/exhaustion terms a second time and clips. Causal arms remove protection from the
ordinary window reward and instead deliver real avoided damage /90 (bounded) through the
brain's built-in associative store at the executed guard action's original sensory cue.
Avoided damage compares the actual hit with the same physical damage function without the
guard multiplier. This avoids counting ordinary armor mitigation as guard efficacy.

Executed actions have IDs, sensory cues and timestamps. Guards retain their originating
ID; special guard belongs to its successful special. Protection receipts have unique
event IDs and can outlive another decision. The experimental host validates execution,
owner action class, receipt identity and replay protection. It closes ordinary pending
reward first, then writes older witnessed protection into the same brain memory. Overlapping
renewals are attributed to the latest active guard; unique marginal renewal benefit is
not established. It
**does not fabricate old basal-ganglia eligibility**, teach a desired action, replay a
policy, or read memory as an answer. That memory's read is still a drive into the joint
Cadence settlement. Causal-memory credit is an experimental mechanism and has its simpler
published/no-protection controls; it is not shipped.

Terminal settlement happens once before the next encounter. If a response never reaches
the body because of terminal/exhaustion/timeout, eligibility is cancelled and an unowned
outcome is counted rather than rewarded as an executed action. Stress events during an
await are separately counted as dropped, matching the production window clear on response.
Receipt tables and pending state round-trip with experimental checkpoints. Experimental
26-sense/domain checkpoints are rejected by the production host; real trading checkpoints,
even inside forged battle wrappers, are rejected by both battle hosts.

## Matched results

| Arm | Training wins / defeats / timeouts (720) | Validation wins (144) | Held-out wins / defeats / timeouts (432) |
| --- | --- | ---: | --- |
| Random | 404 / 228 / 88 | 82 | 199 / 151 / 82 |
| Published | 376 / 229 / 115 | 77 | 205 / 132 / 95 |
| No protection | 377 / 240 / 103 | 76 | 199 / 144 / 89 |
| 26 senses | 388 / 220 / 112 | 76 | 208 / 125 / 99 |
| Causal credit | 375 / 246 / 99 | 77 | 199 / 141 / 92 |
| 26 senses + causal | 388 / 224 / 108 | 77 | 209 / 127 / 96 |
| Terminal emphasis | 380 / 233 / 107 | 77 | 200 / 139 / 93 |
| Reference | 526 / 173 / 21 | 109 | 294 / 103 / 35 |

The combined arm's paired seed-bootstrap 95% interval is +0.23 to +4.40 points over random.
That is an **unadjusted per-arm** interval. A conservative six-arm Bonferroni bootstrap
interval is −0.46 to +4.86 points. Neither repeated episodes nor scenario subgroups are
treated as independent brain samples. Twelve seed pairs remain a limited panel and
bootstrap intervals do not establish universal coverage. No candidate has a ≥5-point
aggregate held-out gain. No tuning or promotion follows the favorable tiny interval.

[Learning curves](assays/server-battle-learning.png) show 12-encounter block win rates with
±1 between-seed standard error. [Summary](assays/server-battle-summary.json) contains all
required damage, survival/HP, efficacy, action, latency, path, timeout and scenario counts;
[raw episodes](assays/server-battle.json.gz) include training, validation, held-out outcomes
and native timings. The data is gzip JSON to preserve full raw counts without a large text
diff. Every native arm failed the promotion gate; the reference is not a promotable learner.

The apparent combat success also includes owner auto-attacks. Published Cadence dealt
only **406 pet damage versus 17,379.75 owner damage**, and selected ATTACK only 12 times;
its pet contributed 2.28% of total damage. The combined arm dealt 1,808.5 pet damage
(9.96%), versus random 2,824.5 (15.27%). Its 1,491 ATTACK selections included 1,292 invalid
attacks; 415/457 selected specials were invalid. It never selected MOVE_CLOSER in frozen
evaluation, although the body movement regression passes. More sensors and corrected
credit do not by themselves repair the learned choice of distant/cooling actions.

Geometry remains a large failure class. Random won 56/225 obstacle versus 143/207 open
encounters; combined won 53/225 versus 156/207. The reference won 126/225 versus 168/207.
Straight MOVE_CLOSER/MOVE_AWAY can be blocked; the seven-action body has no explicit lateral
steering. This assay does not silently add navigation or a fallback policy to cure it.
A supplementary, post-hoc declared WAIT control wins **183/432** with zero pet damage,
showing how much a standing pet/owner engine accomplishes without battle learning. This
control was never a tuning or promotion arm; its raw result is archived separately.

## Whole-species transfer

The main split changes physical parameters and includes both species; it does not withhold
an entire species. A supplemental panel therefore fixes training to Moonfox and tests only
Woodland Deer, then reverses that relation. The protocol is saved before those new seed
panels execute. **All eight original arms** are retained without tuning or selection.
Each direction has six independent trained-brain/world seed pairs, 60 training encounters
per brain and 36 frozen evaluation encounters (216 tests per arm/direction). Training
seeds are 5000–5005/5100–5105; evaluation seeds 6000–6005/6100–6105. Checkpoints are reloaded
and frozen durability assertions apply. The same held-out stats/HP/position/obstacle shifts
also apply. These supplemental panels do not replace the predeclared promotion gate.

| Arm | Moonfox → Woodland Deer wins /216 | Woodland Deer → Moonfox wins /216 |
| --- | ---: | ---: |
| Random | 103 | 102 |
| Published | 99 | 104 |
| No protection | 99 | 104 |
| 26 senses | 104 | 109 |
| Causal credit | 111 | 107 |
| 26 senses + causal | 99 | 108 |
| Terminal emphasis | 99 | 105 |
| Reference | 143 | 146 |

The combined arm's seed-bootstrap intervals versus random are −6.48 to +2.31 points
and −0.93 to +6.94 points. Both span zero. The main tiny aggregate gain does not establish
species transfer. Six pairs per direction leave wide uncertainty. Full damage, survival,
HP, action and efficacy counts are in [transfer summary](assays/server-battle-transfer-summary.json),
[raw transfer](assays/server-battle-transfer.json.gz) and the
[supplemental protocol](assays/server-battle-transfer-protocol.json).

## Latency and causal diagnostics

The production Adventure tick awaits the serialized native/DB response: enemies and
owner auto-attacks pause during that await. Companion motor movement can continue in
the separate 10 Hz multiplayer loop. The driver preserves the Adventure tick's captured
clock for its post-response enemy stage. It is not a model of concurrent enemy movement.

A separate [latency probe](assays/server-battle-latency.json.gz) uses 24 new world seeds,
random/reference controls and matched 0/200/800/1600 ms delay. The continuing-enemy mode
is an explicitly counterfactual stress case, not a claim about current server scheduling.
For random in production timing, there were **zero stale attacks/specials at every delay**
and zero enemy displacement during decision. At 800 ms random wins 11/24 versus 12/24
at zero delay. At 1600 ms previous pet paths move during the await but still produced zero
stale attacks in this panel. Continuing enemies at 800 ms produced one stale special;
at 1600 ms, two stale attacks and one stale special. Stress-window clear dropped 20/115
outcome windows respectively; they are counted, never fed back to unexecuted choices.
Shorter latency is the tested safe mitigation. Revalidation already prevents invalid hits;
no high-level action mask or scripted alternative was installed.

[Action-ID/timestamp traces](assays/server-battle-traces.json.gz) preserve a declared
guard fixture and seeded stale-action stress episodes, including original decision cues.
Direct execution tests additionally construct valid movement, a later WAIT receiving
physical protection from an earlier guard, and an attack becoming invalid after response.
Held-out published/combined protection caused by an older guard was 72/55 damage units;
total true guard-avoided damage was 5,636/5,726. The effect is real but is not the dominant
competence gap in this panel. RNG target pressure and ambiguous first-hit context remain
unresolved; adding dozens of signals was not justified by these counts.

## Performance: actual production persistence path

The behavioral native subprocess tick median/p95/p99 was **1.17/2.81/5.21 ms**; this excludes
per-decision DB load/save. The real `BattleBrains` benchmark births 100 distinct owned pets,
then runs three synchronized bursts per size against isolated local PostgreSQL. All 100
pets belong to one test owner; the global brain queue serializes them regardless of owner. It uses the
actual production domain, load/tick/save, ownership locks and one serialized child process.
Fixed normalized observations and artificial bounded rewards provide a repeatable update
workload; no combat competence is inferred from this performance fixture.

| Outstanding battles | End-to-end p50 / p95 / p99, ms | Maximum full burst, ms | Native CPU seconds, three bursts | Native RSS, MiB |
| ---: | --- | ---: | ---: | ---: |
| 10 | 181 / 334 / 362 | 362 | 0.68 | 39.3 |
| 25 | 430 / 851 / 919 | 919 | 1.84 | 42.0 |
| 50 | 853 / 1635 / 1734 | 1760 | 3.31 | 37.8 |
| 100 | 1496 / 2807 / 3037 | 3099 | 6.16 | 40.9 |

For 555 continuing turns, native round-trip p50/p95/p99 is boot **9.30/14.17/23.48 ms**,
tick/update **2.84/5.47/40.19 ms**, save **9.90/13.77/20.85 ms**. Node CPU was 2.07 seconds
and child CPU 11.99 seconds across those bursts. One brain is resident in the child at a
time, so dividing its RSS by N is not RAM per simultaneously resident brain. Checkpoints
average about **212.7 KB per active pet**: persistent payloads at 10/25/50/100 are
2.13/5.32/10.63/21.27 MB. Child RSS is about 40–44 MB plus Node RSS 96–143 MB in this fixture;
these include runtime/allocator/pool overhead, not just neural arrays.

At 10/25, measured bursts completed inside the 1400 ms decision budget; at 50/100 they did
not. This is a local persistence/queue bottleneck estimate, **not a multiplayer capacity
claim**. It omits sockets, movement for N players, Adventure global serialization, remote
DB/network latency and competing gameplay. Queue waits dominate the high-concurrency tail.
[Performance raw samples](assays/server-battle-performance.json) preserve all timings, CPU,
RSS, checkpoint sizes and burst durations. The database benchmark ran after the behavior
run ended; timings from the behavior run itself included test contention.

## Reproduction and limits

```sh
node sim/server_battle_run.mjs --output runs/server-battle.json
python -m sim.server_battle_summary runs/server-battle.json docs/assays/server-battle-summary.json --plot docs/assays/server-battle-learning.png
node sim/server_battle_latency.mjs
node sim/server_battle_trace.mjs
node sim/server_battle_owner_only.mjs
node sim/server_battle_transfer.mjs
python -m sim.server_battle_transfer_summary runs/server-battle-transfer.json docs/assays/server-battle-transfer-summary.json
node --env-file=.env sim/server_battle_benchmark.mjs --output runs/server-battle-performance.json
python -m pytest -q tests
npm test
```

Use the repository Python environment (Cadence 0.74.0, numpy; matplotlib for plotting),
Node dependencies and a disposable `TEST_DATABASE_URL`. Benchmark refuses to run without
that test URL and drops its isolated schema on completion. `runs/` is local-only.

Checks: **33 Python and 171 JavaScript tests pass, no skips**, including real DB isolation,
correct action mapping/movement, physical observation encoding, deterministic worlds,
causal receipt ownership/replay, full checkpoint continuation, single terminal closure,
unexecuted-action cancellation and frozen evaluation. Pack hash tests remain intact.

Remaining limitations: no promoted fighter; only 60 training encounters per seed, without
an exploration/trace sweep; one enemy and static basic-sword owner; forced pressure draws;
no external crowd/owner-input or host outage replay; incomplete obstacle navigation; and no
proof that the remaining sensors distinguish every strategically different situation.
The default brain remains the measured control. Training longer or expanding memory/regions
is a future measured arm, not a reason to claim this candidate succeeded.

## Follow-up: useful executable actions

The [action-learning study](CADENCE_ACTION_LEARNING.md) extends this server-physics driver
with per-decision observation/execution validity, signed range thresholds, cooldown and path
reasons, guard state, previous invalid choices, movement time and pet contribution. It adds
three physical affordance senses and compares original waste against a bounded stronger
penalty. Its `approach-target-v2` uses existing pathfinding only for Cadence-selected
MOVE_CLOSER; no failed attack is replaced. The old pack and `short-hop-v1` remain controls.

All base validation precedes curriculum selection and fresh held-out evaluation. New seeds
7000/8000/9000 avoid retuning on the previous panel. Seven primary frozen arms produce wins
/432: random 211, published 203, affordance 208, penalty 211, persistent 215, curriculum 219,
reference 286. Curriculum's +1.85-point paired gain has 95% bounds −1.39 to +5.09 and pet
damage share 4.18% versus random 14.96%; **nothing qualifies or is promoted**. The executable
rate alone is misleading: always-available guards can inflate it while attacks disappear.

Six-pair whole-species transfer tests the selected affordance arm and its curriculum in both
directions. Affordance/random wins /216: Moonfox→Woodland Deer 108/107; reverse 108/104.
Neither establishes robust gain. Fresh WAIT-only diagnostic wins 191/432 with zero pet damage.
Full continuation, freeze, body/domain rejection and pack immutability remain checked.
The expanded suite passes 42 Python and 227 JavaScript tests, with a real disposable database
and no skips. [Compressed complete receipts](assays/action-learning.json.gz) and
[summary](assays/action-learning-summary.json) preserve all failed arms and factor classes.
