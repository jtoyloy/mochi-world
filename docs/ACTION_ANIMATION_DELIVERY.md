# Gameplay action animation — 2026-10-06

The canonical full-body locomotion remains the controller. `AnimationPlayback.play`
overrides its presentation with a timed action while locomotion continues consuming
actual distance. The retained phase/frame/facing resume afterwards; no root translation,
leg drawing, physics, navigation, damage callback or combat cooldown comes from animation.
Events arriving during an action replace it immediately. Defeat holds for mobs and
exhausted companions; player defeat recovers after 800ms and never delays server teleport.

## States and authority

- Both human appearances: sword anticipation/swing/follow-through/recovery; staff
  readiness/cast; bow draw/release/recover; quick dagger strike; cast independent of
  effect particles; hurt, braced defend, defeat, bottle/item use, interact; fishing
  cast/wait/catch; repeated axe wind-up/chop/recover and completion recovery.
- Moonfox: light 420ms crouch/pounce/land attack; special uses the attack poses;
  hurt, braced defense, owner/self defense aliases, exhausted/defeat fallback.
- Woodland Deer: heavier 850ms antler thrust/stomp attack; special uses attack
  poses; braced antler defense, owner/self defense aliases, hurt and resting defeat.
- Meadow Slime and Bramble Boar: idle, distance-driven move (registered `walk`),
  attack, hurt, defeat. Dummy, Thornling, Rippleback, Scavenger and Guardian use
  the same playback/state architecture with their compatible static painted fallback.

`animation/events.js` consumes existing `hit`, `spell`, `pet-hit`, `pet-special`,
`mob-hit`, `victory`, `fishing`, `woodcutting` packets and the named events
`player_attack`, `spell_cast`, `mochi_attack`, `mochi_special`, `damage_taken`,
`defend`, `mob_attack`, `mob_defeated`, `fish_start`, `fish_catch`, `woodcut_start`,
`woodcut_complete`, `item_use`, `interact`, `gather_cancel`.

Server changes only add presentation evidence to its existing `combatEffect`
channel at accepted outcomes: weapon type, incoming-hit recipient/defense/defeat,
accepted item use, gathering start/cancel, and the Cadence-chosen defense action.
Formulas, action selection, rewards and WebSocket transport are unchanged. Mob
poison does not invent a new mob attack. Hit particles appear at the actual recipient.
Accepted world interaction replies drive a short local interaction pose. A refused
harvest completion or actual movement clears the gathering presentation; time alone
never grants a catch/resource. Snapshot mob death retains its visual for 1100ms,
without making the defeated mob attackable or changing respawn/reward authority.

## Art and fallbacks

Five original built-in imagegen PNGs (320 source slots) are versioned siblings in
`web/assets/isoworld/`: `actions-sage-v1`, `actions-coral-v1`, `reactions-sage-v1`,
`reactions-coral-v1`, `mob-actions-v1`. No old PNG or published brain pack was edited.
Ten JSON registrations retain original source rectangles/sourceSize/trim/pivot and
state-to-eight-frame maps. The sheets are shared, not requested per entity/frame.

These are provisional painted **SE views**, explicitly mirrored for SW/NW and
reused for NE. They are not complete directional production art. The fishing
row's empty/overlapping columns 4/5 are excluded from playback and valid poses
repeated. Wait holds a rod pose. Cast/staff and weapon sheets include some baked
glow/trails; effect particle execution is nevertheless independent of playback.
`interact` temporarily uses braced hand poses; special uses species attack;
Moonfox exhausted uses a held low hurt pose; Deer hurt reuses its rest sequence.
These aliases are disclosed rather than advertised as independently authored art.

Unregistered states resolve explicit aliases, then compatible idle. Missing,
malformed, or unavailable action sheets retain locomotion. Unpainted mobs remain
foot-anchored static art; movement no longer adds unrelated sinusoidal ground bob.
Existing appearance caches are unchanged; action art keeps compatible cosmetic
attachment layers when no precomposed action appearance exists. Painted action
cosmetics/hand sockets remain an artist task.

## Validation and performance

`assets:register` includes action registration; `assets:validate` rejects missing
required states, wrong direction/frame counts, invalid source rectangles, empty
used frames, source dimensions and mismatched pivots. Tests cover later-event
interruption, phase retention, fish wait/outcome/cancel, persistent defeat,
recipient mapping, malformed metadata, unknown-art fallback and every registered
frame's projected ground contact. Logical head/name/bubble anchors and depth use
world positions, independent of frame bounds.

Animation Viewer includes all actions, both human identities/species and the two
painted mobs, all eight logical directions, speed controls and anchor guides.

10-second actual-renderer offline fixtures at **1280×900/DPR1**:

| Scene | Mean FPS | Frame p95 | CPU update p95 | GL draws |
|---|---:|---:|---:|---:|
| Town, 20 actors | 59.94 | 17.3ms | 1.2ms | 1 |
| Forest combat, player + pet + slime + boar | 60.08 | 17.4ms | 0.6ms | 1 |

Evidence: `assays/action-animation-performance.json`; reproducible fixture:
`web/dev/animation-benchmark.html` through Vite rooted at `web`. This is not live
multiplayer/server capacity, mobile or crowded-combat acceptance. Five added
shared PNGs total about 11.6MiB compressed / 30MiB decoded RGBA. No total-VRAM
measurement. Repeats during builds/checks dropped to ~20FPS (Town p95 66.3ms,
combat 51ms). A quiet cold repeat measured Town 43.16FPS/p95 50ms and combat
60.15FPS/p95 17.6ms. A final quiet repeat after a 2-second warm-up measured
Town **60.05FPS/p95 17.4ms/CPU p95 0.7ms**, combat **60.08FPS/p95 17.4ms/CPU
p95 0.3ms**, both one GL draw. All samples are retained; no sustained 60FPS
claim for cold/loaded/mobile/crowded scenes. Keep future action exports packed and budget optional loading.

## Production art still needed

Distinct eight directional views for every action; replace repeated fishing poses
with registered in-cell rod frames; separate cast from baked glow/trails; dedicated
interact and species-special sequences, Moonfox lying exhaustion and Deer recoil;
weapon/shield/outfit variants and synchronized action cosmetics; full state sheets
for Dummy, Thornling, Rippleback, Scavenger and Guardian. Refine single-view contact
and body scale/identity consistency. Ground-anchor validation establishes the
registration contract, not perfect physical foot planting of generated poses.

Final verification: **17 animation tests passed; 96 JavaScript tests passed,
66 database-dependent checks skipped because no test database was configured;
asset validation and Vite build passed.** No Cadence/Python source changed.
