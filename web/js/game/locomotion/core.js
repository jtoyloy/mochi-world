// Logical-world locomotion shared by authoritative simulation and presentation.
export const MOTION = Object.freeze({
  speed: 180,
  acceleration: 600,
  maxDelta: 0.1,
  stride: 105,
  petStride: 82,
  interpolationDelay: 120,
  maxExtrapolation: 120,
  smallError: 3,
  snapError: 160,
});
export function traverse(p, path, distance, valid = () => true) {
  let index = 0,
    moved = 0,
    dx = 0,
    dy = 0;
  while (distance > 1e-8 && index < path.length) {
    const q = path[index],
      x = q.x - p.x,
      y = q.y - p.y,
      d = Math.hypot(x, y);
    if (d < 1e-8) {
      index++;
      continue;
    }
    const step = Math.min(d, distance),
      next = { x: p.x + (x * step) / d, y: p.y + (y * step) / d };
    if (!valid(p, next)) break;
    p.x = next.x;
    p.y = next.y;
    dx = x / d;
    dy = y / d;
    moved += step;
    distance -= step;
    if (step >= d - 1e-8) index++;
    else break;
  }
  if (index) path.splice(0, index);
  return { moved, dx, dy, remaining: path.length };
}
export function advance(p, path, dt, maxDelta = MOTION.maxDelta) {
  dt = Math.min(maxDelta, Math.max(0, dt));
  const before = p.speed ?? 0;
  p.speed = path.length
    ? Math.min(MOTION.speed, before + MOTION.acceleration * dt)
    : 0;
  return traverse(p, path, (before + p.speed) * 0.5 * dt);
}
export function facing8(dx, dy, previous = 0) {
  if (Math.hypot(dx, dy) < 0.001) return previous;
  const angle = Math.atan2(dy, dx),
    old = (previous * Math.PI) / 4;
  const diff = Math.atan2(Math.sin(angle - old), Math.cos(angle - old));
  return Math.abs(diff) < Math.PI / 8 + 0.09
    ? previous
    : (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}
// Existing four-direction art: logical +x SE, +y SW, -x NW, -y NE.
export const facing4 = (f) => Math.floor(((f + 1) % 8) / 2);
export class Gait {
  constructor(stride = MOTION.stride) {
    this.stride = stride;
    this.distance = 0;
    this.state = "idle";
    this.facing = 0;
    this.phase = 0;
    this.frame = 0;
    this.events = [];
  }
  update(dx, dy, dt) {
    const distance = Math.hypot(dx, dy),
      speed = dt > 0 ? distance / dt : 0;
    this.events.length = 0;
    this.state = speed > (this.state === "walk" ? 1 : 3) ? "walk" : "idle";
    if (this.state === "walk") {
      this.facing = facing8(dx, dy, this.facing);
      const old = Math.floor((this.distance / this.stride) * 2);
      this.distance += distance;
      const next = Math.floor((this.distance / this.stride) * 2);
      for (let i = old + 1; i <= next; i++)
        this.events.push(i % 2 ? "footstep_right" : "footstep_left");
      this.phase = (this.distance / this.stride) % 1;
      this.frame = Math.floor(this.phase * 8);
    }
    return speed;
  }
}
export class SnapshotBuffer {
  constructor(delay = MOTION.interpolationDelay) {
    this.delay = delay;
    this.baseDelay = delay;
    this.arrivalLags = [];
    this.arrivalIntervals = [];
    this.samples = [];
    this.stale = 0;
  }
  push(s, receivedAt) {
    if (!Number.isFinite(s.t) || !Number.isFinite(s.x) || !Number.isFinite(s.y))
      return;
    const list = this.samples;
    if (list.length && s.t <= list.at(-1).t) return;
    if (Number.isFinite(receivedAt)) {
      if (this.lastReceivedAt !== undefined) {
        this.arrivalIntervals.push(
          Math.max(0, receivedAt - this.lastReceivedAt),
        );
        if (this.arrivalIntervals.length > 32) this.arrivalIntervals.shift();
      }
      this.lastReceivedAt = receivedAt;
      this.arrivalLags.push(Math.max(0, receivedAt - s.t));
      if (this.arrivalLags.length > 16) this.arrivalLags.shift();
      this.delay = Math.max(
        this.baseDelay,
        Math.max(...this.arrivalLags) + 100,
      );
    }
    list.push({ ...s });
    if (list.length > 32) list.shift();
  }
  sample(now) {
    const list = this.samples;
    if (!list.length) return null;
    let t = now - this.delay;
    if (this.smoothDelay && this.presentationTime !== undefined) {
      const dt = Math.max(0, now - this.sampledAt);
      const correction = t - (this.presentationTime + dt);
      // Slew the presentation clock when interest changes its delay. It must
      // remain monotonic rather than stepping backwards or jumping forward.
      t = this.presentationTime + dt * Math.max(.5, Math.min(1.5, 1 + correction / 1000));
    }
    this.presentationTime = t;
    this.sampledAt = now;
    while (list.length > 2 && list[1].t < t) list.shift();
    let a = list[0],
      b = list[1];
    if (t <= a.t) return { x: a.x, y: a.y };
    if (b && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    a = list.at(-2);
    b = list.at(-1);
    this.stale = Math.max(0, t - b.t);
    if (!a || !b.moving || b.t - a.t <= 0) return { x: b.x, y: b.y };
    const lead = Math.min(MOTION.maxExtrapolation, this.stale),
      dx = (b.x - a.x) / (b.t - a.t),
      dy = (b.y - a.y) / (b.t - a.t);
    return { x: b.x + dx * lead, y: b.y + dy * lead };
  }
}
export class Prediction {
  constructor(p) {
    this.p = { ...p, speed: 0 };
    this.path = [];
    this.seq = 0;
    this.error = 0;
    this.corrections = 0;
    this.snaps = 0;
    this.bias = { x: 0, y: 0 };
  }
  start(path, seq) {
    this.seq = seq;
    this.path = path.map((p) => ({ ...p }));
  }
  step(dt) {
    advance(this.p, this.path, dt);
    const f = Math.exp(-Math.min(dt, 0.1) * 18);
    this.bias.x *= f;
    this.bias.y *= f;
    return { x: this.p.x + this.bias.x, y: this.p.y + this.bias.y };
  }
  reconcile(s, now, offset = 0) {
    if (
      (s.moveSeq ?? 0) < this.seq ||
      (s.serverTime ?? 0) < (this.lastTime ?? 0)
    )
      return;
    this.lastTime = s.serverTime ?? this.lastTime;
    const next = { x: s.x, y: s.y, speed: s.speed ?? 0 },
      path = (s.path ?? []).map((p) => ({ ...p }));
    let elapsed = Math.min(
      0.3,
      Math.max(0, (now + offset - s.serverTime) / 1000),
    );
    while (elapsed > 0 && path.length) {
      const dt = Math.min(0.025, elapsed);
      advance(next, path, dt);
      elapsed -= dt;
    }
    const old = { x: this.p.x + this.bias.x, y: this.p.y + this.bias.y };
    this.error = Math.hypot(old.x - next.x, old.y - next.y);
    this.p = next;
    this.path = path;
    if (this.error > MOTION.snapError || s.seated) {
      this.bias = { x: 0, y: 0 };
      if (this.error > MOTION.smallError) this.snaps++;
    } else {
      this.bias = { x: old.x - next.x, y: old.y - next.y };
      if (this.error > MOTION.smallError) this.corrections++;
    }
  }
  reject(s) {
    this.seq = s.moveSeq ?? this.seq;
    this.path = [];
    this.reconcile(
      { ...s, path: [], serverTime: s.serverTime ?? Date.now() },
      s.serverTime ?? Date.now(),
    );
  }
}
export function spring(position, velocity, target, dt, frequency = 12) {
  const e = Math.exp(-frequency * Math.min(dt, 0.1));
  for (const axis of ["x", "y"]) {
    const delta = position[axis] - target[axis],
      c = velocity[axis] + frequency * delta;
    position[axis] = target[axis] + (delta + c * dt) * e;
    velocity[axis] = (velocity[axis] - frequency * c * dt) * e;
  }
  return position;
}

export function contactPose(phase, stride = 15, liftHeight = 12) {
  const t = ((phase % 1) + 1) % 1;
  return {
    along: t < 0.5 ? stride * (1 - 4 * t) : stride * (-1 + 4 * (t - 0.5)),
    lift: t < 0.5 ? 0 : Math.sin((t - 0.5) * 2 * Math.PI) * liftHeight,
  };
}
