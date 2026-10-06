import { Texture, Rectangle } from "pixi.js";
import { validateSet, ACTION_FALLBACKS } from "./registry.js";
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
  return { set, texture, metadata, rows, ownedTextures: rows.flatMap(row => [...row.walk, ...row.idle]) };
}
// Action art is optional: follow explicit aliases then a compatible idle pose.
export function stateFrames(art, state, direction) {
  const row = art.rows[direction] ?? art.rows[0];
  if (["walk", "trot", "settle", "move"].includes(state))
    return row.walk ?? row.idle;
  const seen = new Set();
  while (state && !seen.has(state)) {
    if (row[state]?.length) return row[state];
    seen.add(state);
    state = ACTION_FALLBACKS[state];
  }
  return row.idle;
}
export function selectTexture(art, playback, direction) {
  const frames = stateFrames(art, playback.state, direction);
  return (
    frames[Math.min(frames.length - 1, Math.max(0, playback.frame))] ??
    frames[0]
  );
}
export function validateActionAtlas(m, set) {
  validateSet(set);
  if (
    !m.states ||
    !Object.keys(m.states).length ||
    !m.frames?.length ||
    !m.size?.every((v) => Number.isInteger(v) && v > 0)
  )
    throw Error("Missing action frames");
  if (!Array.isArray(m.mirrors) || m.mirrors.length !== set.directions.length || m.mirrors.some(v => typeof v !== "boolean"))
    throw Error("Missing directional mirror fallback");
  if (m.requiredStates?.some((state) => !m.states[state]))
    throw Error("Missing required action state");
  if (!Number.isFinite(m.height) || m.height <= 0)
    throw Error("Invalid action scale");
  // Reuse the locomotion trim/pivot contract for every frame.
  for (const f of m.frames)
    validateAtlas(
      {
        size: m.size,
        frames: Array(set.directions.length * 16).fill(f),
        rowMap: {
          walk: set.directions.map(() => 0),
          idle: set.directions.map(() => 0),
        },
      },
      set,
    );
  for (const rows of Object.values(m.states)) {
    if (
      rows.length !== set.directions.length ||
      rows.some(
        (row) =>
          row.length !== 8 ||
          row.some((i) => !Number.isInteger(i) || !m.frames[i]),
      )
    )
      throw Error("Missing directional action frame");
  }
  return m;
}
export function loadActionAtlas(texture, set, m, baseArt) {
  validateActionAtlas(m, set);
  if (texture.width !== m.size[0] || texture.height !== m.size[1])
    throw Error("Action PNG dimensions mismatch");
  const frames = m.frames.map(
    (f) =>
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
      }),
  );
  return {
    ...baseArt,
    texture,
    ownedTextures: frames,
    set,
    metadata: {
      ...baseArt.metadata,
      ...m,
      heights: baseArt.metadata.heights,
      mirrors: baseArt.metadata.mirrors ?? m.mirrors,
      stateMirrors: {
        ...baseArt.metadata.stateMirrors,
        ...Object.fromEntries(Object.keys(m.states).map(state => [state, m.stateMirrors?.[state] ?? m.mirrors])),
      },
      stateHeights: {
        ...baseArt.metadata.stateHeights,
        ...Object.fromEntries(Object.keys(m.states).map((s) => [s, m.height])),
      },
    },
    rows: set.directions.map((_, d) => ({
      ...baseArt.rows[d],
      ...Object.fromEntries(
        Object.entries(m.states).map(([state, rows]) => [
          state,
          rows[d].map((i) => frames[i]),
        ]),
      ),
    })),
  };
}

export function stateHeight(art, state) {
  const seen = new Set();
  while (state && !seen.has(state)) {
    if (art.metadata.stateHeights?.[state])
      return art.metadata.stateHeights[state];
    seen.add(state);
    state = ACTION_FALLBACKS[state];
  }
  return art.metadata.heights.idle;
}

export function stateMirrored(art, state, direction) {
  const seen = new Set();
  while (state && !seen.has(state)) {
    if (art.metadata.stateMirrors?.[state]) return !!art.metadata.stateMirrors[state][direction];
    seen.add(state);
    state = ACTION_FALLBACKS[state];
  }
  return !!art.metadata.mirrors?.[direction];
}
