// Legacy baked atlas loader, used only by the development comparison and old asset validation.
import { Texture, Rectangle } from "pixi.js";

export function walkFramesFromAtlas(idles, texture, metadata) {
  const spec = metadata.states.walk,
    [w, h] = spec.cell,
    dirs = metadata.directions.length;
  if (
    ![4, 8].includes(dirs) ||
    spec.frames !== 8 ||
    spec.rows !== metadata.characters.length * dirs ||
    texture.width !== spec.columns * w ||
    texture.height !== spec.rows * h
  )
    throw new Error("Invalid locomotion atlas dimensions");
  if (
    spec.trimmed ||
    spec.anchor.length !== 2 ||
    spec.anchor.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
  )
    throw new Error("Invalid locomotion source pivot");
  const rows = metadata.characters.map((_, row) =>
    Array.from({ length: dirs }, (_, d) => {
      const height = metadata.sourceBodyHeights[row][d];
      if (!Number.isFinite(height) || height <= 0 || height > h)
        throw new Error("Invalid locomotion body height");
      return {
        idle: idles[row * 4 + (dirs === 8 ? Math.floor(((d + 1) % 8) / 2) : d)],
        height,
        walk: Array.from(
          { length: 8 },
          (_, frame) =>
            new Texture({
              source: texture.source,
              frame: new Rectangle(frame * w, (row * dirs + d) * h, w, h),
            }),
        ),
      };
    }),
  );
  return {
    rows,
    texture,
    cell: { w, h },
    anchor: { x: spec.anchor[0], y: spec.anchor[1] },
    directions: dirs,
    frames: 8,
  };
}
