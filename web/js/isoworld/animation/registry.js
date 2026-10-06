// Shared by the renderer, artist viewer and validation tools. No movement decisions.
export const DIRECTIONS8 = ["SE", "S", "SW", "W", "NW", "N", "NE", "E"];
export const STATES = [
  "idle",
  "walk",
  "trot",
  "settle",
  "talk",
  "vendor-idle",
  "sit",
  "gesture",
  "attack",
  "cast",
  "hurt",
  "defend",
  "defeat",
  "fish",
  "chop",
  "interact",
];
const base = {
  directions: ["SE", "SW", "NW", "NE"],
  walkFrameCount: 8,
  idleFrameCount: 8,
  footAnchor: { x: 0.5, y: 0.88 },
  headAnchor: { x: 0.5, y: 0.12 },
  cell: [224, 224],
  idleSeconds: 4.8,
  settleSeconds: 0.14,
  walkEnter: 3,
  walkExit: 1,
};
export const ANIMATION_SETS = [
  {
    ...base,
    id: "chestnut-sage",
    bodyType: "adult-human",
    locomotionType: "biped",
    strideDistance: 105,
    height: 124,
    texture: "human-sage-v2.png",
  },
  {
    ...base,
    id: "dark-curls-coral",
    bodyType: "adult-human",
    locomotionType: "biped",
    strideDistance: 105,
    height: 124,
    texture: "human-coral-v2.png",
  },
  {
    ...base,
    id: "moonfox",
    bodyType: "small-quadruped",
    locomotionType: "quadruped",
    strideDistance: 82,
    height: 83,
    texture: "moonfox-v2.png",
    trotEnter: 195,
    trotExit: 175,
    trotStrideDistance: 105,
  },
  {
    ...base,
    id: "woodland-deer",
    bodyType: "heavy-quadruped",
    locomotionType: "quadruped",
    strideDistance: 112,
    height: 83,
    texture: "woodland-deer-v2.png",
    trotEnter: 200,
    trotExit: 180,
    trotStrideDistance: 140,
    idleSeconds: 6,
  },
];
export const LOCOMOTION_TYPES = [
  "biped",
  "quadruped",
  "hopper",
  "floating",
  "scuttler",
  "serpentine",
];
export function directionIndex(set, logical) {
  return set.directions.length === 8
    ? logical
    : Math.floor(((logical + 1) % 8) / 2);
}
export function animationSet(id) {
  return ANIMATION_SETS.find((s) => s.id === id) ?? ANIMATION_SETS[0];
}
export function frameFromPhase(phase, count) {
  return Math.min(count - 1, Math.floor((((phase % 1) + 1) % 1) * count));
}
export function validateSet(s) {
  if (!s.id || !LOCOMOTION_TYPES.includes(s.locomotionType))
    throw Error("Invalid animation identity/type");
  const dirs = s.directions;
  if (
    ![4, 8].includes(dirs.length) ||
    new Set(dirs).size !== dirs.length ||
    dirs.some((d) => !DIRECTIONS8.includes(d))
  )
    throw Error("Missing/invalid directions");
  if (
    (dirs.length === 4 && dirs.join(",") !== "SE,SW,NW,NE") ||
    (dirs.length === 8 && dirs.join(",") !== DIRECTIONS8.join(","))
  )
    throw Error("Invalid directional row order");
  for (const k of ["walkFrameCount", "idleFrameCount"])
    if (!Number.isInteger(s[k]) || s[k] < 1 || s[k] > 8)
      throw Error("Invalid frame count");
  if (
    !Number.isFinite(s.strideDistance) ||
    s.strideDistance <= 0 ||
    s.cell.length !== 2 ||
    s.cell.some((v) => !Number.isInteger(v) || v < 1)
  )
    throw Error("Invalid source dimensions/stride");
  for (const p of [s.footAnchor, s.headAnchor])
    if (!p || [p.x, p.y].some((v) => !Number.isFinite(v) || v < 0 || v > 1))
      throw Error("Invalid pivot");
  return s;
}
// Presentation-only state: gait phase is retained on turns/stops; basic idle is time-driven.
export class AnimationPlayback {
  constructor(set) {
    this.set = validateSet(set);
    this.state = "idle";
    this.lastDistance = 0;
    this.idleTime = 0;
    this.settleTime = 0;
    this.lastPhase = 0;
    this.phase = 0;
    this.frame = 0;
  }
  update(gait, speed, dt, requested = "") {
    const s = this.set;
    const wasMoving = this.state === "walk" || this.state === "trot";
    const moving = speed > (wasMoving ? s.walkExit : s.walkEnter);
    if (moving) {
      const trot =
        !!s.trotEnter &&
        speed > (this.state === "trot" ? s.trotExit : s.trotEnter);
      this.state = trot ? "trot" : "walk";
      // Preserve phase at stride changes, then consume actual distance at new stride.
      const stride = trot ? s.trotStrideDistance : s.strideDistance;
      if (this.lastDistance !== undefined)
        this.phase =
          (this.phase +
            Math.max(0, gait.distance - this.lastDistance) / stride) %
          1;
      this.lastPhase = this.phase;
      this.frame = frameFromPhase(this.phase, s.walkFrameCount);
      this.idleTime = 0;
      this.settleTime = 0;
    } else {
      if (wasMoving) {
        this.state = "settle";
        this.settleTime = s.settleSeconds;
        this.settleFrame = this.frame;
      }
      this.settleTime = Math.max(0, this.settleTime - dt);
      if (this.settleTime > 0) {
        this.state = "settle";
        this.frame = this.settleFrame;
      } else {
        this.state =
          STATES.includes(requested) &&
          requested !== "walk" &&
          requested !== "trot"
            ? requested
            : "idle";
        this.idleTime += dt;
        this.frame = frameFromPhase(
          this.idleTime / s.idleSeconds,
          s.idleFrameCount,
        );
      }
    }
    this.lastDistance = gait.distance;
    return this;
  }
}
