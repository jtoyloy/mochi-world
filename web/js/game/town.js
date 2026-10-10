import { COMBAT_VENDORS, VENDORS } from "./adventure.js";
import { ISO_TOWN_BOUNDS } from "../isoworld/layout.js";
// Authored residents are scenery, never accounts, Mochi brains, or lesson answers.
export const TOWN_BOUNDS = ISO_TOWN_BOUNDS;
export const TOWN_RESIDENTS = [
  ...Object.entries(VENDORS).map(([id, v]) => ({
    id: id === "fish" ? "neri" : "alder",
    name: id === "fish" ? "Neri" : "Alder",
    role: v.name.split(" · ")[1],
    x: v.x,
    y: v.y,
    color: "#8faaa2",
    vendor: id,
    line: "Bring your gathered resources. Sell for Coins to buy adventure supplies, or explore optional token rewards.",
    ambient: "Keep a few supplies for your next adventure.",
  })),
  ...COMBAT_VENDORS.map((v) => ({
    id: v.id,
    name: v.name,
    role: v.title,
    x: v.x,
    y: v.y,
    color: "#a39485",
    shop: v.id,
    line: "Gear for your next adventure, bought with earned Coins. Your starter equipment is free in Adventure.",
    ambient: "Travel with your Mochi. Come home together.",
  })),
  {
    id: "mina",
    name: "Mina",
    role: "Food keeper",
    x: 100,
    y: 300,
    color: "#cb8f91",
    shop: "foods",
    line: "Warm bowls for little explorers. Browse the food counter?",
    ambient: "The kettle is singing again.",
  },
  {
    id: "tumble",
    name: "Tumble",
    role: "Toy keeper",
    x: 1150,
    y: 1120,
    color: "#91b9c1",
    shop: "toys",
    line: "A ball, a puzzle, or a new friend to hug?",
    ambient: "One bounce. Two bounces. Oops!",
  },
  {
    id: "loom",
    name: "Loom",
    role: "Clothing keeper",
    x: 1700,
    y: 1050,
    color: "#b29bc8",
    shop: "threads",
    line: "Every little outfit has a story. Have a look.",
    ambient: "A stitch of coral looks lovely.",
  },
  {
    id: "fern",
    name: "Fern",
    role: "Furniture keeper",
    x: 1600,
    y: 390,
    color: "#8daa8a",
    shop: "home",
    line: "A cozy corner starts with something you love.",
    ambient: "This fern likes the afternoon sun.",
  },
  {
    id: "pixel",
    name: "Pixel",
    role: "Trader Tech keeper",
    x: 980,
    y: 250,
    color: "#74a4ae",
    shop: "tech",
    line: "Tools help you observe. Trading here stays on paper.",
    ambient: "Curiosity is my favorite tool.",
  },
  {
    id: "juniper",
    name: "Juniper",
    role: "Rare Finds keeper",
    x: 1550,
    y: 1450,
    color: "#b29aac",
    shop: "rare",
    schedule: { periodSeconds: 600, visitingSeconds: 420 },
    line: "Patient collectors find little treasures. Browse today’s stock?",
    ambient: "This little keepsake caught the light.",
  },
  {
    id: "pip",
    name: "Pip",
    role: "Town guide",
    x: 360,
    y: 830,
    color: "#e1af76",
    line: "Welcome! Gear is west, clothes east, fish and wood buyers south, and the Trading Hall north. Open Adventure for your free sword, potions, rod and axe. Try the Training Yard, then explore Forest or Lake with your Mochi.",
    ambient: "Make yourself at home.",
  },
  {
    id: "bea",
    name: "Bea",
    role: "Street performer",
    x: 740,
    y: 630,
    color: "#b88979",
    line: "Stay for a little tune. Dancing is free!",
    ambient: "♪ A little tune for a little town ♪",
    state: "perform",
  },
  {
    id: "otto",
    name: "Otto",
    role: "Courier",
    x: 280,
    y: 660,
    color: "#809aa5",
    line: "Letters, parcels, and a very important lunch.",
    ambient: "Special delivery!",
    route: [
      [280, 660],
      [360, 650],
      [360, 760],
      [280, 760],
    ],
    state: "walk",
  },
  {
    id: "luna",
    name: "Luna",
    role: "Visitor",
    x: 1000,
    y: 540,
    color: "#ae9fcb",
    line: "I’m looking for the best fountain photograph.",
    ambient: "The water looks like mint glass.",
    route: [
      [1000, 540],
      [1140, 600],
      [1140, 800],
      [1010, 730],
    ],
    state: "walk",
  },
  {
    id: "moss",
    name: "Moss",
    role: "Garden regular",
    x: 20,
    y: 830,
    color: "#8caa94",
    line: "There is no hurry on this bench.",
    ambient: "Listen. A bird in the hedges.",
    state: "sit",
  },
  {
    id: "wren",
    name: "Wren",
    role: "Café regular",
    x: 245,
    y: 560,
    color: "#c3a082",
    line: "The café smells like toasted rice.",
    ambient: "Just one more sip.",
    state: "sit",
  },
];
export function residentPosition(n, now = Date.now()) {
  if (!n.route) return { x: n.x, y: n.y, state: n.state ?? "idle" };
  const seconds = now / 1000 + n.id.length * 3,
    phase = seconds % 40,
    index = Math.floor(phase / 10),
    a = n.route[index],
    b = n.route[(index + 1) % n.route.length],
    t = Math.min(1, (phase % 10) / 7);
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    state: t < 1 ? "walk" : "idle",
    rotation: Math.atan2(b[0] - a[0], b[1] - a[1]),
  };
}
export function nearbyResident(id, p, now = Date.now()) {
  const n = TOWN_RESIDENTS.find((v) => v.id === id);
  if (!n || !residentAvailable(n, now)) return null;
  const q = residentPosition(n, now);
  return Math.hypot(p.x - q.x, p.y - q.y) <= 120 ? n : null;
}

