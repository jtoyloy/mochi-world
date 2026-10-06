import {
  AnimationPlayback,
  DIRECTIONS8,
  directionIndex,
  STATES,
  ACTION_STATES,
} from "./registry.js";
import { selectTexture, stateFrames } from "./atlas.js";
import { Gait } from "../../game/locomotion/core.js";
// Development-only atlas playback. Identical profile/state selection as world actors.
export function openAnimationViewer(
  atlases,
  gestures = [],
  actions = [],
  mobs = {},
) {
  atlases = [...atlases, ...Object.values(mobs)];
  const d = document.createElement("dialog");
  d.className = "world-dialog";
  d.innerHTML =
    "<h2>Full-body animation viewer</h2><p>Walk uses traveled distance. Idle uses quiet breathing/blink frames. Colored crosses: ground (green), head (blue).</p>";
  const controls = document.createElement("div"),
    canvas = document.createElement("canvas"),
    info = document.createElement("p");
  canvas.width = 640;
  canvas.height = 420;
  canvas.style.width = "100%";
  const select = (label, values) => {
    const l = document.createElement("label"),
      s = document.createElement("select");
    l.textContent = label;
    s.setAttribute("aria-label", label);
    for (const v of values) {
      const o = document.createElement("option");
      o.textContent = v;
      o.value = v;
      s.append(o);
    }
    l.append(s);
    controls.append(l);
    return s;
  };
  const body = select(
      "Animation body",
      atlases.map((a) => a.set.id),
    ),
    direction = select("Animation direction", DIRECTIONS8),
    state = select("Animation state", STATES),
    speed = select("Animation speed", ["50%", "100%", "150%"]),
    guides = select("Show animation anchors", ["yes", "no"]);
  const close = document.createElement("button");
  close.textContent = "Close animation viewer";
  d.append(close, controls, canvas, info);
  document.body.append(d);
  d.showModal();
  let art = atlases[0],
    gait = new Gait(art.set.strideDistance),
    playback = new AnimationPlayback(art.set),
    last = performance.now(),
    raf;
  body.onchange = () => {
    art = atlases.find((a) => a.set.id === body.value);
    gait = new Gait(art.set.strideDistance);
    playback = new AnimationPlayback(art.set);
    state.onchange?.();
  };
  state.onchange = () => {
    playback.clearAction();
    if (ACTION_STATES[state.value]) playback.play(state.value);
  };
  const cross = (ctx, x, y, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
  };
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const logical = DIRECTIONS8.indexOf(direction.value),
      set = art.set,
      moving = state.value === "walk" || state.value === "trot",
      v = moving ? (180 * parseInt(speed.value)) / 100 : 0;
    const angle = (logical * Math.PI) / 4;
    gait.update(Math.cos(angle) * v * dt, Math.sin(angle) * v * dt, dt);
    gait.facing = logical;
    if (ACTION_STATES[state.value] && !playback.action)
      playback.play(state.value);
    playback.update(gait, v, (dt * parseInt(speed.value)) / 100, state.value);
    const di = directionIndex(set, logical),
      active = playback.action
        ? (actions[atlases.indexOf(art)] ?? art)
        : ["talk", "gesture"].includes(playback.state)
          ? (gestures[atlases.indexOf(art)] ?? art)
          : art,
      t = selectTexture(active, playback, di),
      f = t.frame,
      ctx = canvas.getContext("2d"),
      scale = 1.8,
      x = 320 - set.cell[0] * scale * 0.5,
      y = 350 - set.cell[1] * scale * set.footAnchor.y;
    ctx.clearRect(0, 0, 640, 420);
    ctx.fillStyle = "#e7ddc7";
    ctx.fillRect(0, 0, 640, 420);
    ctx.save();
    if (active.metadata.mirrors?.[di]) {
      ctx.translate(640, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      t.source.resource,
      f.x,
      f.y,
      f.width,
      f.height,
      x + t.trim.x * scale,
      y + t.trim.y * scale,
      f.width * scale,
      f.height * scale,
    );
    ctx.restore();
    if (guides.value === "yes") {
      ctx.strokeStyle = "#ab7860";
      ctx.strokeRect(x, y, set.cell[0] * scale, set.cell[1] * scale);
      ctx.strokeStyle = "#895da2";
      ctx.strokeRect(
        x + t.trim.x * scale,
        y + t.trim.y * scale,
        f.width * scale,
        f.height * scale,
      );
      cross(ctx, 320, 350, "#29814b");
      cross(
        ctx,
        x + set.cell[0] * scale * set.headAnchor.x,
        y + set.cell[1] * scale * set.headAnchor.y,
        "#3568b2",
      );
    }
    const displayed =
      Object.entries(active.rows[di]).find(
        ([, frames]) => frames === stateFrames(active, playback.state, di),
      )?.[0] ?? "idle";
    info.textContent = `${set.id} · ${direction.value} → ${set.directions[di]} art · ${playback.state} · painted ${displayed} · frame ${playback.frame} · phase ${playback.phase.toFixed(3)} · stride ${playback.state === "trot" ? set.trotStrideDistance : set.strideDistance} · speed ${v} · ground ${set.footAnchor.x},${set.footAnchor.y} · cell ${set.cell.join("×")}`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    d.remove();
  };
  close.onclick = () => {
    d.close();
    cleanup();
  };
  d.addEventListener("cancel", cleanup, { once: true });
}
