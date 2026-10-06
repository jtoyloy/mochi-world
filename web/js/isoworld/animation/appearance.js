import { Texture, Rectangle, CanvasSource } from "pixi.js";
// One cached, precomposed sheet per equipped appearance. Base clothing/hair is
// painted into the original full-body frames. Existing cosmetic badges are
// baked in the same source canvas/direction/phase, never extra animated bodies.
export class AppearanceCache {
  constructor(renderer, limit = 8) {
    this.renderer = renderer;
    this.limit = limit;
    this.cache = new Map();
  }
  compose(art, key, overlays, slots = {}, pixelCell = 128) {
    const relevant = overlays.filter(
      (o) => o.graphics.context.instructions.length,
    );
    if (!relevant.length && !slots.feet) return art;
    const cacheKey =
      art.set.id + ":" + art.metadata.image + ":" + pixelCell + ":" + key;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    // Bound memory. Beyond the cap the renderer keeps compatible base art and
    // existing attachment layers; it never destroys a sheet held by an actor.
    if (this.cache.size >= this.limit) return null;
    const prepared = relevant.map((o) => {
      const visible = o.graphics.visible;
      o.graphics.visible = true;
      const result = {
        kind: o.kind,
        bounds: o.graphics.getLocalBounds().clone(),
        canvas: this.renderer.extract.canvas({
          target: o.graphics,
          resolution: 1,
        }),
      };
      o.graphics.visible = visible;
      return result;
    });
    const [w, h] = art.set.cell,
      canvas = document.createElement("canvas");
    canvas.width = pixelCell * 8;
    canvas.height = pixelCell * 8;
    const ctx = canvas.getContext("2d"),
      rows = [];
    ctx.scale(pixelCell / w, pixelCell / h);
    for (let d = 0; d < 4; d++) {
      const row = { walk: [], idle: [] };
      for (const state of ["walk", "idle"])
        for (let frame = 0; frame < 8; frame++) {
          const t = art.rows[d][state][frame],
            f = t.frame,
            tr = t.trim,
            ox = frame * w,
            oy = (d + (state === "idle" ? 4 : 0)) * h,
            phase = frame / 8,
            sourceHeight = art.metadata.heights[state],
            scale = sourceHeight / art.set.height;
          ctx.save();
          ctx.translate(ox, oy);
          const draw = (o) => {
            const { bounds: b, canvas: c } = o,
              side =
                state === "walk"
                  ? Math.sin(phase * Math.PI * 2)
                  : Math.sin(phase * Math.PI * 2) * 0.12;
            // Authored secondary attachment timing; no physics/cloth simulation.
            const headShift = (sourceHeight - f.height) / scale;
            ctx.save();
            ctx.translate(
              w * 0.5 + side * 0.7 * scale,
              h * art.set.footAnchor.y + headShift * scale,
            );
            ctx.rotate(side * (o.kind === "cape" ? 0.025 : 0.018));
            ctx.drawImage(
              c,
              b.x * scale,
              b.y * scale,
              b.width * scale,
              b.height * scale,
            );
            ctx.restore();
          };
          prepared.filter((o) => o.kind === "cape").forEach(draw);
          ctx.drawImage(
            t.source.resource,
            f.x,
            f.y,
            f.width,
            f.height,
            tr.x,
            tr.y,
            tr.width,
            tr.height,
          );
          // Boots recolor follows the painted legs instead of fixed ellipses on ground.
          if (slots.feet) {
            ctx.save();
            ctx.globalCompositeOperation = "source-atop";
            ctx.fillStyle = "#79596b70";
            ctx.fillRect(
              0,
              h * 0.88 - sourceHeight * 0.18,
              w,
              sourceHeight * 0.18,
            );
            ctx.restore();
          }
          prepared.filter((o) => o.kind !== "cape").forEach(draw);
          ctx.restore();
        }
      rows.push(row);
    }
    const texture = new Texture({
      source: new CanvasSource({ resource: canvas, resolution: pixelCell / w }),
    });
    for (let d = 0; d < 4; d++)
      for (const state of ["walk", "idle"])
        for (let frame = 0; frame < 8; frame++)
          rows[d][state].push(
            new Texture({
              source: texture.source,
              frame: new Rectangle(
                frame * w,
                (d + (state === "idle" ? 4 : 0)) * h,
                w,
                h,
              ),
            }),
          );
    const result = { ...art, texture, rows, composited: true };
    this.cache.set(cacheKey, result);
    return result;
  }
  get bytes() {
    return [...this.cache.values()].reduce(
      (n, a) =>
        n + a.texture.source.pixelWidth * a.texture.source.pixelHeight * 4,
      0,
    );
  }
  destroy() {
    for (const a of this.cache.values()) a.texture.source.destroy();
    this.cache.clear();
  }
}
