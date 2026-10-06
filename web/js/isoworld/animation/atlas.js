import { Texture, Rectangle } from "pixi.js";
import { validateSet } from "./registry.js";
export function validateAtlas(metadata, set) {
  validateSet(set);
  if (
    metadata.frames.length !== set.directions.length * 16 ||
    metadata.size.some((v) => !Number.isInteger(v) || v < 1)
  )
    throw Error("Missing atlas frames");
  for (const f of metadata.frames) {
    const { frame: r, sourceSize: o, spriteSourceSize: t, pivot: p } = f;
    if (
      !r ||
      !o ||
      !t ||
      !p ||
      [r.x, r.y, r.w, r.h, o.w, o.h, t.x, t.y, t.w, t.h, p.x, p.y].some(
        (v) => !Number.isFinite(v),
      ) ||
      r.w < 1 ||
      r.h < 1 ||
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.w > metadata.size[0] ||
      r.y + r.h > metadata.size[1] ||
      o.w !== set.cell[0] ||
      o.h !== set.cell[1] ||
      t.w !== r.w ||
      t.h !== r.h ||
      t.x < 0 ||
      t.y < 0 ||
      t.x + t.w > o.w ||
      t.y + t.h > o.h ||
      p.x !== set.footAnchor.x ||
      p.y !== set.footAnchor.y
    )
      throw Error("Invalid trimmed frame/pivot");
  }
  for (const state of ["walk", "idle"])
    if (
      metadata.rowMap[state].length !== set.directions.length ||
      metadata.rowMap[state].some(
        (r) => !Number.isInteger(r) || r < 0 || r >= set.directions.length * 2,
      )
    )
      throw Error("Missing directional state row");
  return metadata;
}
export function loadAnimationAtlas(texture, set, metadata) {
  validateAtlas(metadata, set);
  if (texture.width !== metadata.size[0] || texture.height !== metadata.size[1])
    throw Error(`Invalid atlas dimensions: ${set.id}`);
  const make = (f) =>
    new Texture({
      source: texture.source,
      frame: new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h),
      orig: new Rectangle(0, 0, f.sourceSize.w, f.sourceSize.h),
      trim: new Rectangle(
        f.spriteSourceSize.x,
        f.spriteSourceSize.y,
        f.spriteSourceSize.w,
        f.spriteSourceSize.h,
      ),
    });
  const rows = set.directions.map((_, d) => {
    const frames = (state) =>
      Array.from({ length: 8 }, (_, f) =>
        make(metadata.frames[metadata.rowMap[state][d] * 8 + f]),
      );
    return { walk: frames("walk"), idle: frames("idle") };
  });
  return { set, texture, metadata, rows };
}
export function selectTexture(art, playback, direction) {
  const row = art.rows[direction];
  return (
    playback.state === "walk" ||
    playback.state === "trot" ||
    playback.state === "settle"
      ? row.walk
      : row.idle
  )[playback.frame];
}
