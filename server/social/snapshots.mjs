// Replication only: never advances bodies or chooses gameplay outcomes.
const round = (v, digits = 2) => Math.round((v ?? 0) * 10 ** digits) / 10 ** digits;
export function movementState(p) {
  return {
    x: round(p.x), y: round(p.y), rotation: round(p.rotation, 4),
    moving: !!p.target, moveSeq: p.moveSeq ?? 0, speed: round(p.speed),
    seated: p.seated ?? null,
    companion: p.companion ? {
      id: p.companion.id, x: round(p.companion.x), y: round(p.companion.y),
      state: p.companion.state, rotation: round(p.companion.rotation, 4),
      followSpeed: round(p.companion.followSpeed),
    } : null,
  };
}
export function interestTier(viewer, actor, previous = 'near') {
  if (viewer === actor) return 'near';
  // Isometric projected bounds with a 180-unit buffer and 120-unit hysteresis.
  const dx = Math.abs(((actor.x - viewer.x) - (actor.y - viewer.y)) * .72);
  const dy = Math.abs(((actor.x - viewer.x) + (actor.y - viewer.y)) * .36);
  const width = viewer.view?.halfWidth ?? 800, height = viewer.view?.halfHeight ?? 550;
  const nearPad = previous === 'near' ? 300 : 180;
  if (dx <= width + nearPad && dy <= height + nearPad) return 'near';
  const midPad = previous !== 'far' ? 300 : 180;
  if (dx <= width + 500 + midPad && dy <= height + 350 + midPad) return 'mid';
  return 'far';
}
const INTERVAL = { near: 100, mid: 200, far: 1000 };
const fingerprints = (value) => Object.fromEntries(Object.entries(value).map(([k,v]) => [k, JSON.stringify(v)]));
function delta(now, before) {
  const changed = {};
  for (const [k,v] of Object.entries(now.value))
    if (!before || now.keys[k] !== before.keys[k]) changed[k] = v;
  if (changed.companion && before?.value.companion?.id === now.value.companion?.id) {
    const pet = {};
    for (const [k,v] of Object.entries(now.value.companion))
      if (JSON.stringify(v) !== JSON.stringify(before.value.companion[k])) pet[k] = v;
    changed.companion = { id: now.value.companion.id, ...pet };
  }
  return changed;
}
export class ActorSnapshots {
  constructor() { this.clients = new Map(); this.sequence = 0; }
  forget(id) {
    this.clients.delete(id);
    for (const c of this.clients.values()) c.actors.delete(id);
  }
  tick(multiplayer, now) {
    for (const room of multiplayer.store.rooms.values()) {
      const states = new Map();
      for (const p of room.players.values()) {
        const value = movementState(p);
        states.set(p.userId, { value, keys: fingerprints(value) });
      }
      for (const viewer of room.players.values()) {
        let client = this.clients.get(viewer.userId);
        if (!client || client.room !== viewer.room) {
          client = { room: viewer.room, actors: new Map(), sequence: 0, keyframeAt: -Infinity };
          this.clients.set(viewer.userId, client);
        }
        // Do not advance delta bases for a snapshot the socket did not receive.
        if (!multiplayer.flush(viewer)) {
          multiplayer.metrics?.count('coalescedMovementSnapshots');
          continue;
        }
        const players = [], next = [];
        const keyframe = now - client.keyframeAt >= 1000;
        for (const actor of room.players.values()) {
          const state = states.get(actor.userId), previous = client.actors.get(actor.userId);
          const tier = interestTier(viewer, actor, previous?.tier);
          const interval = INTERVAL[tier];
          const change = keyframe ? { ...state.value } : delta(state, previous?.state);
          const changed = Object.keys(change).length > 0;
          // Stops, new intents, seating and companion state/identity changes never wait for a tier.
          const urgent = !previous || ['moving','moveSeq','seated'].some(k => k in change)
            || (change.companion && ('state' in change.companion || 'id' in change.companion && previous?.state.value.companion?.id !== actor.companion?.id));
          const due = now - (previous?.at ?? 0) >= (changed ? interval : 1000);
          if (!keyframe && !urgent && !due) continue;
          if (!changed && tier === previous?.tier && now - previous.at < 1000) continue;
          // Heartbeat keeps settled actors and clock/interpolation state fresh at 1 Hz.
          const update = { userId: actor.userId, ...change, snapshotIntervalMs: interval };
          if (actor === viewer) update.path = actor.target ? [actor.target, ...(actor.path ?? [])] : [];
          players.push(update);
          next.push([actor.userId, { state, at: now, tier }]);
          multiplayer.metrics?.count('replicatedActorUpdates');
          if (tier !== 'near') multiplayer.metrics?.count('interestTierUpdates.' + tier);
        }
        if (players.length && multiplayer.sendMovement(viewer, {
          instanceId: room.id ?? viewer.room, sequence: client.sequence + 1, serverTime: now, keyframe, players,
        })) {
          client.sequence++;
          if (keyframe) client.keyframeAt = now;
          for (const [id, state] of next) client.actors.set(id, state);
        }
      }
    }
  }
}