export const TOWN_INTERACTIONS = [
  ...Object.entries(VENDORS).map(([id, v]) => ({
    id: "vendor:" + id,
    x: v.x,
    y: v.y,
    line: "Sell your gathered resources for Coins. No wallet needed.",
  })),
  {
    id: "sit:west",
    x: 350,
    y: 415,
    seat: { x: 350, y: 375, height: 0.54 },
    line: "A quiet moment by the fountain.",
  },
  {
    id: "sit:east",
    x: 850,
    y: 415,
    seat: { x: 850, y: 375, height: 0.54 },
    line: "A quiet moment by the fountain.",
  },
  {
    id: "sit:cafe",
    x: 270,
    y: 600,
    seat: { x: 300, y: 560, height: 0.54 },
    line: "A little break beside the café.",
  },
  {
    id: "sit:garden",
    x: 50,
    y: 865,
    seat: { x: 80, y: 830, height: 0.565 },
    line: "Listen to the birds in the garden.",
  },
  {
    id: "noticeboard",
    x: 900,
    y: 850,
    line: "Daily paper cups are listed in the Arena. Explore the map to visit.",
  },
  {
    id: "mailbox",
    x: 400,
    y: 750,
    line: "The courier collects the town post. Friends and gifts are available in the Friends menu.",
  },
  {
    id: "fountain",
    x: 600,
    y: 530,
    line: "A little wish, a little splash. The Wishing Lantern asks for no coins.",
  },
];

export function residentAvailable(n, now = Date.now()) {
  return (
    !n.schedule ||
    (now / 1000) % n.schedule.periodSeconds < n.schedule.visitingSeconds
  );
}

// Scene authoring records keep storefront identity and physical placement together.
export const TOWN_STALLS = [
  ...COMBAT_VENDORS.map((v) => ({
    id: v.id,
    title: v.title,
    x: v.x,
    y: v.y - 105,
    goods: "tech",
  })),
  {
    id: "mina",
    x: 100,
    y: 195,
    title: "MINA'S WARM BOWLS",
    color: "#c78b76",
    goods: "food",
  },
  {
    id: "tumble",
    x: 1150,
    y: 1015,
    title: "TUMBLE'S TOY BOX",
    color: "#7ba7ad",
    goods: "toy",
  },
  {
    id: "loom",
    x: 1700,
    y: 945,
    title: "LOOM'S THREADS",
    color: "#a18aaa",
    goods: "threads",
  },
  {
    id: "fern",
    x: 1600,
    y: 285,
    title: "FERN'S HOME GOODS",
    color: "#8b9e7c",
    goods: "plant",
  },
  {
    id: "juniper",
    x: 1550,
    y: 1345,
    title: "JUNIPER'S RARE FINDS",
    color: "#bc949c",
    goods: "rare",
  },
  {
    id: "pixel",
    x: 980,
    y: 145,
    title: "PIXEL'S TRADER TECH",
    color: "#648e98",
    goods: "tech",
  },
];
