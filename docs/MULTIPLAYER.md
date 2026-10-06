# Multiplayer

`server/social/multiplayer.mjs` attaches a same-origin, authenticated WebSocket upgrade to
`/socket`. The cookie must identify an unexpired game session. No movement polling occurs.
`MemoryRoomStore` owns players and room instances; PostgreSQL stores final avatar location.
Capacity defaults to 40 and is configurable via MAX_PLAYERS_PER_ROOM (1–100).

The protocol types live in `events.ts`. Every event dispatch validates membership, room,
finite coordinates, walkable regions/segments, allowed emotes/phrases, active companion,
interaction distance and presence values. Payloads are limited to 2KB, 25 events/sec,
movement requests at most ~8/sec, and emotes at most once/1.5s. The server moves at 180
logical units/sec and emits actual position/companion updates at 10Hz. Clients interpolate;
local movement prediction uses the same speed. Floor props/fountain are collision boundaries.

Join leaves the old instance, restores valid saved position or spawns safely, and sends a
snapshot after identity setup. Client waits for ready before joining. Replacement connections
close the previous socket; close/error/45s stale timeout remove ghosts. Ping/pong maintains
liveness. Reconnect retries after 2s; a duplicate-tab close intentionally stops retrying.
Presence is online/away/offline, with no exact public last-seen. One active room per account.

Home instances are owner/accepted-friend only. Presence is ephemeral and restarts lose
membership. Multi-process deployment needs Redis/pubsub, distributed room assignment,
session revalidation and rate counters; the store boundary is present but Redis is not implemented.

## Current3D presentation

The main world now uses React Three Fiber/Three.js. The previous Phaser section is
historical. See [3D_DELIVERY.md](3D_DELIVERY.md) for implemented scope and limits and
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for models/rigs. Domain services and Cadence
contracts remain preserved. Build with `npm run build` before serving/deploying.
