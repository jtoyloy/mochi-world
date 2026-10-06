import {
  WEAPONS,
  SPELLS,
  ACCESSORIES,
  ARMOR,
  RESOURCE_NAMES,
  VENDORS,
  QUESTS,
  RESOURCE_VALUES,
} from "./adventure.js";
export function adventureUI({
  shell,
  bridge,
  request,
  dialog,
  btn,
  element,
  notice,
  refresh,
}) {
  let state = null,
    gather = null,
    gatherTimer = null,
    disposed = false;
  const hud = element("div", null, "adventure-hud"),
    vitals = element("div", "Preparing adventure…", "adventure-vitals"),
    target = element("small", "Town is safe"),
    hotbar = element("div", null, "adventure-hotbar");
  const send = async (input) => request("/api/adventure/action", input);
  const actions = [
    ["1 · Skill", () => send({ action: "skill" })],
    ["2 · Fire", () => send({ action: "spell", spellId: "fire-bolt" })],
    ["3 · Heal", () => send({ action: "spell", spellId: "heal" })],
    ["4 · Potion", () => send({ action: "item", itemId: "small-potion" })],
  ];
  for (const [name, fn] of actions) hotbar.append(btn(name, fn));
  hotbar.append(btn("Adventure", () => pack()));
  hud.append(vitals, target, hotbar);
  shell.append(hud);
  function update(data) {
    state = { ...state, ...data };
    const p = data.player;
    if (p) {
      vitals.textContent = `♥ ${Math.ceil(p.hp)}/${p.stats.maxHp}   ✧ ${Math.ceil(p.mp)}/${p.stats.maxMp}   Mochi ♥ ${Math.ceil(p.petHp)}/80`;
      hud.classList.toggle("in-combat", !!p.target);
    }
  }
  async function pack() {
    const s = await request("/api/adventure");
    update(s);
    const d = dialog("Adventure pack");
    d.append(
      element(
        "p",
        `Combat ${s.player.levels.combat} · Fishing ${s.player.levels.fishing} · Woodcutting ${s.player.levels.woodcutting}`,
      ),
      element(
        "p",
        "Starter sword, three potions, rod and axe are yours. Click a mob to target it; attacks happen in range. Move along paths as usual. Your Mochi chooses its own battle actions.",
      ),
    );
    for (const slot of ["weapon", "head", "body", "accessory1", "accessory2"]) {
      const select = element("select");
      select.setAttribute("aria-label", slot + " combat equipment");
      select.append(new Option("Choose " + slot, ""));
      for (const i of s.inventory)
        if (
          (slot === "weapon"
            ? WEAPONS
            : ["head", "body"].includes(slot)
              ? ARMOR
              : ACCESSORIES)[i.item_id]
        )
          select.append(new Option(i.item_id.replaceAll("-", " "), i.item_id));
      select.value = s.player.equipment[slot] ?? "";
      select.onchange = async () => {
        try {
          await send({ action: "equip", slot, itemId: select.value });
          notice("Combat equipment saved.");
        } catch (e) {
          notice(e.message);
        }
      };
      d.append(element("label", slot), select);
    }
    if (s.harvest)
      d.append(
        element("p", "A gathering activity is pending."),
        btn("Finish gathering", async () => {
          const r = await send({
            action: "finishGather",
            harvestId: s.harvest.id,
          });
          notice("Gathered " + RESOURCE_NAMES[r.itemId]);
          d.close();
        }),
        btn("Cancel gathering", async () => {
          await send({ action: "cancelGather" });
          d.close();
        }),
      );
    d.append(element("h3", "Spells"));
    for (const id of s.player.spells)
      d.append(
        btn(SPELLS[id].name, () => send({ action: "spell", spellId: id })),
      );
    for (const i of s.inventory)
      if (SPELLS[i.item_id] && !s.player.spells.includes(i.item_id))
        d.append(
          btn("Learn " + SPELLS[i.item_id].name, () =>
            send({ action: "learnSpell", spellId: i.item_id }),
          ),
        );
    d.append(element("h3", "Resources & supplies"));
    for (const i of s.inventory)
      d.append(
        element(
          "p",
          `${RESOURCE_NAMES[i.item_id] ?? i.item_id.replaceAll("-", " ")} ×${i.quantity}`,
        ),
      );
    d.append(element("h3", "Your Mochi in battle"));
    for (const b of s.battle) {
      const counts = b.metrics.actions ?? {},
        favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      d.append(
        element(
          "p",
          `${b.metrics.decisions ?? 0} decisions · most used: ${favorite?.[0]?.replaceAll("_", " ") ?? "still discovering"} · ${b.metrics.refused ?? 0} refused settlements`,
        ),
      );
    }
    d.append(element("h3", "First adventures"));
    for (const q of QUESTS)
      d.append(
        element(
          "p",
          `${s.player.quests.includes(q.id) ? "✓" : "○"} ${q.name} — ${Object.entries(
            q.goals,
          )
            .map(([k, n]) => `${k} ${s.player.progress[k] ?? 0}/${n}`)
            .join(" · ")}`,
        ),
      );
    d.append(
      btn("Game rewards", () => {
        d.close();
        rewards();
      }),
      btn("Stop targeting", () => send({ action: "stop" })),
    );
  }
  function tokenText(raw, mock) {
    const decimals = state?.rewards?.decimals ?? 6,
      n = BigInt(raw),
      scale = 10n ** BigInt(decimals),
      fraction = decimals
        ? "." + (n % scale).toString().padStart(decimals, "0")
        : "";
    return (
      (n / scale).toString() + fraction + (mock ? " TEST $MOCHI" : " $MOCHI")
    );
  }
  async function rewards() {
    const s = await request("/api/adventure"),
      r = s.rewards,
      d = dialog("Game rewards");
    update(s);
    d.append(
      element("p", "Claimable: " + tokenText(r.amountRaw, r.mock)),
      element("p", r.message),
    );
    for (const claim of r.claims ?? [])
      d.append(
        element(
          "p",
          `${claim.status === "pending" ? "Awaiting treasury payout" : "Paid"} · ${tokenText(claim.amount_raw, r.mock)} · ${claim.id.slice(0, 8)}`,
        ),
      );
    for (const row of r.sources)
      d.append(
        element("p", row.source + ": " + tokenText(row.amount_raw, r.mock)),
      );
    d.append(
      btn(
        r.mock ? "Claim TEST rewards" : "Claim to verified wallet",
        async () => {
          const a = await request("/api/adventure/claim", {
            id: crypto.randomUUID(),
          });
          notice(a.message);
          d.close();
          await refresh();
        },
      ),
    );
  }
  async function vendor(id) {
    const s = await request("/api/adventure"),
      v = VENDORS[id],
      d = dialog(v.name),
      selected = {};
    update(s);
    d.append(
      element(
        "p",
        s.rewards.enabled
          ? "Rewards reserve funded treasury value; claim later in one batch."
          : "Token rewards are paused. Keep gathering for resources and XP.",
      ),
      element("p", s.rewards.message),
    );
    const preview = element("p", "Choose resources");
    const prices = s.rewards.prices ?? {};
    const estimate = () =>
      (preview.textContent =
        "Estimated: " +
        tokenText(
          Object.entries(selected)
            .reduce(
              (n, [key, q]) => n + BigInt(prices[key] ?? 0) * BigInt(q),
              0n,
            )
            .toString(),
          s.rewards.mock,
        ));
    for (const i of s.inventory.filter((i) => v.items.includes(i.item_id))) {
      const field = element("input");
      field.type = "number";
      field.min = 0;
      field.max = i.quantity;
      field.value = 0;
      field.setAttribute("aria-label", RESOURCE_NAMES[i.item_id] + " quantity");
      field.oninput = () => {
        const q = Number(field.value);
        if (Number.isInteger(q) && q > 0 && q <= i.quantity)
          selected[i.item_id] = q;
        else delete selected[i.item_id];
        estimate();
      };
      d.append(
        element("label", RESOURCE_NAMES[i.item_id] + ` ×${i.quantity}`),
        field,
      );
    }
    d.append(
      preview,
      btn("Sell selected", async () => {
        const r = await request("/api/adventure/sell", {
          vendor: id,
          items: selected,
          id: crypto.randomUUID(),
        });
        notice(r.message + " " + tokenText(r.amountRaw, r.mock));
        d.close();
      }),
      btn("Sell all", async () => {
        const items = Object.fromEntries(
          s.inventory
            .filter((i) => v.items.includes(i.item_id))
            .map((i) => [i.item_id, i.quantity]),
        );
        const r = await request("/api/adventure/sell", {
          vendor: id,
          items,
          id: crypto.randomUUID(),
        });
        notice(r.message);
        d.close();
      }),
      btn("Game rewards", () => {
        d.close();
        rewards();
      }),
    );
    bridge.scene.audio.cue("vendor");
  }
  async function gatherNode(node) {
    const self = bridge.scene.data.get(bridge.selfId);
    if (!self) return;
    if (Math.hypot(self.x - node.x, self.y - node.y) > 100) {
      bridge.scene.moveTo({ x: node.x, y: node.y });
      notice("Walk closer, then click the resource to begin.");
      return;
    }
    const start = await send({ action: "gather", nodeId: node.id });
    gather = { ...start, name: node.name };
    target.textContent = `${node.kind === "fishing" ? "Fishing" : "Chopping"} · ${node.name}… stay here`;
    clearTimeout(gatherTimer);
    gatherTimer = setTimeout(async () => {
      if (disposed) return;
      try {
        const result = await send({
          action: "finishGather",
          harvestId: start.id,
        });
        notice(`Gathered ${RESOURCE_NAMES[result.itemId]} · +${result.xp} XP`);
        bridge.scene.audio.cue(result.kind);
      } catch (e) {
        notice(e.message);
      } finally {
        gather = null;
        target.textContent = "Click a mob or resource to interact";
      }
    }, start.durationMs + 250);
  }
  const keydown = (e) => {
    if (
      e.repeat ||
      document.querySelector("dialog[open]") ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
    )
      return;
    const n = Number(e.key) - 1;
    if (n >= 0 && n < 4) {
      e.preventDefault();
      actions[n][1]().catch((e) => notice(e.message));
    }
  };
  window.addEventListener("keydown", keydown);
  return {
    update,
    pack,
    vendor,
    rewards,
    gatherNode,
    event(type, data) {
      if (type === "adventureState") update(data);
      if (type === "adventureRoom") {
        bridge.scene.adventure = data;
        bridge.scene.publish?.();
        if (!gather) {
          const m = data.mobs.find((m) => m.id === state?.player?.target);
          target.textContent = m
            ? `${m.name} · ♥ ${m.hp}/${m.maxHp}`
            : data.roomId === "town"
              ? "Town is safe · gear west · fashion east · buyers south"
              : "Click a mob to target · click a resource to gather";
        }
      }
      if (type === "adventureNotice") notice(data.message);
      if (type === "battleDecision") bridge.scene.battleDecision = data;
      if (type === "combatEffect") {
        bridge.scene.combatEffects ??= [];
        bridge.scene.combatEffects.push(data);
        if (bridge.scene.combatEffects.length > 24)
          bridge.scene.combatEffects.shift();
        bridge.scene.audio.cue(data.kind);
        if (data.kind === "victory" && data.userId === bridge.selfId)
          notice(`Victory · +${data.xp} combat XP`);
      }
    },
    destroy() {
      disposed = true;
      clearTimeout(gatherTimer);
      window.removeEventListener("keydown", keydown);
    },
  };
}
