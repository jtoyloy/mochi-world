# Mochi Battle Ai

## Adventure milestone — 2026-10-05

Each Mochi has an independent battle-v1 Cadence checkpoint, version and counters in mochi_battle_brains. The native Python host uses Brain.compose(16, 7, modules=(64,)) with the simplest library defaults. Observations contain normalized current physical state, never a teacher answer or mob instance identity. Seven motor actions are ATTACK, DEFEND_OWNER, DEFEND_SELF, USE_SPECIAL, MOVE_CLOSER, MOVE_AWAY and WAIT. Actual executed action windows accumulate damage, protection, suffering, waste and terminal outcomes; bounded reward credits the preceding decision. A refused settle holds still. Native host failure holds safely. Finish closes an owed outcome without manufacturing another action. Checkpoints preserve full brain, working trace, memory, RNG and pending state. No teacher is called by gameplay. The new immutable battle-0.74.0-v1 pack records source/wheel hashes; trading packs are untouched.

Measured limitation: these brains are plastic, not demonstrated competent fighters. A same-observation 600-step acquisition control reinforces three different actions: Cadence 578/578/570 hits versus random 89/84/74 and mother 600 each. In the 600-step combat assay across seeds 42/7/18, current Cadence wins 0/0/3 versus random 8/7/9 and mother 100 each. Defeats are 7/23/21 versus random 15/16/14 and mother zero. This failed arm remains recorded; it is not promoted as better-than-random combat. The original reward arm won 0/0/1. Guided noisy-context candidates also failed: fresh 18/80 correct became 16/80 after 1600 demonstrations; a wider candidate reached 37/80. None of those trained candidates ships. See assays/*.json and sim/battle_assay.py, sim/battle_acquisition.py. Public profiles expose action counts and damage/protection, not hidden reasoning or checkpoints.

## Battle investigation — 2026-10-06

Reproduction of the original 600-decision assay gives exactly the previously recorded
wins and acquisition counts. The acquisition task rewards one action under an unchanged
observation. Combat requires different answers as distance and cooldown change. Plasticity
in the first task does not establish contextual discrimination in the second.

The new `sim/battle_experiment.py` executes the **published pack's Python sources** for its
control. Eight seeds (0–7), 120 episodes per seed and arm, a 60-decision episode cap and
initial distances 40/140/240 in balanced order compare random, published Cadence, weak trace
(0.3 versus default 3), weak trace plus reward ×3 clipped to [-1,1], no protection bonus (default trace), and the disclosed mother.
All Cadence arms close the actual last action with `finish` before resetting the arena,
including at truncation. This deliberately differs from the historical continuous assay,
which resets the body without terminal `done` and leaves its final action uncredited.
The stronger-reward arm is called `weak_trace_terminal` in the raw data; **terminal closure
is shared by all arms**, and its distinguishing intervention is reward amplification.
These are experimental configurations, never gameplay policies or promoted packs.

Raw counts and 20-episode learning blocks are in [battle-learning.json](assays/battle-learning.json).
The [learning curve](assays/battle-learning.png) shows block win rates, not cumulative rates;
shading is one between-seed standard error, not a confidence interval. Each brain continues
learning throughout training. Afterwards the complete trained checkpoint is reloaded and
evaluated for 60 episodes greedily, with learning off and the original reward used for all
evaluation metrics. Assertions require unchanged weights and reward update counts. There
is no teacher in any Cadence arm. Evaluation uses the same three initial distances; it does
not measure transfer to unseen worlds or production combat competence.

### Observation audit

| Index | Observation | Scale / limitation |
| --- | --- | --- |
| 0 | Owner HP | / max HP |
| 1 | Pet HP | / 80 |
| 2 | Enemy HP | / max HP; hides absolute health |
| 3 | Pet–enemy distance | / 400, clipped; 65-unit move changes it by 0.1625 |
| 4 | Nearby enemies | / 6, clipped |
| 5–6 | Owner/pet hurt in preceding window | Binary |
| 7 | Enemy damage | / 25, clipped |
| 8 | Enemy definition ordinal | / 6; arbitrary ordering, not an instance ID |
| 9 | Nearby allies | / 4, clipped |
| 10 | Special cooldown remaining | / 8000 ms |
| 11–12 | Owner damage / damage dealt in window | / 40, clipped |
| 13–15 | Pet exhausted / enemy alive / constant | Binary |

Tests verify health and distance deltas survive normalization below saturation. They also
construct identical vectors with different owner positions, enemy attack phases, active
guard expiry and pet species (different special ranges). These omitted variables change
physical action consequences. This is proven observation aliasing; it is **not** a proof of
contradictory globally optimal actions. Neither geometry/path obstruction nor owner attack
cooldown, target bearing/velocity, pet motor progress or current guard appears in the vector.
The legacy arena has four changing inputs: owner HP, enemy HP, distance and special cooldown; the rest are fixed. More sensors alone have not been tested here.

### Timing, reward and attribution audit

Seven unmasked actions remain Cadence's motor choices. ATTACK needs range ≤100; special
needs species range and an expired cooldown; movement can fail geometry/owner tether checks.
DEFEND_SELF and WAIT do nothing useful in the legacy arena because only the owner is attacked.
The arena reports successful specials and wasted attack/special attempts, as well as every
selected action. Its zero pet damage and 100% pet survival are structural limitations, not
learned abilities. Episode caps count timeouts separately from defeats.

The server chooses about every 1400 ms, guards persist 1800 ms and special cooldown is
8000 ms. The legacy arena uses six decision steps for special cooldown, roughly
8.4 seconds at that cadence; it does not integrate continuous server time. Movement installs a path rather than teleporting. Observations are collected
before an awaited native decision/transaction, then actions validate current geometry at
execution. An enemy can therefore move during host latency; rejected range checks become
waste. No measured latency distribution or stale-move frequency has been established here.

The outcome window is cleared after the next decision and before its action executes.
Thus tick N's reward is owned by decision N−1; `finish` closes once without taking another
action. Automated tests pin update count, full saved pending continuation, immutable source
hashes and rejection of a **real trading life**, including one inside a forged battle
wrapper. Existing tests additionally show battle learning cannot mutate a separate live
trading checkpoint. Trading code and packs are unchanged.

However, guards can outlive the 1400 ms decision interval: a hit in the following 400 ms
may be credited to a later action. Existing eligibility traces may distribute that credit,
but this investigation does not prove correct causal defensive attribution on the server.
Owner auto-attacks and other world events also contribute to the shared outcome channel;
reward belongs to an executed window, not necessarily solely to the pet's causal contribution.

Reward is dense, not excessively sparse in the original arena: ordinary owner damage gives
−0.0667, guarding 3 and taking 1 gives **+0.0167**, an 8-damage attack taking 4 gives +0.1111,
and waste adds −0.08. Guarding indefinitely earns positive intermediate reward yet eventually
loses. This explains a concrete conflicting incentive; seed 42 originally selected guard
563/600 times and won zero. Terminal defeat penalizes the last action; the historical assay
also bootstraps value from a reset healthy opponent rather than a terminal observation.
The new experiment isolates that protocol defect without changing the published host.
Strong trace, context generalization, policy collapse, eligibility and reward scale remain
competing explanations rather than a uniquely isolated neural cause. Counts by 20-episode
block show exploration collapsing onto particular actions; they measure executed action
diversity, not policy entropy. Training quantity is 120 complete episodes per seed and arm;
longer-life learning and exploration-temperature interventions have not been established.
No wall-clock rate test yet determines whether production combat changes too fast between
settlements. The static controlled arena removes host latency and concurrent enemy motion
from that question.

Reproduce with the repository Python environment:

```sh
python -m sim.battle_assay
python -m sim.battle_acquisition
python -m sim.battle_experiment --output docs/assays/battle-learning.json
python -m sim.battle_plot docs/assays/battle-learning.json docs/assays/battle-learning.png
python -m sim.battle_summary docs/assays/battle-learning.json docs/assays/battle-summary.json
python -m pytest -q tests
npm test
```

Plotting requires matplotlib; the experiment requires only the existing numpy/Cadence runtime.

### Execution defect isolated and repaired

A direct test against `AdventureService.petAction` proved a valid 65-unit MOVE_CLOSER
on clear Yard ground installed no path and set `wasted=true`. The service's local
`walkable(room, point)` wrapper was called with `(room, x, y)`. Its point coordinates
became undefined, so every selected pet move failed. The same mismatch prevented mob
return/chase movement at two sites. Those three calls now pass the actual point object.
This is a body execution fix, not a new neural mechanism or a scripted action chooser.
It does not change any brain pack. The regression failed before the fix and passes after it.
The legacy arena never had this bug, so its failed scores remain unexplained by this fix.

Additional direct execution tests prove a guard survives the next decision boundary
and that an attack sensed at distance 80 becomes wasted if the enemy is at distance 200
when execution validates it. These establish possible delayed/stale consequences, not
measured production frequencies. Production behavioral improvement after restoring movement
still requires a server-physics training/replay experiment.

### Matched results and decision
Eight seeds; each arm has 960 training episodes and 480 frozen evaluation episodes.
| Arm | Training wins / defeats / timeouts | Frozen wins / defeats / timeouts |
| --- | --- | --- |
| Uniform random | 249 / 711 / 0 | 121 / 359 / 0 |
| Published control | 176 / 263 / 521 | 20 / 160 / 300 |
| Trace 0.3 | 109 / 106 / 745 | 20 / 40 / 420 |
| Trace 0.3 + reward ×3 | 155 / 115 / 690 | 20 / 100 / 360 |
| No protection bonus | 317 / 551 / 92 | 180 / 240 / 60 |
| Mother reference | 960 / 0 / 0 | 480 / 0 / 0 |

The no-protection-bonus arm improves aggregate training win rate from the published
control’s 18.33% to 33.02% (random 25.94%), and frozen evaluation from 4.17% to 37.50%
(random 25.21%). Its frozen wins by seed are **20/20/40/0/20/0/40/40**, versus random
**17/21/14/12/11/14/17/15**. Five of eight seed pairs improve. Its paired win-rate
difference is +12.29 percentage points; the 10,000-resample seed-bootstrap 95% interval
is **−5.21 to +29.79 points**. Training’s interval also spans zero. Repeated deterministic
episodes are correlated, so uncertainty is computed over seeds, never by treating all
episodes as independent. Eight seeds and three starting distances remain a limited panel.

**No reproducible-success claim and no promotion.** Removing the protection bonus is a
promising failed-to-qualify arm; weak trace and reward amplification are failed arms.
The simpler published settings remain the control. No new pack was created, no published
pack changed and no trading brain changed. The only gameplay change repairs movement
execution. The Cadence mechanism is unchanged; experimental trace/reward changes stay in
the harness. All arms had zero refused settlements. All pet survival counts are perfect
because this arena never attacks the pet.

[Summary counts](assays/battle-summary.json) include damage dealt/taken, owner damage,
special use, protection, waste, action distributions, reward and per-seed uncertainty in
both phases. Training rewards differ across reward arms; frozen rewards share the original
signal. Defense-heavy arms can score higher reward while winning less. Curves end at
120 episodes; more training has not been shown to solve collapse. Further validation needs
a server-physics arena with pet damage, attack phase, geometry, live movement and latency;
a larger predeclared seed panel; and transfer to varied enemies/owner behavior. No claim
that this result resolves delayed guard attribution or missing-context optimal decisions
is justified.

Validation: **27 Python tests and 162 JavaScript tests pass, with no skips**. The full JS
suite used the existing local database test environment. Published pack hashes are pinned
and checkpoint continuation covers both the control and experimental trace setting.
