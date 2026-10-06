import { RESOURCE_NODES, VENDORS } from "./adventure.js";
import { TOWN_PORTALS, TOWN_TREES } from "../isoworld/layout.js";
import { TOWN_BOUNDS, TOWN_STALLS } from "./town.js";
// Shared world rules. Coordinates use a 1200 × 720 logical room, never CSS pixels.
export const EMOTES = Object.freeze({
  wave: "👋",
  heart: "♥",
  laugh: "Ha!",
  surprised: "!",
  dance: "♪",
  cheer: "GG!",
  sad: "…",
  sit: "Sit",
});
export const PHRASES = ["Nice Mochi!", "Want to play?", "Hello!", "Good game!"];
export const ROOMS = [
  ...[
    ["forest", "Whispering Forest", 0xbed5ad, "Woodland paths · PvE"],
    ["lake", "Moonwater Lake", 0xb9d9db, "Fishing banks · PvE"],
    ["ruins", "Old Lantern Ruins", 0xc9bdc9, "Stronger guardians · PvE"],
    ["yard", "Training Yard", 0xd7c9ab, "Practice without loot"],
  ].map(([id, name, color, subtitle]) => ({
    id,
    name,
    color,
    subtitle,
    accent: 0x648c63,
    props: [["town", "Town Square", 1080, 480]],
  })),
  {
    id: "town",
    name: "Town Square",
    subtitle: "A little place to belong",
    color: 0xf4dba8,
    accent: 0x5b99a0,
    props: TOWN_PORTALS.map((p) => [p.id, p.label, p.x, p.y]),
  },
  {
    id: "cafe",
    name: "Mochi Café",
    subtitle: "Something warm, something sweet",
    color: 0xf7d4bc,
    accent: 0xba7275,
    props: [
      ["shop:foods", "Sushi counter", 350, 240],
      ["sit", "Window seat", 820, 280],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "park",
    name: "Mochi Park",
    subtitle: "Room to roam",
    color: 0xd2e7b7,
    accent: 0x648c63,
    props: [
      ["play", "Toy meadow", 380, 260],
      ["sit", "Garden bench", 790, 280],
      ["town", "Town Square", 1080, 470],
    ],
  },
  {
    id: "market",
    name: "Market",
    subtitle: "Treasures from your neighbors",
    color: 0xf3ddae,
    accent: 0xbb836c,
    props: [
      ["shop:foods", "Food", 180, 220],
      ["shop:toys", "Toys", 410, 230],
      ["shop:threads", "Wardrobe", 670, 210],
      ["shops", "Player shops", 950, 230],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "arcade",
    name: "Arcade",
    subtitle: "A pocketful of play",
    color: 0xdacced,
    accent: 0x8274b5,
    props: [
      ["arcade-game", "Cloudberry Catch", 340, 240],
      ["sit", "Chill corner", 820, 270],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "exchange",
    name: "Trading Hall",
    subtitle: "Curious minds. Paper portfolios.",
    color: 0xcce3dc,
    accent: 0x589080,
    props: [
      ["trading", "SOL · BONK · WIF", 380, 220],
      ["portfolio", "Paper portfolio", 800, 250],
      ["competitions", "Paper cups", 350, 480],
      ["trade-history", "Trading history", 700, 490],
      ["research", "Watch Mochi analysis", 850, 530],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "arena",
    name: "Arena",
    subtitle: "Cheer for your companion",
    color: 0xf1d1ce,
    accent: 0xbd827e,
    props: [
      ["competitions", "Daily paper cup", 410, 250],
      ["leaderboard", "Trophy podium", 850, 280],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "lab",
    name: "Research Lab",
    subtitle: "Look closer at a learning brain",
    color: 0xd4dcec,
    accent: 0x7e91ae,
    props: [
      ["research", "Cadence viewer", 410, 240],
      ["memories", "Mochi memories", 830, 260],
      ["town", "Town Square", 1080, 480],
    ],
  },
  {
    id: "home",
    name: "Player Home",
    subtitle: "Your own cozy corner",
    color: 0xf3d8d1,
    accent: 0xb48a95,
    props: [
      ["rest", "Bed", 220, 240],
      ["play", "Toy basket", 480, 260],
      ["research", "Trading computer", 830, 230],
      ["town", "Town Square", 1080, 480],
    ],
  },
];
export function roomSpec(id) {
  return ROOMS.find((r) => r.id === id.split(":")[0]);
}
// Logical footprints match 3D environment props; shared by raycast routing and authority.
export const WORLD_COLLIDERS = {
  town: [
    { x: -90, y: 790, w: 14, h: 145 },
    { x: 190, y: 790, w: 14, h: 145 },
    { x: 50, y: 875, w: 310, h: 12 },
    { x: -70, y: 400, r: 60 },
    { x: 160, y: 360, r: 60 },
    { x: 560, y: 210, w: 40, h: 45 },
    ...TOWN_STALLS.map((s) => ({ x: s.x, y: s.y, w: 155, h: 85 })),
    ...TOWN_PORTALS.filter((p) => p.w).map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
    })),
    ...TOWN_TREES.map(([x, y]) => ({ x, y, r: 25 })),
    { x: 270, y: 560, w: 110, h: 34 },
    { x: 50, y: 830, w: 110, h: 34 },
    { x: 900, y: 800, w: 130, h: 25 },
    { x: 400, y: 690, w: 40, h: 40 },
    { x: 350, y: 375, w: 110, h: 34 },
    { x: 850, y: 375, w: 110, h: 34 },
  ],
  cafe: [
    { x: 300, y: 550, r: 50 },
    { x: 850, y: 550, r: 50 },
  ],
  park: [{ x: 850, y: 585, w: 110, h: 35 }],
  arena: [{ x: 600, y: 450, w: 190, h: 65 }],
  home: [{ x: 300, y: 400, w: 160, h: 100 }],
};
for (const room of ["forest", "lake", "ruins", "yard"]) {
  WORLD_COLLIDERS[room] = [
    [150, 210],
    [1000, 190],
    [180, 640],
    [1090, 620],
    [510, 175],
  ].map(([x, y]) => ({ x, y, r: 22 }));
  WORLD_COLLIDERS[room].push(
    ...RESOURCE_NODES.filter(
      (n) => n.room === room && n.kind === "woodcutting",
    ).map((n) => ({ x: n.x, y: n.y, r: 25 })),
  );
}
WORLD_COLLIDERS.lake.push({ x: 800, y: 175, w: 640, h: 120 });
WORLD_COLLIDERS.town.push(
  ...Object.values(VENDORS).map((v) => ({
    x: v.x,
    y: v.y - 70,
    w: 155,
    h: 95,
  })),
);
export function roomBounds(roomId) {
  if (["forest", "lake", "ruins", "yard"].includes(roomId.split(":")[0]))
    return { minX: 60, maxX: 1140, minY: 120, maxY: 665 };
  return roomId.split(":")[0] === "town"
    ? TOWN_BOUNDS
    : { minX: 60, maxX: 1140, minY: 350, maxY: 665 };
}
export function walkable(roomId, x, y) {
  const bounds = roomBounds(roomId);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < bounds.minX ||
    x > bounds.maxX ||
    y < bounds.minY ||
    y > bounds.maxY
  )
    return false;
  for (const c of WORLD_COLLIDERS[roomId.split(":")[0]] ?? []) {
    if (
      c.r
        ? Math.hypot(x - c.x, y - c.y) < c.r
        : Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2
    )
      return false;
  }
  // All building interiors/props sit above the floor. Fountain island has a real boundary.
  if (
    roomId.split(":")[0] === "town" &&
    Math.hypot(x - 600, (y - 430) * 1.6) <= 94
  )
    return false;
  for (const [id, label, px, py] of roomSpec(roomId)?.props ?? []) {
    if (id !== "town" && Math.abs(x - px) < 94 && Math.abs(y - py) < 63)
      return false;
  }
  return true;
}
export function validSegment(room, x, y, tx, ty) {
  if (![x, y, tx, ty].every(Number.isFinite)) return false;
  const n = Math.ceil(Math.hypot(tx - x, ty - y) / 10);
  for (let i = 1; i <= n; i++)
    if (!walkable(room, x + ((tx - x) * i) / n, y + ((ty - y) * i) / n))
      return false;
  return true;
}
export function moveToward(p, target, speed, dt) {
  const d = Math.hypot(target.x - p.x, target.y - p.y);
  const t = Math.min(1, (speed * dt) / Math.max(d, 0.001));
  return { x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t };
}
export function companionStep(p, owner, dt, now) {
  dt = Math.min(0.25, Math.max(0, dt));
  const angle = owner.rotation ?? 0,
    forward = { x: Math.sin(angle), y: Math.cos(angle) };
  const target = {
    x: owner.x - forward.x * 95 + forward.y * 40,
    y: owner.y - forward.y * 95 - forward.x * 40,
  };
  const distance = Math.hypot(target.x - p.x, target.y - p.y),
    ownerDistance = Math.hypot(owner.x - p.x, owner.y - p.y);
  const near = owner.moving ? 8 : 18;
  const following =
    !owner.moving && ownerDistance < 95
      ? false
      : distance > (p.following ? near : near + 16);
  const desired = following
    ? Math.min(250, Math.max(owner.speed ?? 0, distance * 3))
    : 0;
  const speed =
    (p.followSpeed ?? 0) +
    Math.max(-700 * dt, Math.min(500 * dt, desired - (p.followSpeed ?? 0)));
  const next = moveToward(p, target, speed, dt);
  return {
    ...p,
    ...next,
    followSpeed: speed,
    following,
    state:
      ownerDistance > 350
        ? "RETURNING"
        : following
          ? "FOLLOWING"
          : owner.moving
            ? "FOLLOWING"
            : "RESTING",
  };
}
export function plainText(text, max = 220) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}
