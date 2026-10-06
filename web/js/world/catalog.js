import {
  WEAPONS,
  SPELLS,
  ACCESSORIES,
  ARMOR,
  CONSUMABLES,
  RESOURCE_NAMES,
} from "../game/adventure.js";
import { ITEMS as ORIGINAL } from "../traders/economy.js";
const categoryMap = {
  Food: "food",
  Toys: "toy",
  Hats: "clothing",
  Glasses: "clothing",
  Shirts: "clothing",
  Furniture: "furniture",
  "Trading Tools": "trading_tool",
};
const descriptions = {
  plain: "A soft little snack for an ordinary extraordinary day.",
  strawberry: "A pink berry treat with a cheerful center.",
  sushi: "A savory roll for a hungry explorer.",
  ramen: "A warm bowl after a long adventure.",
  ball: "Bounce it, chase it, make a little commotion.",
  plushie: "A soft friend for a quiet afternoon.",
  puzzle: "A pocket puzzle for curious minds.",
  cap: "A cheerful red cap for city strolls.",
  glasses: "Tiny frames, serious daydreams.",
  hoodie: "A cozy blue layer for chilly mornings.",
  plant: "A green friend to brighten your home.",
  terminal: "A starter terminal for short-term market observations.",
  scanner: "Unlocks volume observations when the provider supplies them.",
  quant: "Unlocks volatility observations for your Cadence brain.",
};
export const ITEMS = ORIGINAL.map((x) => ({
  ...x,
  slug: x.id,
  category: categoryMap[x.category],
  legacyCategory: x.category,
  rarity: ["quant"].includes(x.id)
    ? "rare"
    : ["scanner", "hoodie", "puzzle"].includes(x.id)
      ? "uncommon"
      : "common",
  description: descriptions[x.id],
  baseValue: x.price,
  stackable: !x.slot,
  tradable: x.id !== "terminal",
  imageUrl: `/assets/items/${x.id}.png`,
  features:
    x.id === "terminal"
      ? ["basic"]
      : x.id === "scanner"
        ? ["volume"]
        : x.id === "quant"
          ? ["quant"]
          : [],
  effects:
    x.category === "Food"
      ? {
          fullness: { plain: 10, strawberry: 15, sushi: 20, ramen: 25 }[x.id],
          happiness: { plain: 0, strawberry: 2, sushi: 5, ramen: 0 }[x.id],
          energy: x.id === "ramen" ? 2 : 0,
        }
      : {},
}));
ITEMS.push(
  {
    id: "scarf",
    slug: "star-scarf",
    name: "Star Scarf",
    category: "clothing",
    legacyCategory: "Accessories",
    rarity: "rare",
    description: "A scarf stitched with tiny original constellations.",
    baseValue: 180,
    price: 180,
    icon: "🧣",
    slot: "accessory",
    stackable: false,
    tradable: true,
    imageUrl: "/assets/items/star-scarf.png",
  },
  {
    id: "bed",
    slug: "cloud-bed",
    name: "Cloud Bed",
    category: "furniture",
    legacyCategory: "Furniture",
    rarity: "common",
    description: "A soft spot for restoring energy.",
    baseValue: 100,
    price: 100,
    icon: "🛏️",
    furnitureSlot: "bed",
    stackable: false,
    tradable: true,
  },
  {
    id: "rug",
    slug: "meadow-rug",
    name: "Meadow Rug",
    category: "furniture",
    legacyCategory: "Furniture",
    rarity: "common",
    description: "A little patch of color beneath your paws.",
    baseValue: 90,
    price: 90,
    icon: "🟩",
    furnitureSlot: "rug",
    stackable: false,
    tradable: true,
  },
  {
    id: "computer",
    slug: "desk-computer",
    name: "Desk Computer",
    category: "furniture",
    legacyCategory: "Furniture",
    rarity: "uncommon",
    description: "A cozy desk for Mochi’s paper-trading job.",
    baseValue: 160,
    price: 160,
    icon: "🖥️",
    furnitureSlot: "computer",
    stackable: false,
    tradable: true,
  },
  {
    id: "moon-stamp",
    slug: "moon-stamp",
    name: "Moonlit City Stamp",
    category: "collectible",
    legacyCategory: "Collectibles",
    rarity: "rare",
    description: "A keepsake from the quiet side of Mochi City.",
    baseValue: 125,
    price: 125,
    icon: "🌙",
    stackable: true,
    tradable: true,
  },
  {
    id: "prism-pin",
    slug: "prism-pin",
    name: "Prism Pin",
    category: "collectible",
    legacyCategory: "Collectibles",
    rarity: "epic",
    description:
      "An iridescent keepsake. Rare Finds stocks it only on some restocks.",
    baseValue: 350,
    price: 350,
    icon: "💠",
    stackable: true,
    tradable: true,
  },
);
export const SHOPS = [
  {
    id: "foods",
    slug: "mochi-foods",
    name: "Mochi Foods",
    category: "food",
    icon: "🍡",
    keeper: "Mina",
    description: "Fresh treats and warm bowls, served with a smile.",
    restockIntervalMinutes: 10,
    color: "berry",
  },
  {
    id: "toys",
    slug: "toy-box",
    name: "Toy Box",
    category: "toy",
    icon: "🧸",
    keeper: "Tumble",
    description: "Something to chase. Something to solve. Something to hug.",
    restockIntervalMinutes: 15,
    color: "sky",
  },
  {
    id: "threads",
    slug: "threads-and-things",
    name: "Threads & Things",
    category: "clothing",
    icon: "🧵",
    keeper: "Loom",
    description: "Small outfits for big personalities.",
    restockIntervalMinutes: 20,
    color: "lavender",
  },
  {
    id: "home",
    slug: "home-goods",
    name: "Home Goods",
    category: "furniture",
    icon: "🪴",
    keeper: "Fern",
    description: "Turn a little room into a place that feels like yours.",
    restockIntervalMinutes: 20,
    color: "mint",
  },
  {
    id: "tech",
    slug: "trader-tech",
    name: "Trader Tech",
    category: "trading_tool",
    icon: "📡",
    keeper: "Pixel",
    description: "Curiosity is a tool. Give your brain a new way to observe.",
    restockIntervalMinutes: 30,
    color: "peach",
  },
  {
    id: "rare",
    slug: "rare-finds",
    name: "Rare Finds",
    category: "collectible",
    icon: "🔮",
    keeper: "Juniper",
    description: "Limited keepsakes for patient collectors.",
    restockIntervalMinutes: 30,
    color: "violet",
  },
];
export const LOCATIONS = [
  {
    id: "market",
    name: "Market Row",
    path: "/explore/market",
    icon: "🏘️",
    description: "Six friendly shops. One more thing for your collection.",
    color: "berry",
  },
  {
    id: "arcade",
    name: "Arcade",
    path: "/explore/arcade",
    icon: "🕹️",
    description: "A quick game, a berry basket, a little prize.",
    color: "lavender",
  },
  {
    id: "park",
    name: "Mochi Park",
    path: "/explore/park",
    icon: "🌳",
    description: "Meet the city’s persistent little personalities.",
    color: "mint",
  },
  {
    id: "trading",
    name: "Trading Floor",
    path: "/explore/trading",
    icon: "🏛️",
    description: "Where curious brains try their paper-trading job.",
    color: "sky",
  },
  {
    id: "arena",
    name: "Arena",
    path: "/explore/arena",
    icon: "🏆",
    description: "Daily paper cups and a place on the podium.",
    color: "peach",
  },
  {
    id: "bank",
    name: "Bank",
    path: "/explore/bank",
    icon: "🏦",
    description: "Your Coins and every recorded transaction.",
    color: "butter",
  },
  {
    id: "research",
    name: "Research Lab",
    path: "/explore/research",
    icon: "🔬",
    description: "Words, memory, and the real brain behind your Mochi.",
    color: "violet",
  },
];
export const DAILY_ACTIVITIES = [
  {
    id: "gift",
    name: "Daily Gift",
    icon: "🎁",
    description: "50–150 Coins, and sometimes a collectible.",
  },
  {
    id: "market",
    name: "Daily Market Visit",
    icon: "🛍️",
    description: "Visit Market Row for a 20-Coin hello.",
  },
  {
    id: "pet",
    name: "Daily Pet Check-In",
    icon: "♥",
    description: "Care for your Mochi. Earn 25 Coins.",
  },
  {
    id: "trading",
    name: "Daily Trading Challenge",
    icon: "📓",
    description: "Review today’s paper-trading observations. Earn 15 Coins.",
  },
];
export const TROPHIES = [
  {
    id: "arcade-master",
    name: "Berry Basket Champion",
    icon: "🏅",
    description: "Catch 15 berries in one verified arcade round.",
  },
  {
    id: "gourmet",
    name: "Gourmet Mochi",
    icon: "🍜",
    description: "Feed your Mochi ten times.",
  },
  {
    id: "collector",
    name: "City Collector",
    icon: "📚",
    description: "Discover ten different items.",
  },
  {
    id: "sol-cup-gold",
    name: "Daily Paper Cup Gold",
    icon: "🏆",
    description: "Finish first in a completed daily paper cup.",
  },
];

