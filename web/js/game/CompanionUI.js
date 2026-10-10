// Reload server-owned companions when an adoption panel returns to the game.
export function companionPicker({ refresh, request, dialog, element, btn, panel, isClosed, notice }) {
  async function open(invoker = globalThis.document?.activeElement) {
    const world = await refresh();
    if (isClosed()) return;
    const d = dialog("Your Mochis", invoker);
    if (!world.mochis.length) d.append(
      element("p", "Your first companion is waiting."),
      btn("Adopt a Mochi", () => {
        d.close();
        const adoption = panel("Adopt", "/pets", invoker);
        adoption.addEventListener("close", () => {
          if (!isClosed()) open(invoker).catch(error => {
            if (!isClosed()) notice(error.message);
          });
        }, { once: true });
      }),
    );
    for (const pet of world.mochis) d.append(btn(
      `${pet.name}${pet.id === world.activeMochi?.id ? " · with you" : " · at home / resting / paper trading"}`,
      async () => {
        await request("/api/active", { mochiId: pet.id });
        await refresh();
        d.close();
      },
    ));
    return d;
  }
  return open;
}
