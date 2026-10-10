// Keep wrapped phone controls in separate bands; desktop uses its existing CSS.
export function overlayOffsets({ dock, emotes, hud }) {
  const emotesBottom = 10 + dock + 8;
  const hudBottom = emotesBottom + emotes + 8;
  return { emotes: emotesBottom, hud: hudBottom, controls: hudBottom + hud + 8 };
}

export function compactOverlayViewport({ width, height, hudWidth = 0, cameraWidth = 0, mapWidth = 0 }) {
  // Desktop camera/map sit at the edges while the HUD is centered. Include an
  // eight-pixel horizontal gap and the existing 22-pixel desktop edge inset.
  const safeWidth = Math.max(700, hudWidth + 2 * (cameraWidth + 30), hudWidth + 2 * (mapWidth + 30));
  return width <= safeWidth || (height > 0 && height <= 500);
}

export function bindOverlayDisclosure({ dialog, invoker, content, restored }) {
  const parents = content.map(node => node.parentNode);
  invoker.setAttribute("aria-expanded", "true");
  dialog.append(...content);
  let restoredOnce = false;
  const restore = () => {
    if (restoredOnce) return;
    restoredOnce = true;
    content.forEach((node, index) => parents[index]?.append(node));
    invoker.setAttribute("aria-expanded", "false");
    restored();
  };
  dialog.addEventListener("close", restore, { once: true });
  return { close() { restore(); dialog.close(); } };
}

export function observeOverlayLayout(shell, Observer = globalThis.ResizeObserver, { onCompactChange = () => {} } = {}) {
  const panels = [".world-dock", ".world-emotes", ".adventure-hud"].map(selector => shell.querySelector(selector));
  const variables = ["--world-emotes-bottom", "--world-hud-bottom", "--world-controls-bottom"];
  const camera = shell.querySelector(".iso-controls"), map = shell.querySelector(".iso-minimap");
  let cameraWidth = 0, mapWidth = 0;
  let compact = null;
  function update() {
    if (compact !== true) {
      cameraWidth = camera?.getBoundingClientRect().width ?? cameraWidth;
      mapWidth = map?.getBoundingClientRect().width ?? mapWidth;
    }
    const nextCompact = compactOverlayViewport({ width: shell.clientWidth, height: shell.clientHeight,
      hudWidth: panels[2]?.getBoundingClientRect().width ?? 0, cameraWidth, mapWidth });
    if (nextCompact !== compact) { compact = nextCompact; onCompactChange(compact); }
    if (!compact) {
      for (const name of variables) shell.style.removeProperty(name);
      return;
    }
    const [dock, emotes, hud] = panels.map(panel => panel?.getBoundingClientRect().height ?? 0);
    const offsets = overlayOffsets({ dock, emotes, hud });
    for (const [index, value] of Object.values(offsets).entries())
      shell.style.setProperty(variables[index], `${Math.ceil(value)}px`);
  }
  const observer = Observer ? new Observer(update) : null;
  observer?.observe(shell);
  for (const panel of panels) if (panel) observer?.observe(panel);
  update();
  return () => {
    observer?.disconnect();
    if (compact) onCompactChange(false);
    for (const name of variables) shell.style.removeProperty(name);
  };
}
