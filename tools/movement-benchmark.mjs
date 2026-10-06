import {
  advance,
  SnapshotBuffer,
  Prediction,
  Gait,
} from "../web/js/game/locomotion/core.js";
// Deterministic synthetic packet transport. Latency is per direction, as in HUD.
const rows = [];
for (const hz of [10, 15, 20])
  for (const latency of [0, 50, 100, 200])
    for (const jitter of [0, 25, 50])
      for (const loss of [0, 1, 3, 5]) {
        let rng = 42;
        const random = () => {
          rng = (1664525 * rng + 1013904223) >>> 0;
          return rng / 2 ** 32;
        };
        let server = { x: 0, y: 0, speed: 0 },
          path = [{ x: 1800, y: 0 }],
          prediction = new Prediction(server);
        prediction.start(path, 1);
        let nextTick = latency,
          packets = [],
          b = new SnapshotBuffer(),
          local = { x: 0, y: 0 },
          remote = { x: 0, y: 0 },
          errors = [],
          backsteps = 0,
          remoteIdle = 0,
          samples = 0,
          bytes = 0;
        for (let time = 0; time <= 10000; time += 1000 / 120) {
          if (time >= nextTick) {
            advance(server, path, 1 / hz);
            nextTick += 1000 / hz;
            const s = {
              x: server.x,
              y: 0,
              speed: server.speed,
              path: path.map((q) => ({ ...q })),
              serverTime: time,
              moveSeq: 1,
              moving: path.length > 0,
            };
            const due =
              time + Math.max(0, latency + (random() * 2 - 1) * jitter);
            bytes += JSON.stringify(s).length;
            packets.push({ due, s, lost: random() * 100 < loss });
          }
          const ready = packets
            .filter((p) => p.due <= time)
            .sort((a, b) => a.due - b.due);
          packets = packets.filter((p) => p.due > time);
          for (const packet of ready) {
            prediction.reconcile(packet.s, time);
            if (!packet.lost) b.push({ t: packet.s.serverTime, ...packet.s },time);
          }
          const old = local;
          local = prediction.step(1 / 120);
          const q = b.sample(time);
          if (q) {
            if (time > 1000 && time < 8000) {
              samples++;
              if (Math.abs(q.x - remote.x) < 0.01) remoteIdle++;
            }
            remote = q;
          }
          if (time > 1000 && time < 8000) {
            errors.push(prediction.error);
            if (local.x < old.x - 0.05) backsteps++;
          }
        }
        rows.push({
          hz,
          latency,
          jitter,
          loss,
          meanPredictionError: +(
            errors.reduce((a, b) => a + b, 0) / errors.length
          ).toFixed(2),
          hardSnaps: prediction.snaps,
          backsteps,
          remoteStationaryPct: +((remoteIdle / samples) * 100).toFixed(2),
          bytesPerSecond: Math.round(bytes / 10),
        });
      }
const fps = [30, 60, 120].map((hz) => {
  let p = { x: 0, y: 0, speed: 0 },
    path = [{ x: 10000, y: 0 }],
    g = new Gait();
  for (let i = 0; i < hz * 5; i++) {
    const old = p.x;
    advance(p, path, 1 / hz);
    g.update(p.x - old, 0, 1 / hz);
  }
  return { fps: hz, distance: p.x, phase: g.phase };
});
console.log(
  JSON.stringify(
    {
      kind: "synthetic straight-path transport, not browser FPS or multiplayer soak",
      fps,
      rows,
    },
    null,
    2,
  ),
);
