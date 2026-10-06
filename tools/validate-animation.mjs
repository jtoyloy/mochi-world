import { readFileSync, readdirSync } from "node:fs";
import { PNG } from "pngjs";
import { ANIMATION_SETS } from "../web/js/isoworld/animation/registry.js";
import {
  validateAtlas,
  validateActionAtlas,
} from "../web/js/isoworld/animation/atlas.js";
import { auditPixels } from "../web/js/isoworld/animation/pixel-audit.js";
let bytes = 0;
for (const set of ANIMATION_SETS) {
  const root = "web/assets/isoworld/",
    m = JSON.parse(readFileSync(root + set.texture.replace(".png", ".json"))),
    p = PNG.sync.read(readFileSync(root + set.texture));
  validateAtlas(m, set);
  if (p.width !== m.size[0] || p.height !== m.size[1])
    throw Error("PNG dimensions mismatch");
  for (const f of m.frames) {
    let opaque = 0;
    for (let y = f.frame.y; y < f.frame.y + f.frame.h; y++)
      for (let x = f.frame.x; x < f.frame.x + f.frame.w; x++)
        if (p.data[(y * p.width + x) * 4 + 3] > 160) opaque++;
    if (opaque < 100) throw Error("Empty frame");
  }
  for (const warning of auditPixels(p, m)) console.warn(set.id, warning);
  const memory = p.width * p.height * 4;
  bytes += memory;
  console.log(
    `${set.id}: 64 registered full-body frames, ${(memory / 1048576).toFixed(2)} MiB RGBA`,
  );
}
console.log(
  `Total character texture estimate: ${(bytes / 1048576).toFixed(2)} MiB, no mipmaps; excludes render targets/other atlases.`,
);

for (let i = 0; i < 2; i++) {
  const m = JSON.parse(
    readFileSync(
      `web/assets/isoworld/human-${i ? "coral" : "sage"}-gesture-v2.json`,
    ),
  );
  validateAtlas(m, ANIMATION_SETS[i]);
  const p = PNG.sync.read(readFileSync("web/assets/isoworld/" + m.image));
  if (p.width !== m.size[0] || p.height !== m.size[1])
    throw Error("Gesture PNG dimensions mismatch");
  console.log(`${ANIMATION_SETS[i].id}: registered gesture views valid`);
}

for (const file of readdirSync("web/assets/isoworld").filter((f) =>
  /-(actions|reactions)-v1\.json$|-(fishing|cleanup|combat)-v2\.json$/.test(f),
)) {
  const m = JSON.parse(readFileSync("web/assets/isoworld/" + file));
  const id = file.replace(/-(actions|reactions)-v1\.json$|-(fishing|cleanup|combat)-v2\.json$/, "");
  const set = ANIMATION_SETS.find((s) => s.id === id) ?? {
    ...ANIMATION_SETS[2],
    id,
  };
  validateActionAtlas(m, set);
  const p = PNG.sync.read(readFileSync("web/assets/isoworld/" + m.image));
  if (p.width !== m.size[0] || p.height !== m.size[1])
    throw Error("Action PNG dimensions mismatch");
  for (const i of new Set(Object.values(m.states).flat(2))) {
    const f = m.frames[i].frame;
    let count = 0;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        if (p.data[(y * p.width + x) * 4 + 3] > 160) count++;
    if (count < 100) throw Error("Empty action frame: " + file + ":" + i);
  }
  for (const warning of auditPixels(p, m)) console.warn(file, warning);
  console.log(
    `${id}: ${Object.keys(m.states).join(", ")} registered/pivots valid`,
  );
}
