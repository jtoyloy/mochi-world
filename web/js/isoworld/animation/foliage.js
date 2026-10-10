import { Texture, Rectangle } from "pixi.js";
export function validateFoliage(metadata, width, height) {
  if (metadata.image !== "foliage-v2.png" || metadata.size?.[0] !== width || metadata.size?.[1] !== height || metadata.frames?.length !== 2)
    throw Error("Invalid foliage sheet dimensions");
  for (const [i, entry] of metadata.frames.entries()) {
    const r = entry.region, f = entry.frame;
    if (entry.id !== ["oak", "blossom-tree"][i] || !r || !f ||
        [r.x,r.y,r.w,r.h,f.x,f.y,f.w,f.h].some(value => !Number.isInteger(value)) ||
        r.w <= 0 || r.h <= 0 || f.w <= 0 || f.h <= 0 || r.x < 0 || r.y < 0 ||
        r.x+r.w > width || r.y+r.h > height || f.x < r.x || f.y < r.y ||
        f.x+f.w > r.x+r.w || f.y+f.h > r.y+r.h || entry.pivot?.x !== 0.5 || entry.pivot?.y !== 1)
      throw Error("Invalid foliage crop/ground pivot");
  }
  const [a,b] = metadata.frames.map(entry => entry.region);
  if (a.x+a.w > b.x && b.x+b.w > a.x && a.y+a.h > b.y && b.y+b.h > a.y)
    throw Error("Overlapping foliage source regions");
  return metadata;
}
export function loadFoliage(texture, metadata) {
  validateFoliage(metadata, texture.width, texture.height);
  const ownedTextures = metadata.frames.map(({frame:f}) => new Texture({source:texture.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));
  return {texture, ownedTextures};
}
