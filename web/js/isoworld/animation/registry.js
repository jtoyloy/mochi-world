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
  "sword",
  "staff",
  "bow",
  "dagger",
  "special",
  "defend-owner",
  "defend-self",
  "exhausted",
  "item",
  "fish-cast",
  "fish-wait",
  "fish-catch",
  "chop-recover",
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
// Optional painted mob sheets. Missing/malformed art retains the static body.
// These registrations do not certify authored direction or planted-foot quality.
export const MOB_ACTION_SHEETS = {
  slime: "slime-actions-v1.json",
  boar: "boar-actions-v1.json",
  thornling: "thornling-actions-v2.json",
};
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
  // Events replace presentation immediately. No gameplay callback or damage timer.
  play(state, options = {}) {
    if (!ACTION_STATES[state]) return false;
    this.action = { state, time: 0, ...ACTION_STATES[state], ...options };
    return true;
  }
  clearAction() {
    this.action = null;
  }
  update(gait, speed, dt, requested = "") {
    const s = this.set;
    if (this.locomotionFrame !== undefined) this.frame = this.locomotionFrame;
    const wasMoving =
      this.locomotionState === "walk" || this.locomotionState === "trot";
    const moving = speed > (wasMoving ? s.walkExit : s.walkEnter);
    if (moving) {
      const trot =
        !!s.trotEnter &&
        speed > (this.locomotionState === "trot" ? s.trotExit : s.trotEnter);
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
    this.locomotionState = this.state;
    this.locomotionFrame = this.frame;
    if (
      moving &&
      ["fish-cast", "fish-wait", "chop"].includes(this.action?.state)
    )
      this.clearAction();
    if (this.action) {
      const a = this.action;
      a.time += Math.max(0, dt);
      if (a.time >= a.duration && !a.hold && !a.loop) {
        this.action = a.next
          ? { state: a.next, time: 0, ...ACTION_STATES[a.next] }
          : null;
      }
      if (this.action) {
        const a = this.action;
        this.state = a.state;
        this.frame = a.loop
          ? frameFromPhase(a.time / a.duration, 8)
          : Math.min(7, Math.floor((a.time / a.duration) * 8));
      }
    }
    return this;
  }
}

// Durations express weight/readiness only; server cooldowns remain authoritative.
export const ACTION_STATES = {
  attack: { duration: 0.6 },
  sword: { duration: 0.64 },
  staff: { duration: 0.8 },
  bow: { duration: 0.8 },
  dagger: { duration: 0.36 },
  cast: { duration: 0.8 },
  special: { duration: 0.85 },
  hurt: { duration: 0.3 },
  defend: { duration: 0.6 },
  "defend-owner": { duration: 0.7 },
  "defend-self": { duration: 0.7 },
  defeat: { duration: 0.8, hold: true },
  exhausted: { duration: 0.8, hold: true },
  item: { duration: 0.7 },
  interact: { duration: 0.6 },
  fish: { duration: 0.8, next: "fish-wait" },
  "fish-cast": { duration: 0.8, next: "fish-wait" },
  "fish-wait": { duration: 2, loop: true },
  "fish-catch": { duration: 0.7 },
  chop: { duration: 0.9, loop: true },
  "chop-recover": { duration: 0.45 },
};
export const ACTION_FALLBACKS = {
  attack: "sword",
  cast: "staff",
  fish: "fish-cast",
  "fish-wait": "idle",
  "fish-catch": "fish-cast",
  "chop-recover": "chop",
  special: "attack",
  "defend-owner": "defend",
  "defend-self": "defend",
  exhausted: "defeat",
};
