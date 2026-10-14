import { readFileSync, statSync } from "node:fs";
import { PNG } from "pngjs";
import { validateFoliage } from "../web/js/isoworld/animation/foliage.js";
const root = "web/assets/isoworld/", metadata = JSON.parse(readFileSync(root + "foliage-v2.json"));
const png = PNG.sync.read(readFileSync(root + metadata.image));
validateFoliage(metadata, png.width, png.height);
for (const { id, region:r, frame:f } of metadata.frames) {
  let pixels = 0, edge = 0, outside = 0;
  for (let y=r.y; y<r.y+r.h; y++) for(let x=r.x; x<r.x+r.w; x++) {
    if (png.data[(y*png.width+x)*4+3] <= 16) continue;
    pixels++;
    if (x===r.x || x===r.x+r.w-1 || y===r.y || y===r.y+r.h-1) edge++;
    if (x<f.x || x>=f.x+f.w || y<f.y || y>=f.y+f.h) outside++;
  }
  if (pixels < 100 || edge || outside) throw Error(`Foliage ${id}: blank/cropped source (${edge} edge, ${outside} outside trim)`);
  console.log(`${id}: complete alpha silhouette, zero source-edge pixels, ground pivot .5/1`);
}
console.log(`Foliage shared source: ${(statSync(root+metadata.image).size/1048576).toFixed(2)} MiB PNG / ${(png.width*png.height*4/1048576).toFixed(2)} MiB RGBA; one optional request, two frame views.`);
