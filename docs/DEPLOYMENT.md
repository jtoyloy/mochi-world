# Deployment

Local development runs Node 22+, PostgreSQL 16+, Python 3.12/NumPy/bundled Cadence and local
React Three Fiber/Three.js; Redis, external LLM and Solana funds are not required. Build with npm run build and use npm run db:migrate before
npm start. The server serves web files plus /socket and reuses a single serial native brain host.

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

## Current3D presentation

The main world now uses React Three Fiber/Three.js. The previous Phaser section is
historical. See [3D_DELIVERY.md](3D_DELIVERY.md) for implemented scope and limits and
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for models/rigs. Domain services and Cadence
contracts remain preserved. Build with `npm run build` before serving/deploying.
