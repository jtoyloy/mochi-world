// Shared definitions only. The server owns all outcomes and quantities.
export const BATTLE_ACTIONS = [
  "ATTACK",
  "DEFEND_OWNER",
  "DEFEND_SELF",
  "USE_SPECIAL",
  "MOVE_CLOSER",
  "MOVE_AWAY",
  "WAIT",
];
export const WEAPONS = {
  "basic-sword": {
    type: "sword",
    attackPower: 9,
    attackSpeed: 1,
    range: 92,
    requiredLevel: 1,
    abilities: ["cleave"],
  },
  "reed-staff": {
    type: "staff",
    attackPower: 6,
    attackSpeed: 0.85,
    range: 150,
    requiredLevel: 1,
    abilities: ["arcane-pulse"],
    modifiers: { magic: 4 },
  },
  "ash-bow": {
    type: "bow",
    attackPower: 8,
    attackSpeed: 0.8,
    range: 260,
    requiredLevel: 2,
    abilities: ["aimed-shot"],
  },
  "thorn-dagger": {
    type: "dagger",
    attackPower: 6,
    attackSpeed: 1.6,
    range: 70,
    requiredLevel: 2,
    abilities: ["quick-cut"],
  },
};
export const SPELLS = {
  "fire-bolt": {
    name: "Fire Bolt",
    manaCost: 10,
    cooldownMs: 3500,
    type: "damage",
    power: 16,
    range: 280,
    element: "fire",
  },
  "ice-shard": {
    name: "Ice Shard",
    manaCost: 12,
    cooldownMs: 5000,
    type: "debuff",
    power: 12,
    range: 250,
    durationMs: 3000,
  },
  heal: {
    name: "Heal",
    manaCost: 18,
    cooldownMs: 9000,
    type: "heal",
    power: 30,
    range: 0,
  },
  shield: {
    name: "Shield",
    manaCost: 14,
    cooldownMs: 11000,
    type: "buff",
    power: 8,
    durationMs: 5000,
    range: 0,
  },
  lightning: {
    name: "Lightning",
    manaCost: 22,
    cooldownMs: 8000,
    type: "damage",
    power: 26,
    range: 300,
  },
};
export const ACCESSORIES = {
  "iron-ring": { defense: 3 },
  "ember-charm": { fireMultiplier: 0.05 },
  "bond-necklace": { petMultiplier: 0.05 },
  "healer-pendant": { healingMultiplier: 0.1 },
};
export const CONSUMABLES = {
  "small-potion": { type: "heal", amount: 35 },
  "large-potion": { type: "heal", amount: 70 },
  "mana-potion": { type: "mana", amount: 30 },
  antidote: { type: "cleanse", amount: 0 },
  "combat-food": { type: "buff", amount: 3, durationMs: 30000 },
};
export const RESOURCE_VALUES = {
  "common-minnow": 1000,
  "silver-carp": 2500,
  moonfish: 4500,
  "golden-koi": 7000,
  softwood: 1000,
  hardwood: 2200,
  "ancient-bark": 4000,
}; // DEVELOPMENT raw units only; production uses configured prices.
export const RESOURCE_NAMES = {
  "common-minnow": "Common Minnow",
  "silver-carp": "Silver Carp",
  moonfish: "Moonfish",
  "golden-koi": "Golden Koi",
  softwood: "Softwood",
  hardwood: "Hardwood",
  "ancient-bark": "Ancient Bark",
  "slime-resin": "Slime Resin",
  "boar-hide": "Boar Hide",
  "thorn-fiber": "Thorn Fiber",
  "river-pearl": "River Pearl",
  "guardian-stone": "Guardian Stone",
};
export const MOB_DEFINITIONS = {
  slime: {
    name: "Dewdrop Slime",
    level: 1,
    health: 45,
    damage: 5,
    speed: 65,
    range: 68,
    xp: 18,
    behavior: "passive",
    color: 0x90c8a0,
    drops: [["slime-resin", 1, 1, 2]],
  },
  boar: {
    name: "Bramble Boar",
    level: 3,
    health: 85,
    damage: 9,
    speed: 95,
    range: 75,
    xp: 35,
    behavior: "territorial",
    color: 0xa98264,
    drops: [["boar-hide", 1, 1, 2]],
  },
  thornling: {
    name: "Thornling",
    level: 5,
    health: 120,
    damage: 12,
    speed: 70,
    range: 100,
    xp: 50,
    behavior: "aggressive",
    color: 0x537c60,
    drops: [["thorn-fiber", 1, 1, 3]],
  },
  riverbeast: {
    name: "Rippleback",
    level: 3,
    health: 80,
    damage: 8,
    speed: 80,
    range: 90,
    xp: 32,
    behavior: "territorial",
    color: 0x659daf,
    drops: [
      ["river-pearl", 0.3, 1, 1],
      ["slime-resin", 1, 1, 2],
    ],
  },
  bandit: {
    name: "Mossmask Scavenger",
    level: 6,
    health: 145,
    damage: 13,
    speed: 105,
    range: 100,
    xp: 65,
    behavior: "aggressive",
    color: 0x9b7966,
    drops: [
      ["thorn-fiber", 1, 2, 4],
      ["small-potion", 0.25, 1, 1],
    ],
  },
  guardian: {
    name: "Lantern Guardian",
    level: 10,
    health: 250,
    damage: 18,
    speed: 55,
    range: 115,
    xp: 110,
    behavior: "territorial",
    boss: true,
    color: 0xa594bd,
    drops: [["guardian-stone", 1, 1, 1]],
  },
  dummy: {
    name: "Practice Dummy",
    level: 1,
    health: 100,
    damage: 0,
    speed: 0,
    range: 0,
    xp: 0,
    behavior: "passive",
    color: 0xbda27a,
    drops: [],
  },
};
export const SPAWNS = [
  {
    id: "forest-meadow",
    room: "forest",
    mobTypes: ["slime", "boar", "thornling"],
    maxAlive: 4,
    respawnMinSeconds: 15,
    respawnMaxSeconds: 25,
    cells: [
      [380, 280],
      [720, 320],
      [900, 550],
      [450, 550],
    ],
  },
  {
    id: "lake-bank",
    room: "lake",
    mobTypes: ["slime", "riverbeast"],
    maxAlive: 3,
    respawnMinSeconds: 20,
    respawnMaxSeconds: 35,
    cells: [
      [410, 300],
      [770, 400],
      [950, 580],
    ],
  },
  {
    id: "ruins-gate",
    room: "ruins",
    mobTypes: ["bandit", "guardian"],
    maxAlive: 3,
    respawnMinSeconds: 30,
    respawnMaxSeconds: 50,
    cells: [
      [380, 280],
      [700, 400],
      [940, 570],
    ],
  },
  {
    id: "yard-dummy",
    room: "yard",
    mobTypes: ["dummy"],
    maxAlive: 1,
    respawnMinSeconds: 5,
    respawnMaxSeconds: 5,
    cells: [[600, 350]],
  },
];
export const RESOURCE_NODES = [
  {
    id: "forest-soft",
    room: "forest",
    name: "Softwood Grove",
    kind: "woodcutting",
    x: 280,
    y: 430,
    durationMs: 3500,
    cooldownMs: 15000,
    level: 1,
    table: [["softwood", 1, 12]],
  },
  {
    id: "forest-hard",
    room: "forest",
    name: "Old Ash",
    kind: "woodcutting",
    x: 800,
    y: 580,
    durationMs: 4500,
    cooldownMs: 25000,
    level: 3,
    table: [["hardwood", 1, 22]],
  },
  {
    id: "ruins-bark",
    room: "ruins",
    name: "Ancient Root",
    kind: "woodcutting",
    x: 300,
    y: 560,
    durationMs: 6000,
    cooldownMs: 35000,
    level: 5,
    table: [["ancient-bark", 1, 32]],
  },
  {
    id: "lake-dock",
    room: "lake",
    name: "Moonwater Dock",
    kind: "fishing",
    x: 620,
    y: 240,
    durationMs: 4500,
    cooldownMs: 1500,
    level: 1,
    table: [
      ["common-minnow", 0.72, 12],
      ["silver-carp", 0.24, 20],
      ["moonfish", 0.035, 30],
      ["golden-koi", 0.005, 45],
    ],
  },
  {
    id: "lake-deep",
    room: "lake",
    name: "Moonlit Reeds",
    kind: "fishing",
    x: 920,
    y: 260,
    durationMs: 5500,
    cooldownMs: 2000,
    level: 4,
    table: [
      ["common-minnow", 0.55, 12],
      ["silver-carp", 0.38, 20],
      ["moonfish", 0.06, 30],
      ["golden-koi", 0.01, 45],
    ],
  },
];
export const VENDORS = {
  fish: {
    name: "Neri · Fish Buyer",
    x: 300,
    y: 1300,
    kind: "fishing",
    items: ["common-minnow", "silver-carp", "moonfish", "golden-koi"],
  },
  wood: {
    name: "Alder · Lumber Buyer",
    x: 600,
    y: 1450,
    kind: "woodcutting",
    items: ["softwood", "hardwood", "ancient-bark"],
  },
};
export const QUESTS = [
  {
    id: "first-steps",
    name: "A walk beyond the gates",
    goals: { kills: 1, woodcutting: 1 },
    reward: {
      "small-potion": 2,
      "reed-staff": 1,
      "iron-ring": 1,
      "ice-shard": 1,
    },
  },
  {
    id: "lake-day",
    name: "A day at Moonwater",
    goals: { fishing: 5, tradingHall: 1 },
    reward: { "mana-potion": 2, "ash-bow": 1 },
  },
];
export const levelFor = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 60));
export function combatStats(equipment = {}, level = 1) {
  const s = {
    maxHp: 100 + 5 * (level - 1),
    maxMp: 60,
    attack: 3,
    defense: 2,
    magic: 4,
    fireMultiplier: 1,
    petMultiplier: 1,
    healingMultiplier: 1,
  };
  for (const id of Object.values(equipment)) {
    const mods =
      ACCESSORIES[id] ?? WEAPONS[id]?.modifiers ?? ARMOR[id]?.modifiers ?? {};
    for (const [key, n] of Object.entries(mods)) s[key] = (s[key] ?? 0) + n;
  }
  return s;
}
export const damage = (power, defense = 0, multiplier = 1) =>
  Math.max(
    1,
    Math.round(Math.max(0, power) * multiplier - Math.max(0, defense)),
  );
