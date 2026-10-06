// Projection is presentation only. Server coordinates and navigation stay logical.
export const ISO = Object.freeze({ x: 0.72, y: 0.36 });
export function project(p) {
  return { x: (p.x - p.y) * ISO.x, y: (p.x + p.y) * ISO.y };
}
export function unproject(p) {
  return {
    x: (p.x / ISO.x + p.y / ISO.y) / 2,
    y: (p.y / ISO.y - p.x / ISO.x) / 2,
  };
}
export function depth(p, bias = 0) {
  return (p.x + p.y) * ISO.y + bias;
}
export function direction(dx, dy, previous = 0) {
  if (Math.hypot(dx, dy) < 0.01) return previous;
  // Atlas: southeast, southwest, northwest, northeast.
  const q = project({ x: dx, y: dy });
  return q.y >= 0 ? (q.x >= 0 ? 0 : 1) : q.x < 0 ? 2 : 3;
}
export function frameIndex(row, facing) {
  return row * 4 + facing;
}
export function beastArchetype(p) {
  const named = p.profile?.beast?.archetype;
  if (named === "woodland-deer" || named === "moonfox") return named;
  return /green|forest|sage|mint/i.test(p.profile?.variant ?? "")
    ? "woodland-deer"
    : "moonfox";
}
export function visualStep(p, target, dt, speed = 205) {
  const dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy),
    t = d ? Math.min(1, (speed * Math.min(dt, 0.1)) / d) : 0;
  return { x: p.x + dx * t, y: p.y + dy * t };
}
