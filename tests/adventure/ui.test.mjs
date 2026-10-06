import { test } from "node:test";
import assert from "node:assert/strict";
import { adventureUI } from "../../web/js/game/AdventureUI.js";

class Element {
  constructor(tag, text = "") {
    this.tagName = tag.toUpperCase();
    this.textContent = text;
    this.children = [];
    this.value = "";
  }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  close() { this.closed = true; }
  classList = { toggle() {} };
}
function fixture(t, changes = {}) {
  const originals = { window: globalThis.window, document: globalThis.document, Option: globalThis.Option };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { querySelector() { return null; } };
  globalThis.Option = class extends Element {
    constructor(text, value) { super("option", text); this.value = value; }
  };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dialogs = [], requests = [], notices = [], cues = [];
  const state = {
    player: { hp: 100, mp: 60, petHp: 80, stats: { maxHp: 100, maxMp: 60 }, levels: { combat: 1, fishing: 1, woodcutting: 1 }, equipment: { weapon: "basic-sword" }, spells: [], quests: [], progress: {} },
    inventory: [{ item_id: "basic-sword", quantity: 1 }, { item_id: "travel-cap", quantity: 1 }, { item_id: "padded-coat", quantity: 1 }, { item_id: "mana-potion", quantity: 2 }],
    battle: [], serverTime: 10000, ...changes,
  };
  let respond = async (data) => data.action === "gather"
    ? { id: "harvest", durationMs: 1000 }
    : { itemId: "softwood", xp: 12, kind: "woodcutting" };
  const ui = adventureUI({
    shell: new Element("section"),
    bridge: { selfId: "player", scene: { data: new Map([["player", { x: 0, y: 0 }]]), audio: { cue: (cue) => cues.push(cue) } } },
    request: async (path, data) => {
      requests.push({ path, data });
      return data ? respond(data) : state;
    },
    dialog: () => { const d = new Element("dialog"); dialogs.push(d); return d; },
    btn: (text, onclick) => Object.assign(new Element("button", text), { onclick }),
    element: (tag, text) => new Element(tag, text),
    notice: (text) => notices.push(text), refresh: async () => {},
  });
  t.after(() => { ui.destroy(); Object.assign(globalThis, originals); });
  return { ui, dialogs, requests, notices, cues, setRespond(fn) { respond = fn; } };
}
const button = (d, text) => d.children.find((e) => e.tagName === "BUTTON" && e.textContent === text);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("equipment selects show only matching armor slots and restore rejected equipment", async (t) => {
  const f = fixture(t);
  await f.ui.pack();
  const selects = f.dialogs[0].children.filter((e) => e.tagName === "SELECT");
  assert.deepEqual(selects[1].children.map((e) => e.value), ["", "travel-cap"]);
  assert.deepEqual(selects[2].children.map((e) => e.value), ["", "padded-coat"]);
  f.setRespond(async () => { throw new Error("Own this item first"); });
  selects[0].value = "reed-staff";
  await selects[0].onchange();
  assert.equal(selects[0].value, "basic-sword");
  assert.equal(selects[0].disabled, false);
  assert.deepEqual(f.notices, ["Own this item first"]);
});

test("inventory supplies expose authoritative use and refresh the pack", async (t) => {
  const f = fixture(t);
  await f.ui.pack();
  await button(f.dialogs[0], "Use mana potion").onclick();
  assert.deepEqual(f.requests.find((r) => r.data)?.data, { action: "item", itemId: "mana-potion" });
  assert.equal(f.dialogs[0].closed, true);
  assert.equal(f.dialogs.length, 2);
});

test("cancel gathering removes automatic completion without granting a result", async (t) => {
  const f = fixture(t, { harvest: { id: "harvest", ready_at: 11000 } });
  await f.ui.gatherNode({ id: "forest-soft", x: 0, y: 0, kind: "woodcutting", name: "Grove" });
  await f.ui.pack();
  await button(f.dialogs[0], "Cancel gathering").onclick();
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(f.requests.filter((r) => r.data?.action === "finishGather").length, 0);
  assert.equal(f.cues.length, 0);
});

test("manual completion and pending automatic completion share one server request", async (t) => {
  const f = fixture(t, { harvest: { id: "harvest", ready_at: 11000 } });
  let resolve;
  f.setRespond((data) => data.action === "gather" ? { id: "harvest", durationMs: 1000 } : new Promise((r) => { resolve = r; }));
  await f.ui.gatherNode({ id: "forest-soft", x: 0, y: 0, kind: "woodcutting", name: "Grove" });
  await f.ui.pack();
  t.mock.timers.tick(1250);
  const clicked = button(f.dialogs[0], "Finish gathering").onclick();
  assert.equal(f.requests.filter((r) => r.data?.action === "finishGather").length, 1);
  resolve({ itemId: "softwood", xp: 12, kind: "woodcutting" });
  await clicked;
  assert.equal(f.cues.length, 1);
});

test("recovered harvest waits for server-relative readiness then completes once", async (t) => {
  const f = fixture(t, { harvest: { id: "recovered", ready_at: 12500 } });
  await f.ui.pack();
  await f.ui.pack();
  t.mock.timers.tick(2749);
  assert.equal(f.requests.filter((r) => r.data?.action === "finishGather").length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(f.requests.filter((r) => r.data?.action === "finishGather").map((r) => r.data), [{ action: "finishGather", harvestId: "recovered" }]);
  assert.deepEqual(f.cues, ["woodcutting"]);
});