export const clampHealth = (value, max) => Math.max(0, Math.min(max, value));
export const battleReward = (e) =>
  Math.max(
    -1,
    Math.min(
      1,
      (e.damageDealt ?? 0) / 45 +
        (e.protection ?? 0) / 90 +
        (e.victory ? 0.25 : 0) -
        (e.ownerDamage ?? 0) / 60 -
        (e.petDamage ?? 0) / 65 -
        (e.wasted ? 0.08 : 0) -
        (e.ownerDefeated ? 0.6 : 0) -
        (e.petExhausted ? 0.25 : 0) +
        (e.survived ? 0.025 : 0),
    ),
  );
export function battleObservation(s, p, m, pet) {
  return [
    s.hp / s.stats.maxHp,
    s.petHp / 80,
    m.hp / m.maxHp,
    Math.min(1, Math.hypot(pet.x - m.x, pet.y - m.y) / 400),
    Math.min(1, s.enemyCount / 6),
    Number(s.ownerDamage > 0),
    Number(s.petDamage > 0),
    Math.min(1, m.damage / 25),
    Math.min(1, Object.keys(MOB_DEFINITIONS).indexOf(m.type) / 6),
    Math.min(1, (s.nearbyAllies ?? 0) / 4),
    Math.min(1, Math.max(0, ((s.petSpecialAt ?? 0) - s.now) / 8000)),
    Math.min(1, s.ownerDamage / 40),
    Math.min(1, s.damageDealt / 40),
    Number(s.petHp <= 0),
    Number(m.hp > 0),
    1,
  ].map((x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)));
}
export const COMBAT_VENDORS = [
  {
    id: "blacksmith",
    name: "Bram",
    title: "Blacksmith",
    x: -400,
    y: -430,
    goods: "weapon",
    symbol: "⚔",
  },
  {
    id: "mage",
    name: "Iris",
    title: "Mage Atelier",
    x: 60,
    y: -430,
    goods: "spell",
    symbol: "✧",
  },
  {
    id: "apothecary",
    name: "Sage",
    title: "Apothecary",
    x: -450,
    y: 250,
    goods: "potion",
    symbol: "⚗",
  },
  {
    id: "charms",
    name: "Opal",
    title: "Battle Charms",
    x: -300,
    y: 750,
    goods: "charm",
    symbol: "◇",
  },
];
export const ARMOR = {
  "travel-cap": { slot: "head", modifiers: { defense: 2 } },
  "padded-coat": { slot: "body", modifiers: { defense: 4 } },
};
export const MOCHI_ABILITIES = {
  ember: { name: "Fire Bite", power: 16, range: 170 },
  moon: { name: "Shadow Dash", power: 14, range: 190 },
  forest: { name: "Vine Guard", power: 10, range: 180, guardMs: 1800 },
};
