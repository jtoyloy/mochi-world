# Mochi World

Customizable human villagers, persistent AI Mochi beasts, and an original painterly isometric social world.
PixiJS renders room maps; the existing browser UI powers inventory, profiles, shops, arcade,
paper trading and research. Cadence remains the actual pet/paper-trading brain. Language is a
read-only character layer. Game items stay in PostgreSQL. Real purchases use a configured
$MOCHI SPL mint; local development uses **TEST $MOCHI**, never real token balances.

## Local setup

Requirements: Node 22.12+ or24+, Python 3.12 and PostgreSQL 16+ (`initdb`, `pg_ctl`, `psql` on PATH).
From this repository:

```sh
npm ci
npm run build
python3.12 -m venv .venv
.venv/bin/python -m pip install numpy pytest web/brains/traders-0.74.0-v1/cadence_net-0.74.0-py3-none-any.whl
npm run db:local
cp .env.example .env
```

For an existing checkout, keep the existing `.env` instead of copying over it. Set DATABASE_URL
and TEST_DATABASE_URL to the local URLs printed by `db:local` (replace YOUR_OS_USER).
Then run:

```sh
npm run db:migrate
npm run db:import
npm start
```

Open [Mochi World](http://127.0.0.1:8777/home). `db:import` preserves the real legacy Momo Life
and possessions and does not overwrite an imported checkpoint. Data/checkpoints/PostgreSQL
files are ignored. Back up both database and checkpoint files before migration.

## Exact safe development mode

Use these settings in `.env` along with valid database URLs:

```dotenv
DEV_MODE=true
MOCK_TOKEN_MODE=true
MOCHI_DIALOGUE_PROVIDER=template
MOCK_MARKET_DATA=true
MARKET_MODE=mock
SOLANA_NETWORK=devnet
MOCHI_TOKEN_DECIMALS=6
MAX_PLAYERS_PER_ROOM=40
MARKETPLACE_FEE_BPS=0
CADENCE_BUYBACK_BPS=
ALLOW_MAINNET_PAYMENTS=false
```

No Solana funds, LLM key, Redis or object storage is required. The HUD explicitly says
TEST $MOCHI. Settings → Switch development account is a local test identity switch, not
production authentication. Use separate browser profiles for two different users; one account
has one live socket, and a duplicate tab replaces its prior connection. New accounts can adopt
via Mochis → Adopt. The server assigns up to 40 users/instance and creates another when full.

## Configuration and limits

- `DATABASE_URL`, `TEST_DATABASE_URL`, `HOST`, `PORT`, `GAME_TIMEZONE` remain.
- Market: `MARKET_MODE=live` uses server-side CoinGecko; optional `COINGECKO_API_KEY`.
  `MOCK_MARKET_DATA=true` forces mock. Trading is PAPER only, never real-money trading.
- Dialogue: template default; `MOCHI_DIALOGUE_PROVIDER=openai` additionally needs server-only
  `OPENAI_API_KEY` and explicit `MOCHI_DIALOGUE_MODEL`. Provider errors fall back to templates.
- Real currency: `MOCK_TOKEN_MODE=false`, configured `SOLANA_RPC_URL`, `MOCHI_TOKEN_MINT`,
  `MOCHI_TREASURY_WALLET`, and correct `MOCHI_TOKEN_DECIMALS`. Startup validates mint/cluster.
  Mainnet requires explicit `ALLOW_MAINNET_PAYMENTS=true`; no token addresses are guessed.
- Treasury: optional `CADENCE_BUYBACK_BPS` (unset means no assumed percentage),
  `CADENCE_TOKEN_MINT`; offline reviewed recording additionally needs `CADENCE_DEX_PROGRAM_ID`.
- Brain intervals: `TRADING_INTERVAL_MS=300000`, `COMPETITION_INTERVAL_MS=60000`.
  Rendering/networking never triggers a financial/brain tick. One native host loads independent
  versioned checkpoints; original browser rooms retain exclusive renewable leases.

Password account registration/sign-in, hashed sessions and all-device logout are available.
Set `AUTH_REQUIRED=true` to exercise them in local mock mode; `DEV_MODE=false` always
requires authentication and emits Secure cookies (serve through HTTPS). Existing development
accounts cannot be claimed by registration; account migration/recovery requires a separately
reviewed owner process. Run `db:migrate` before enabling the new account flow; old sessions
are invalidated by hashed bearer storage. Wallet linking stays optional and separate.

Account recovery/migration, token reconciliation/refunds, live-wallet integration, training provenance,
shared/distributed workers and multisig treasury execution remain launch requirements.
Game-item fulfillment after SPL payment is centralized, not trustless atomic settlement.
No treasury purchase/burn, Solana payment or public deployment was performed in this pass.

## Tests

```sh
npm test
npm run test:brain
npm run test:social
npm audit --omit=dev
```

Set TEST_DATABASE_URL to a dedicated test database. Tests use temporary isolated schemas,
including the actual two-user WebSocket protocol, currency reservations/replay/forgery, wallet
signatures, dialogue privacy, competition races and independent real Cadence Lives.

Current pivot report: [ISOMETRIC_DELIVERY.md](docs/ISOMETRIC_DELIVERY.md). Original artwork,
atlas conventions and provenance: [ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md).

## Routes and documentation

`/home`, `/world/:room`, `/home/:username`, `/wallet`, `/treasury`, `/pets`, plus all prior
inventory/profile/shop/trading/community routes. Rooms: town, cafe, park, market, arcade,
exchange, arena, lab, home. The original pet simulation remains `/room` and `/classic.html`.
Guilds, post, auctions and messages remain explicit Coming Soon pages.

See [social-world delivery](docs/SOCIAL_WORLD_DELIVERY.md), [architecture](docs/ARCHITECTURE.md),
[multiplayer](docs/MULTIPLAYER.md), [Phaser](docs/PHASER_WORLD.md), [dialogue](docs/MOCHI_DIALOGUE.md),
[token payments](docs/TOKEN_PAYMENTS.md), [treasury](docs/TREASURY.md), and [deployment](docs/DEPLOYMENT.md).
No neural mechanism or published brain pack was changed; measured behavior stays in STATUS.md.

## World development

The primary world uses PixiJS for a painterly isometric presentation, bundled by
Vite. The server owns movement and gameplay outcomes; sprite animation presents
accepted events. Run `npm run build` after frontend changes, or run
`npm run build:watch` while `npm start` serves the app.
See [the asset pipeline](docs/ASSET_PIPELINE.md) and
[action animation delivery](docs/ACTION_ANIMATION_DELIVERY.md).

React Three Fiber/Three.js and `npm run assets:models` remain historical 3D
prototype tooling. Exported prototype GLBs are included; they are not the primary
world renderer. See [3D prototype delivery](docs/3D_DELIVERY.md).

## Adventure milestone

Combat, separate persistent Cadence battle brains, fishing, woodcutting and resource buyers are available in the existing world. See [the delivery and exact setup](docs/ADVENTURE_DELIVERY.md). Battle plasticity is measured, but combat competence remains below random in the current assay. Real resource rewards require an explicitly configured, funded treasury; local rewards are labelled mock currency.

## Locomotion

Local movement is predicted immediately; remote players and Mochis use timestamped interpolation. Walk cycles have eight articulated frames per diagonal direction, driven by distance rather than render FPS. See [movement audit](docs/MOVEMENT_AUDIT.md) and [locomotion delivery](docs/LOCOMOTION_DELIVERY.md). Development diagnostics include network simulation, FPS caps and frame previews. `npm run test:movement` and `npm run bench:movement` reproduce logic checks and the transport sweep.

Full-body character animation: [delivery and artist tasks](docs/ANIMATION_DELIVERY.md).
Use `npm run assets:validate` / `npm run test:animation`; the developer animation
viewer and20/40 crowd controls are under World diagnostics.