export const ACHIEVEMENTS = [
  { id: "first-care", name: "A little hello", reward: 10 },
  { id: "gourmet", name: "Ten tasty moments", reward: 30 },
  { id: "collector", name: "Ten discoveries", reward: 50 },
  { id: "first-player-buy", name: "Support a neighbor", reward: 20 },
  { id: "explorer", name: "Five city corners", reward: 30 },
  { id: "arcade-ten", name: "Arcade regular", reward: 30 },
  { id: "first-paper-trade", name: "A little paper experiment", reward: 20 },
];

// One catalog: adventure ownership uses the same inventory, escrow and collection tables.
const title = (id) =>
  id
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
for (const [category, definitions, icon] of [
  ["weapon", WEAPONS, "⚔"],
  ["armor", ARMOR, "◈"],
  ["spell", SPELLS, "✧"],
  ["combat_accessory", ACCESSORIES, "◇"],
  ["consumable", CONSUMABLES, "⚗"],
]) {
  for (const [id, definition] of Object.entries(definitions))
    ITEMS.push({
      id,
      slug: id,
      name: definition.name ?? title(id),
      category,
      group: category === "consumable" ? "consumables" : "combat",
      rarity: "common",
      description: "Adventure equipment. Effects are validated by the server.",
      baseValue: 40,
      price: 40,
      icon,
      stackable: category === "consumable",
      tradable: category !== "spell",
      ...definition,
    });
}
for (const [id, name] of Object.entries(RESOURCE_NAMES))
  ITEMS.push({
    id,
    slug: id,
    name,
    category: "resource",
    group: "resources",
    rarity: ["moonfish", "golden-koi", "ancient-bark"].includes(id)
      ? "rare"
      : "common",
    description:
      "Gathered in the world. Resource rewards depend on funded vendor availability.",
    baseValue: 0,
    price: 0,
    icon: id.includes("wood") || id.includes("bark") ? "♧" : "◈",
    stackable: true,
    tradable: false,
  });
for (const id of ["fishing-rod", "basic-axe"])
  ITEMS.push({
    id,
    slug: id,
    name: title(id),
    category: "gathering_tool",
    group: "resources",
    rarity: "common",
    description: "Starter gathering tool.",
    baseValue: 0,
    price: 0,
    icon: "⚒",
    stackable: false,
    tradable: false,
  });
for (const [id, name, category, keeper] of [
  ["blacksmith", "Blacksmith", "weapon", "Bram"],
  ["mage", "Mage Atelier", "spell", "Iris"],
  ["apothecary", "Apothecary", "consumable", "Sage"],
  ["charms", "Battle Charms", "combat_accessory", "Opal"],
])
  SHOPS.push({
    id,
    slug: id,
    name,
    category,
    icon: "✧",
    keeper,
    description: "Gear for adventures alongside your Mochi.",
    restockIntervalMinutes: 10,
    color: "mint",
  });
for (const item of ITEMS)
  item.group ??=
    {
      clothing: "cosmetics",
      furniture: "home",
      trading_tool: "trading_tools",
      food: "consumables",
      toy: "life",
      collectible: "cosmetics",
    }[item.category] ?? "life";
