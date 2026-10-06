// Shared by the browser and real socket harness. Converts wire deltas to complete
// authoritative actor snapshots before prediction/interpolation sees them.
export class SnapshotDecoder {
  constructor() { this.players = new Map(); this.sequence = 0; }
  consume(event) {
    const { type, data } = event;
    if (type === 'roomSnapshot') {
      this.instanceId = data.instanceId;
      this.sequence = 0;
      this.players = new Map(data.players.map(p => [p.userId, p]));
    } else if (type === 'playerJoined') this.players.set(data.userId, data);
    else if (type === 'playerLeft') this.players.delete(data.userId);
    else if (type === 'playerMoved') {
      const old = this.players.get(data.userId);
      if (old && (data.serverTime ?? 0) >= (old.serverTime ?? 0)) this.players.set(data.userId, { ...old, ...data });
    } else if (type === 'movementSnapshot') {
      if (data.instanceId !== this.instanceId || data.sequence <= this.sequence) return [];
      this.sequence = data.sequence;
      const events = [];
      for (const update of data.players) {
        const old = this.players.get(update.userId);
        if (!old || data.serverTime < (old.serverTime ?? 0)) continue;
        const companion = update.companion === undefined ? old.companion
          : update.companion === null ? null
          : old.companion?.id === update.companion.id ? { ...old.companion, ...update.companion } : update.companion;
        const player = { ...old, ...update, companion, serverTime: data.serverTime };
        this.players.set(update.userId, player);
        events.push({ type: 'playerMoved', data: player });
      }
      return events;
    }
    return [event];
  }
}
