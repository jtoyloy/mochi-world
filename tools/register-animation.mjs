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
const rows = {
  "human-sage": [0, 171, 330, 493, 649, 807, 948, 1095],
  "human-coral": [0, 168, 330, 494, 651, 810, 965, 1114],
  moonfox: [0, 169, 327, 485, 643, 790, 942, 1094],
  "woodland-deer": [0, 172, 327, 485, 649, 793, 947, 1096],
};
for (const [id, edges] of Object.entries(rows)) {
  const filename = `${id}-v2.png`,
    png = PNG.sync.read(readFileSync(`web/assets/isoworld/${filename}`));
  edges.push(png.height);
  const frames = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const x0 = Math.round((c * png.width) / 8),
        x1 = Math.round(((c + 1) * png.width) / 8),
        y0 = edges[r],
        y1 = edges[r + 1];
      const { minx, miny, maxx, maxy, count } = silhouette(png, x0, y0, x1, y1);
      // Fixed canvas/pivot, source pixels preserved. Align the lowest planted foot to ground.
      // Horizontal registration retains authored cell center, NOT changing silhouette center.
      const w = maxx - minx + 1,
        h = maxy - miny + 1;
      frames.push({
        frame: { x: minx, y: miny, w, h },
        sourceSize: { w: 224, h: 224 },
        spriteSourceSize: {
          x: 112 - png.width / 16 + (minx - x0),
          y: 224 * 0.88 - h,
          w,
          h,
        },
        pivot: { x: 0.5, y: 0.88 },
      });
    }
  if (id.startsWith("human")) frames[24] = frames[31]; // generated rear-left contact view correction; nearest compatible pose
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const data = {
    format: "mochi-fullbody-atlas/2",
    image: filename,
    size: [png.width, png.height],
    trimmed: true,
    frames,
    heights: {
      walk: median(frames.slice(0, 32).map((f) => f.frame.h)),
      idle: median(frames.slice(32).map((f) => f.frame.h)),
    },
    rowMap: id.startsWith("human")
      ? { walk: [0, 1, 3, 2], idle: [4, 5, 6, 7] }
      : { walk: [0, 1, 2, 3], idle: [4, 5, 6, 7] },
    mirrors:
      id === "moonfox"
        ? [false, false, true, false]
        : [false, false, false, false],
    provenance:
      "Original built-in imagegen full-body sprite art, 2026-10-06; repository character art as identity/style reference. Source-rectangle registration only; no procedural body/leg drawing.",
  };
  writeFileSync(
    `web/assets/isoworld/${id}-v2.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
  console.log(filename, png.width, png.height, data.heights);
}
// Vendor sheet has three distinct painted views per human; opposite rear view is
// an explicit mirror fallback. Keep this limitation in the artist handoff.
const image = "vendor-gesture-v2.png",
  png = PNG.sync.read(readFileSync(`web/assets/isoworld/${image}`)),
  edges = [0, 185, 348, 515, 683, 849, 1030],
  all = [];
for (let r = 0; r < 6; r++)
  for (let c = 0; c < 8; c++) {
    const x0 = Math.round((c * png.width) / 8),
      x1 = Math.round(((c + 1) * png.width) / 8);
    const {
      minx: x,
      miny: y,
      maxx: right,
      maxy: bottom,
    } = silhouette(png, x0, edges[r], x1, edges[r + 1]);
    const w = right - x + 1,
      h = bottom - y + 1;
    if (w < 1 || h < 1) throw Error("Missing vendor frame");
    all.push({
      frame: { x, y, w, h },
      sourceSize: { w: 224, h: 224 },
      spriteSourceSize: {
        x: 112 - png.width / 16 + x - x0,
        y: 224 * 0.88 - h,
        w,
        h,
      },
      pivot: { x: 0.5, y: 0.88 },
    });
  }
for (let body = 0; body < 2; body++) {
  const frames = [0, 1, 2, 2, 0, 1, 2, 2].flatMap((row) =>
    all.slice((body * 3 + row) * 8, (body * 3 + row + 1) * 8),
  );
  const height = frames.map((f) => f.frame.h).sort((a, b) => a - b)[32];
  writeFileSync(
    `web/assets/isoworld/human-${body ? "coral" : "sage"}-gesture-v2.json`,
    JSON.stringify(
      {
        format: "mochi-fullbody-atlas/2",
        image,
        size: [png.width, png.height],
        frames,
        trimmed: true,
        heights: { idle: height, walk: height },
        rowMap: { walk: [0, 1, 2, 3], idle: [4, 5, 6, 7] },
        mirrors: [false, false, true, false],
        provenance:
          "Original imagegen gesture art; mirrored rear direction fallback.",
      },
      null,
      2,
    ) + "\n",
  );
}
