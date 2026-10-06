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

## Current presentation

The main world uses PixiJS painterly isometric rendering. Three.js/React Three
Fiber and Phaser documentation describes historical prototypes. See
[ASSET_PIPELINE.md](ASSET_PIPELINE.md) for current sprite registration and
[ACTION_ANIMATION_DELIVERY.md](ACTION_ANIMATION_DELIVERY.md) for presentation
contracts. Build with `npm run build` before serving.

## Real load and soak

`npm run bench:multiplayer` runs persisted independent accounts through `/socket`
against the actual server and PostgreSQL. See [MULTIPLAYER_SOAK.md](MULTIPLAYER_SOAK.md)
for five-minute/30-minute/multi-hour profiles, measured results, failures, resource
sizing limits and companion acceptance. IPC metrics are opt-in and have no public
endpoint. Server authority and the default 10 Hz movement cadence remain unchanged.

## Movement replication — 2026-10-06

Authority still advances every body and its companion at 10 Hz. Replication now
sends one `movementSnapshot` per receiving client per tick when something is due:
`{instanceId, sequence, serverTime, keyframe, players:[{userId, ...changed,
snapshotIntervalMs}]}`. Sequence numbers belong to the recipient and reset on
room entry. Deltas contain position, facing, movement intent/state, seating and
partial companion dynamics. Only the owner receives its authoritative path.
Wire positions round to 0.01 logical units and facing to four decimals; simulation
coordinates retain their precision. A complete **dynamic** keyframe every second
repairs an intentionally lost developer-test packet without repeating profiles.

`roomSnapshot` and `playerJoined` carry complete entity descriptions, including
names, species/profile, equipment and avatar appearance. Appearance/active-pet
changes refresh that description. The shared browser/harness decoder merges
deltas before the existing prediction/interpolation code sees them. Leaving
removes the identity and its delta base; entering resets the room and sequence.
Client and server protocol changes must deploy together.

Interest uses isometric projected distances `dx=.72*((x-vx)-(y-vy))` and
`dy=.36*((x-vx)+(y-vy))`, centered on the receiving player's authoritative body.
The client reports its viewport half-width/height divided by zoom, at most once
per second and refreshes unchanged bounds every ten seconds for reconnects; the server clamps this to 400–2400 by 250–1600 projected units.
Without a report it uses 800 by 550. Within viewport bounds plus 180 units,
movement is near (100 ms); near remains near through a 300-unit margin. Mid
adds 500 horizontal/350 vertical units with the same 120-unit hysteresis and
updates at 200 ms. Far updates at 1000 ms. Stationary actors receive only a
one-second heartbeat. Stops, new intents, seating and pet state/identity changes
are immediate. The owner's tier is always near. Actors remain present throughout
the room, so crossing an interest boundary does not spawn/despawn or flicker.

Remote interpolation delay is at least the tier interval plus 20 ms (minimum
120 ms). The presentation clock slews monotonically when a tier changes, avoiding
a backward step or sudden forward jump. Far presentation consequently trails by about a second; visible padded
viewport actors stay near. Gameplay relevance, combat results, speech/emotes,
resource updates and room membership do not use movement interest tiers.
Authored NPC routes remain client-local; adventure state remains at its existing
cadence. Shared room events serialize once and reuse the encoded payload.

At 200,000 buffered socket bytes, movement is coalesced and delta bases do not
advance. Other events enter a FIFO bounded by 256 entries and 1 MiB. Recovery
flushes these before movement. Five seconds continuously over the watermark,
or queue overflow, closes explicitly with code 1013 and requests authoritative
resynchronization. Queued events requiring resync are counted, rather than
silently reported as delivered. This is bounded delivery while connected, not
a durable replay log of transient combat effects after disconnect.

Opt-in `MULTIPLAYER_METRICS=true` IPC records exact JSON payload bytes and
recipient counts by type, encoded counts/fan-out, byte-size histograms, stringify
time, serialized bytes, GC pauses, heap/RSS, socket watermark, coalescing,
critical queues and slow disconnects. Embedded player/pet/mob/node component
rows describe portions of packets and must not be added to packet totals.
Byte histograms cap distinct sizes at 4096 per window/type; overflow makes p95
unavailable. Diagnostic component serialization is timed separately and is
absent when metrics are disabled. Serialized byte volume is an allocation proxy,
not an exact V8 heap allocation measurement.
