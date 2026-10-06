import { contactPose, MOTION } from "../game/locomotion/core.js";
import { Texture, Rectangle } from "pixi.js";
// Temporary cutout rig baked into fixed, untrimmed animation cells. This is actual
// alternating hip/knee/foot articulation, not a translation or sprite bob.
// Artist atlases can implement this same {idle,walk,anchor,stride} contract.
export function createWalkFrames(idles) {
  const w = 160,
    h = 180,
    canvas = document.createElement("canvas");
  canvas.width = w * 8;
  canvas.height = h * 16;
  const ctx = canvas.getContext("2d");
  const rows = [];
  for (let row = 0; row < 4; row++) {
    const directions = [];
    for (let direction = 0; direction < 4; direction++) {
      const source = idles[row * 4 + direction],
        f = source.frame,
        pet = row >= 2;
      const image = source.source.resource;
      const scale = Math.min((w - 28) / f.width, (h - 40) / f.height);
      const sw = f.width * scale,
        sh = f.height * scale,
        left = (w - sw) / 2,
        top = h - 24 - sh;
      const forward = direction === 0 || direction === 3 ? 1 : -1;
      for (let frame = 0; frame < 8; frame++) {
        ctx.save();
        ctx.translate(frame * w, (row * 4 + direction) * h);
        const phase = frame / 8;
        const legs = pet ? 4 : 2;
        for (let leg = 0; leg < legs; leg++) {
          const front = pet ? leg < 2 : true,
            near = leg % 2 === 0;
          const t =
            (phase + (pet ? (leg === 0 || leg === 3 ? 0 : 0.5) : leg * 0.5)) %
            1;
          // stance travels backwards against world motion; swing lifts and returns.
          const renderScale = (pet ? 83 : 124) / sh;
          const stride =
            ((pet ? MOTION.petStride : MOTION.stride) *
              Math.hypot(0.72, 0.36)) /
            (4 * renderScale);
          const { along, lift } = contactPose(t, stride, pet ? 9 : 12);
          const hipX = pet
            ? left + sw * (front ? 0.67 : 0.36) + (near ? 3 : -3)
            : left + sw * (near ? 0.55 : 0.43);
          const hipY = top + sh * (pet ? 0.77 : 0.755);
          const footX = hipX + forward * 0.89442719 * along + (near ? 4 : -4),
            footY =
              h -
              25 +
              (direction < 2 ? 1 : -1) * 0.4472136 * along -
              lift -
              (near ? 0 : 4);
          const kneeX = (hipX + footX) / 2 - forward * (lift * 0.65),
            kneeY = (hipY + footY) / 2 - 2;
          const fur = row === 2 ? "#dbcdb6" : row === 3 ? "#a69b65" : "#c7b99a";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#625640";
          ctx.lineWidth = pet ? 12 : 15;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY - 4);
          ctx.stroke();
          ctx.strokeStyle = fur;
          ctx.lineWidth = pet ? 10 : 12;
          ctx.stroke();
          if (!pet) {
            ctx.strokeStyle = "#71533a";
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(kneeX, kneeY + 3);
            ctx.lineTo(footX, footY - 3);
            ctx.stroke();
          }
          ctx.fillStyle = pet ? fur : "#694b34";
          ctx.beginPath();
          ctx.ellipse(
            footX + forward * 2,
            footY - 2,
            pet ? 7 : 9,
            4,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.strokeStyle = pet ? "#e2d5b7" : "#9d7850";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(footX - 3, footY - 4);
          ctx.lineTo(footX + forward * 6, footY - 4);
          ctx.stroke();
        }
        // Upper-body pixels retain established character identity. Fixed source
        // rectangle and pivot avoid direction/frame trimming jitter.
        const cut = pet ? 0.8 : 0.77;
        const bodyDown = Math.sin(phase * Math.PI * 4) * 1.2;
        ctx.drawImage(
          image,
          f.x,
          f.y,
          f.width,
          f.height * cut,
          left,
          top + bodyDown,
          sw,
          sh * cut,
        );
        ctx.restore();
      }
      directions.push({ idle: source, walk: [], height: sh });
    }
    rows.push(directions);
  }
  const texture = Texture.from(canvas);
  for (let row = 0; row < 4; row++)
    for (let d = 0; d < 4; d++)
      for (let frame = 0; frame < 8; frame++)
        rows[row][d].walk.push(
          new Texture({
            source: texture.source,
            frame: new Rectangle(frame * w, (row * 4 + d) * h, w, h),
          }),
        );
  return {
    rows,
    texture,
    cell: { w, h },
    anchor: { x: 0.5, y: (h - 24) / h },
    directions: 4,
    frames: 8,
  };
}

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
