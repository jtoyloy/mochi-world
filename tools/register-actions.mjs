// Build source-rectangle/trim registration metadata; PNG pixels are never altered.
// Artist row boundaries are explicit because generated sheets are not perfectly spaced.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
function silhouette(png, x0, y0, x1, y1) {
  const w = x1 - x0,
    h = y1 - y0,
    seen = new Uint8Array(w * h);
  let best = null;
  for (let iy = 0; iy < h; iy++)
    for (let ix = 0; ix < w; ix++) {
      const at = iy * w + ix;
      if (seen[at] || png.data[((iy + y0) * png.width + ix + x0) * 4 + 3] < 96)
        continue;
      const queue = [at];
      seen[at] = 1;
      let minx = ix,
        maxx = ix,
        miny = iy,
        maxy = iy;
      for (let qi = 0; qi < queue.length; qi++) {
        const q = queue[qi],
          x = q % w,
          y = Math.floor(q / w);
        minx = Math.min(minx, x);
        maxx = Math.max(maxx, x);
        miny = Math.min(miny, y);
        maxy = Math.max(maxy, y);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            n = ny * w + nx;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= w ||
            ny >= h ||
            seen[n] ||
            png.data[((ny + y0) * png.width + nx + x0) * 4 + 3] < 96
          )
            continue;
          seen[n] = 1;
          queue.push(n);
        }
      }
      if (!best || queue.length > best.count)
        best = {
          minx: x0 + Math.max(0, minx - 1),
          maxx: x0 + Math.min(w - 1, maxx + 1),
          miny: y0 + Math.max(0, miny - 1),
          maxy: y0 + Math.min(h - 1, maxy + 1),
          count: queue.length,
        };
    }
  if (!best || best.count < 100) throw Error("Missing coherent silhouette");
  return best;
}

import { ANIMATION_SETS } from "../web/js/isoworld/animation/registry.js";
const root = "web/assets/isoworld/";
function register(image, set, edges, stateRows, suffix = "actions") {
  const png = PNG.sync.read(readFileSync(root + image)),
    frames = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const x0 = Math.round((c * png.width) / 8),
        x1 = Math.round(((c + 1) * png.width) / 8);
      let b;
      try {
        b = silhouette(png, x0, edges[r], x1, edges[r + 1]);
      } catch (error) {
        if (r === 4 && c === 5 && image.startsWith("actions-")) {
          frames.push(frames[r * 8 + 3]);
          continue;
        }
        throw error;
      }
      const w = b.maxx - b.minx + 1,
        h = b.maxy - b.miny + 1;
      frames.push({
        frame: { x: b.minx, y: b.miny, w, h },
        sourceSize: { w: 224, h: 224 },
        spriteSourceSize: {
          x: 112 - png.width / 16 + b.minx - x0,
          y: 224 * 0.88 - h,
          w,
          h,
        },
        pivot: set.footAnchor,
      });
    }
  const sequence = (row, cols = Array.from({ length: 8 }, (_, i) => i)) =>
    cols.map((c) => row * 8 + c);
  const states = Object.fromEntries(
    Object.entries(stateRows).map(([name, value]) => {
      const f = Array.isArray(value)
        ? sequence(value[0], value[1])
        : sequence(value);
      return [name, set.directions.map(() => f)];
    }),
  );
  const used = Object.values(states).flat(2),
    heights = used.map((i) => frames[i].frame.h).sort((a, b) => a - b);
  const m = {
    format: "mochi-action-atlas/1",
    image,
    size: [png.width, png.height],
    frames,
    states,
    requiredStates: Object.keys(stateRows),
    height: heights[Math.floor(heights.length / 2)],
    mirrors: [false, true, true, false],
    directions:
      "Provisional SE painted view; SW/NW mirrored SE, NE uses SE. Distinct rear/eight-view art still required.",
    provenance:
      "Original built-in imagegen; project reference only. Original PNG pixels immutable. Source registration grounds each silhouette; reused columns explicitly recorded in states.",
  };
  writeFileSync(
    root + set.id + "-" + suffix + "-v1.json",
    JSON.stringify(m, null, 2) + "\n",
  );
  console.log(set.id, suffix, image, m.height);
}
const actionEdges = [0, 192, 351, 510, 663, 812, 965, 1092, 1254];
const humanActions = {
  sword: 0,
  staff: 1,
  bow: 2,
  dagger: 3,
  "fish-cast": [4, [0, 1, 2, 3, 3, 6, 7, 0]],
  "fish-wait": [4, [3, 3, 3, 3, 3, 3, 3, 3]],
  "fish-catch": [4, [6, 6, 7, 7, 7, 7, 0, 0]],
  chop: 5,
  "chop-recover": [5, [4, 5, 5, 6, 6, 7, 7, 0]],
};
// The generated fishing rod crosses one empty cell: row4 columns4/5 are excluded.
// Do not silently register blank/clipped art as a completed frame.
register("actions-sage-v1.png", ANIMATION_SETS[0], actionEdges, humanActions);
register("actions-sage-v1.png", ANIMATION_SETS[2], actionEdges, {
  attack: 6,
  special: 6,
});
register("actions-sage-v1.png", ANIMATION_SETS[3], actionEdges, {
  attack: 7,
  special: 7,
});
const reactionEdges = [0, 196, 377, 544, 728, 866, 990, 1133, 1254];
register(
  "reactions-sage-v1.png",
  ANIMATION_SETS[0],
  reactionEdges,
  { hurt: 0, defend: 1, defeat: 2, item: 3, interact: 1 },
  "reactions",
);
register(
  "reactions-sage-v1.png",
  ANIMATION_SETS[2],
  reactionEdges,
  { hurt: 4, defend: 5, defeat: [4, [0, 1, 2, 3, 3, 3, 3, 3]] },
  "reactions",
);
register(
  "reactions-sage-v1.png",
  ANIMATION_SETS[3],
  reactionEdges,
  { hurt: 7, defend: 6, defeat: 7 },
  "reactions",
);
const mobEdges = [0, 174, 335, 482, 588, 730, 865, 999, 1122];
for (const [id, r] of [
  ["slime", 0],
  ["boar", 4],
])
  register("mob-actions-v1.png", { ...ANIMATION_SETS[2], id }, mobEdges, {
    idle: r,
    walk: r + 1,
    attack: r + 2,
    hurt: [r + 3, [0, 1, 2, 2, 2, 2, 0, 0]],
    defeat: [r + 3, [2, 3, 4, 5, 6, 7, 7, 7]],
  });
// Identity-preserving variants have their own original PNG and measured row edges.
if (process.argv.includes("--coral")) {
  register(
    "actions-coral-v1.png",
    ANIMATION_SETS[1],
    actionEdges,
    humanActions,
  );
  register(
    "reactions-coral-v1.png",
    ANIMATION_SETS[1],
    reactionEdges,
    { hurt: 0, defend: 1, defeat: 2, item: 3, interact: 1 },
    "reactions",
  );
}
