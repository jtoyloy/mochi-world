// Register original painted Thornling poses without rewriting source pixels.
// Generated spacing is irregular: attack reaches cross nominal equal cells.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { ANIMATION_SETS } from "../web/js/isoworld/animation/registry.js";
import { validateActionAtlas } from "../web/js/isoworld/animation/atlas.js";
import { auditPixels } from "../web/js/isoworld/animation/pixel-audit.js";

const root = "web/assets/isoworld/";
const image = "thornling-actions-v2.png";
const metadataPath = root + "thornling-actions-v2.json";
const sourceBytes = readFileSync(root + image);
const png = PNG.sync.read(sourceBytes);
if (png.width !== 1536 || png.height !== 1024) throw Error("Unexpected Thornling source dimensions");
const rowEdges = [0, 215, 412, 615, 813, 1024];
// X boundaries pass through measured transparent gutters, not through hands.
const xEdges = [
  [0, 192, 384, 576, 768, 960, 1152, 1344, 1536],
  [0, 192, 384, 576, 768, 960, 1152, 1344, 1536],
  [0, 192, 384, 584, 784, 983, 1163, 1352, 1536],
  [0, 192, 384, 576, 768, 960, 1152, 1344, 1536],
  [0, 192, 384, 576, 755, 948, 1142, 1340, 1536],
];
const bodyCenters = [
  [104, 296, 488, 681, 875, 1064, 1255, 1445],
  [104, 296, 488, 681, 875, 1064, 1255, 1445],
  [104, 295, 490, 690, 873, 1070, 1255, 1445],
  [104, 296, 488, 681, 875, 1064, 1255, 1445],
  [104, 296, 488, 681, 875, 1064, 1255, 1445],
];
const baselines = [203, 401, 604, 805, 995];
const frames = [];
const evidence = [];
for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++) {
  const x0 = xEdges[row][col], x1 = xEdges[row][col + 1];
  const y0 = rowEdges[row], y1 = rowEdges[row + 1];
  let minX = x1, minY = y1, maxX = x0, maxY = y0, pixels = 0, edgePixels = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] < 96) continue;
    pixels++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    edgePixels += x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1;
  }
  if (pixels < 1000 || edgePixels) throw Error(`Clipped/missing Thornling pose ${row}:${col}`);
  // Retain soft painted contour, with three source pixels of padding.
  const x = minX - 3, y = minY - 3, w = maxX - minX + 7, h = maxY - minY + 7;
  if (x < x0 || y < y0 || x + w > x1 || y + h > y1) throw Error(`Insufficient source gutter ${row}:${col}`);
  frames.push({
    frame: { x, y, w, h }, sourceSize: { w: 224, h: 224 },
    spriteSourceSize: { x: Math.round(112 - bodyCenters[row][col] + x), y: Math.round(224 * .88 - baselines[row] + y), w, h },
    pivot: { x: .5, y: .88 },
  });
  evidence.push({ row, col, region: [x0, y0, x1, y1], silhouettePixels: pixels, edgePixels });
}
const states = Object.fromEntries(["idle", "walk", "attack", "hurt", "defeat"].map((state, row) => [state, Array.from({ length: 4 }, () => Array.from({ length: 8 }, (_, col) => row * 8 + col))]));
const metadata = {
  format: "mochi-action-atlas/1", image, size: [png.width, png.height], frames,
  states, requiredStates: Object.keys(states), height: 174,
  mirrors: [false, true, true, false], authoredFrameCount: 40,
  directions: "One separately painted SE sequence per state. SW/NW mirror SE; NE reuses SE. Four/eight authored directions remain missing.",
  provenance: "Original built-in imagegen, 2026-10-10; project-owned adventure-v1.png character/style reference only. Padding revision generated through built-in edit tool. PNG alpha/pixels unchanged; explicit unequal source rectangles and logical body pivots only.",
  classification: "USABLE_PROVISIONAL",
  paddedCells: true,
  sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  limitations: "Single view. Idle contains blinks; walking foot contact and loop continuity, body proportions, action anticipation/contact timing and directional/equipment acceptance remain unverified. Defeat lowers the body intentionally. Animation never controls damage or movement.",
  sourceAudit: { threshold: 96, rowEdges, xEdges, bodyCenters, baselines, poses: evidence },
};
validateActionAtlas(metadata, { ...ANIMATION_SETS[2], id: "thornling", strideDistance: 90 });
const warnings = auditPixels(png, metadata);
if (warnings.length) throw Error(`Thornling pixel warnings: ${JSON.stringify(warnings)}`);
if (process.argv.includes("--check")) {
  if (readFileSync(metadataPath, "utf8") !== JSON.stringify(metadata, null, 2) + "\n") throw Error("Thornling registration differs from reviewed source");
} else writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
console.log(`Thornling: ${frames.length} distinct authored cells; 0 alpha>=96 region-edge pixels; registration valid. ${process.argv.includes("--check") ? "Checked" : "Written"}. Single-view art remains provisional.`);
