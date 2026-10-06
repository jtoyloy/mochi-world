import {
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
} from "node:perf_hooks";
// Opt-in IPC diagnostics. No public endpoint and no account/session data.
export class RuntimeMetrics {
  constructor(pool) {
    this.counts = {};
    this.timings = {};
    this.protocol = {};
    this.gauges = {};
    this.loop = monitorEventLoopDelay({ resolution: 10 });
    this.loop.enable();
    this.gc = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.time("gcPauseMs", entry.duration);
        this.count("gcEvents");
      }
    });
    this.gc.observe({ entryTypes: ["gc"] });
    this.cpu = process.cpuUsage();
    this.at = performance.now();
    const instrument = (client) => {
      if (client && !client.__runtimeMeasured) {
        const query = client.query;
        client.query = (...args) => {
          this.count("databaseQueries");
          return query.apply(client, args);
        };
        client.__runtimeMeasured = true;
      }
      return client;
    };
    const connect = pool.connect;
    pool.connect = (...args) => {
      if (typeof args[0] === "function") {
        const callback = args[0];
        return connect.call(pool, (error, client, release) =>
          callback(error, instrument(client), release),
        );
      }
      return connect.apply(pool, args).then(instrument);
    };
  }
  close() {
    this.loop.disable();
    this.gc.disconnect();
  }
  count(key, n = 1) {
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }
  time(key, ms) {
    const t = (this.timings[key] ??= {
      count: 0,
      sum: 0,
      max: 0,
      buckets: Array(12).fill(0),
    });
    t.count++;
    t.sum += ms;
    t.max = Math.max(t.max, ms);
    t.buckets[
      Math.min(11, Math.max(0, Math.ceil(Math.log2(Math.max(0.125, ms))) + 3))
    ]++;
  }
  observe(key, value) {
    this.gauges[key] = Math.max(this.gauges[key] ?? 0, value);
  }
  protocolEncoded(type, bytes) {
    const t = (this.protocol[type] ??= { encoded: 0, recipients: 0, bytes: 0, sizes: {}, overflow: 0 });
    t.encoded++;
  }
  protocolSent(type, bytes) {
    const t = (this.protocol[type] ??= { encoded: 0, recipients: 0, bytes: 0, sizes: {}, overflow: 0 });
    t.recipients++;
    t.bytes += bytes;
    if (t.sizes[bytes] !== undefined || Object.keys(t.sizes).length < 4096)
      t.sizes[bytes] = (t.sizes[bytes] ?? 0) + 1;
    else t.overflow++;
  }
  sample(multiplayer, adventure) {
    const now = performance.now(),
      elapsed = (now - this.at) / 1000,
      cpu = process.cpuUsage(this.cpu);
    this.cpu = process.cpuUsage();
    this.at = now;
    const sample = {
      elapsed,
      cpuCores: (cpu.user + cpu.system) / 1e6 / elapsed,
      ...process.memoryUsage(),
      eventLoopP95Ms: this.loop.percentile(95) / 1e6,
      eventLoopP99Ms: this.loop.percentile(99) / 1e6,
      eventLoopMaxMs: this.loop.max / 1e6,
      gauges: this.gauges,
      protocol: this.protocol,
      counts: this.counts,
      timings: this.timings,
      players: multiplayer.store.players.size,
      rooms: multiplayer.store.rooms.size,
      roomOccupancy: Object.fromEntries(
        [...multiplayer.store.rooms].map(([id, room]) => [
          id,
          room.players.size,
        ]),
      ),
      connections: multiplayer.wss.clients.size,
      slowClients: [...multiplayer.store.players.values()].filter(p => p.slowSince != null).length,
      criticalQueueBytes: [...multiplayer.store.players.values()].reduce((n,p) => n + (p.outboxBytes ?? 0), 0),
      snapshotClients: multiplayer.snapshots?.clients.size ?? 0,
      encounters: multiplayer.encounters.size,
      companions: [...multiplayer.store.players.values()].filter(
        (p) => p.companion && p.room,
      ).length,
      staleActors: [...multiplayer.store.players.values()].filter(
        (p) => Date.now() - p.lastSeen > 45000,
      ).length,
      adventureInstances: adventure.instances.size,
      adventureStates: adventure.states.size,
      activeResources: process.getActiveResourcesInfo(),
    };
    this.counts = {};
    this.timings = {};
    this.protocol = {};
    this.gauges = {};
    this.loop.reset();
    return sample;
  }
}
