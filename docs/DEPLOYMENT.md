# Deployment

Local development runs Node 22+, PostgreSQL 16+, Python 3.12/NumPy/bundled Cadence and local
PixiJS painterly isometric world with DOM/React overlays; Redis, external LLM and Solana funds are not required. Build with npm run build and use npm run db:migrate before
npm start. The server serves web files plus /socket and uses a bounded persistent native BattleBrain worker pool. Scheduled trading retains its existing host.

Initial production topology: HTTPS reverse proxy → Node web/game/socket server → PostgreSQL;
Cadence worker → versioned checkpoint storage; optional dialogue provider and configured Solana
RPC. Persistent volumes are required for current file checkpoints. Redis/pubsub and a worker
queue are the next scaling step; in-memory rooms do not support independent replicas today.
Use sticky routing only as an interim measure, not shared-state consistency.

Bind HOST=0.0.0.0 only in the intended hosting environment, terminate TLS, forward WebSocket
upgrades, keep DATABASE_URL/API keys server-only, back up DB and checkpoint files, and run
migrations as a release step. DEV_MODE=false requires a real identity provider (not implemented),
MOCK_TOKEN_MODE=false requires verified token/RPC config; production is not launch-ready.

Treasury execution stays offline/admin-authorized; enable neither arbitrary signing nor hot
wallets. No deployment was performed. Railway deployment must be reported successful only
after the specific deployment reaches SUCCESS; the Railway skill was used for this guidance.

## Current world presentation

The main world uses PixiJS and painterly isometric atlases, with DOM/React overlays.
Three.js and React Three Fiber are historical prototype tooling. See
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for the current atlas pipeline and
[3D_DELIVERY.md](3D_DELIVERY.md) for the historical prototype scope. Domain services
and Cadence contracts remain preserved. Build with `npm run build` before serving/deploying.

## Checkpoint retention release configuration

Run the updated world migration before deploying. Production startup now requires
explicit `CHECKPOINT_KEEP_RECENT`, `CHECKPOINT_RETENTION_HOURS`,
`CHECKPOINT_GC_INTERVAL_MS`, and `CHECKPOINT_GC_GRACE_MS`. Use a persistent
`CHECKPOINT_DIRECTORY`, back up it and PostgreSQL consistently, and retire old
writers before enabling collection. New managed namespaces bind to the database
endpoint/schema; restored or cloned databases need a separate directory/volume.
Do not share production storage with a test clone. Review
[CHECKPOINT_RETENTION.md](CHECKPOINT_RETENTION.md) for the algorithm, operational
commands, disk formula, legacy-file safety and alerts. The development three-file
policy is an example, not an approved production recovery objective. This change
does not certify 150 CCU or resolve the other deployment/identity-provider limits.

## Battle worker configuration

Run `npm run db:migrate` to add the last-request receipt columns before starting the
new coordinator. Set `BATTLE_WORKERS` for available CPU/RAM; the default is 2. On the
measured local eight-logical-CPU machine, 8 outperformed 4 at 100 distinct brains,
but this is not a universal sizing rule. `BATTLE_QUEUE_LIMIT=256`,
`BATTLE_RESIDENT_LIMIT=64`, `BATTLE_IDLE_SECONDS=300` bound admitted work and cached lives.
One worker is the control; do not run one process per pet. Allow graceful shutdown
to drain admitted decisions before terminating PostgreSQL access. Worker readiness
is required before the listener opens. Observe runtime diagnostics and repeat the
PostgreSQL matrix on candidate production hardware. Shared-room combat and the
Adventure operation queue still limit full runtime throughput. See
[BATTLE_BRAIN_SCALING.md](BATTLE_BRAIN_SCALING.md); no deployment was performed.
