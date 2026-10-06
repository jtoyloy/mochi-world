# Mochi companion

The active companion is the single `users.profile.activeMochi` reference. Ownership is checked
inside an account-locked transaction; selecting a foreign pet fails. Only the active Mochi
spawns beside a penguin in public rooms. Home snapshots include the owner's inactive pets
and saved furniture without checkpoints, wallet data or private state.

CompanionFollowSystem is the shared `companionStep` rule in game/model.js. States are
FOLLOWING, WANDERING, INTERACTING, RESTING and RETURNING. Owner distance, movement and
bounded timers control them. Above 150 units it returns; collision safeguards keep it on valid
floor and recover beside the owner above 210 units. These are explicit gameplay rules, not
claims of learned Cadence social behavior.

Feed/pet/play/sleep use the existing server care endpoint, actual inventory consumption,
needs and cooldowns. Clothing layers reuse the pet's equipped items. Nearby co-presence
increments only the actual pair's familiarity, once per minute. After three encounters they
exchange bounded template greetings. No infinite AI conversation runs. Existing trust,
affection and rivalry are preserved; deeper learned interaction is deferred pending assays.

Each pet retains its own actual Cadence Life, preferences, body world and paper portfolio.
This pass does not add new neural inputs/motors or simulate learned social skills.

## Current3D presentation

The main world now uses React Three Fiber/Three.js. The previous Phaser section is
historical. See [3D_DELIVERY.md](3D_DELIVERY.md) for implemented scope and limits and
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for models/rigs. Domain services and Cadence
contracts remain preserved. Build with `npm run build` before serving/deploying.
