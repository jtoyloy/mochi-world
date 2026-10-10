// Keep wrapped phone controls in separate bands; desktop uses its existing CSS.
export function overlayOffsets({ dock, emotes, hud }) {
  const emotesBottom = 10 + dock + 8;
  const hudBottom = emotesBottom + emotes + 8;
  return { emotes: emotesBottom, hud: hudBottom, controls: hudBottom + hud + 8 };
}

export function observeOverlayLayout(shell, Observer = globalThis.ResizeObserver) {
  const panels = [".world-dock", ".world-emotes", ".adventure-hud"].map(selector => shell.querySelector(selector));
  const variables = ["--world-emotes-bottom", "--world-hud-bottom", "--world-controls-bottom"];
  function update() {
    if (shell.clientWidth > 700) {
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
    for (const name of variables) shell.style.removeProperty(name);
  };
}
