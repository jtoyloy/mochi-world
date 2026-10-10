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
function fixture(t, changes = {}, { wrapButtons = false } = {}) {
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
  const commerceState = { woodSales: 0 };
  let respond = async (data) => data.action === "gather"
    ? { id: "harvest", durationMs: 1000 }
    : { itemId: "softwood", xp: 12, kind: "woodcutting" };
  const shell = new Element("section");
  const ui = adventureUI({
    shell,
    chooseCompanion: async () => notices.push("choose companion"),
    bridge: { join: (room) => notices.push("travel:" + room), selfId: "player", scene: { data: new Map([["player", { x: 0, y: 0 }]]), audio: { cue: (cue) => cues.push(cue) } } },
    request: async (path, data) => {
      requests.push({ path, data });
      return data ? respond(data) : path === "/api/adventure/commerce" ? commerceState : state;
    },
    dialog: (title, invoker) => { const d = new Element("dialog"); d.invoker = invoker; dialogs.push(d); return d; },
    btn: (text, onclick) => {
      const control = new Element("button", text);
      control.onclick = wrapButtons ? async () => {
        control.disabled = true;
        try { await onclick(control); }
        catch (error) { notices.push(error.message); }
        finally { control.disabled = false; }
      } : onclick;
      return control;
    },
    element: (tag, text) => new Element(tag, text),
    notice: (text) => notices.push(text), refresh: async () => {},
  });
  t.after(() => { ui.destroy(); Object.assign(globalThis, originals); });
  return { ui, shell, state, commerceState, dialogs, requests, notices, cues, setRespond(fn) { respond = fn; } };
}
const button = (d, text) => d.children.find((e) => e.tagName === "BUTTON" && e.textContent === text);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("learning a spell confirms once and refreshes consumed inventory and learned controls", async t => {
  const f = fixture(t, {}, { wrapButtons: true });
  f.state.inventory.push({ item_id: "ice-shard", quantity: 1 });
  await f.ui.pack();
  const learn = button(f.dialogs[0], "Learn Ice Shard");
  let finish;
  f.setRespond(async input => {
    assert.deepEqual(input, { action: "learnSpell", spellId: "ice-shard" });
    await new Promise(resolve => { finish = resolve; });
    f.state.player.spells.push("ice-shard");
    f.state.inventory = f.state.inventory.filter(i => i.item_id !== "ice-shard");
    return { learned: true };
  });
  const pending = learn.onclick();
  assert.equal(learn.disabled, true);
  await learn.onclick();
  assert.equal(f.requests.filter(r => r.data).length, 1);
  finish(); await pending;
  assert.equal(f.dialogs[0].closed, true);
  assert.ok(button(f.dialogs[1], "Ice Shard"));
  assert.equal(button(f.dialogs[1], "Learn Ice Shard"), undefined);
  assert.ok(!f.dialogs[1].children.some(e => e.textContent === "ice shard ×1"));
  assert.deepEqual(f.notices, ["Learned Ice Shard."]);
});

test("Adventure launcher survives asynchronous creation and successful spell/item replacement", async t => {
  const f = fixture(t, {}, { wrapButtons: true });
  f.state.inventory.push({ item_id: "ice-shard", quantity: 1 });
  const hotbar = f.shell.children[0].children.find(e => e.children.some(b => b.textContent === "Adventure"));
  const launcher = button(hotbar, "Adventure");
  await launcher.onclick();
  assert.equal(f.dialogs[0].invoker, launcher);
  f.setRespond(async input => {
    if (input.action === "learnSpell") f.state.player.spells.push("ice-shard");
    return {};
  });
  await button(f.dialogs[0], "Learn Ice Shard").onclick();
  assert.equal(f.dialogs[1].invoker, launcher);
  await button(f.dialogs[1], "Use mana potion").onclick();
  assert.equal(f.dialogs[2].invoker, launcher);
  assert.equal(launcher.disabled, false);
});

test("rejected spell learning retains its scroll and leaves the control retryable", async t => {
  const f = fixture(t, {}, { wrapButtons: true });
  f.state.inventory.push({ item_id: "ice-shard", quantity: 1 });
  await f.ui.pack();
  f.setRespond(async () => { throw new Error("Session expired"); });
  const learn = button(f.dialogs[0], "Learn Ice Shard");
  await learn.onclick();
  assert.equal(learn.disabled, false);
  assert.equal(f.dialogs[0].closed, undefined);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.state.inventory.at(-1).quantity, 1);
  assert.deepEqual(f.notices, ["Session expired"]);
});

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


test("stale pack finish and cancel controls cannot affect a newer harvest", async (t) => {
  const f = fixture(t, { harvest: { id: "old", ready_at: 11000 } });
  await f.ui.pack();
  const stale = f.dialogs[0];
  f.setRespond(async (data) => data.action === "gather"
    ? { id: "new", durationMs: 1000 }
    : { itemId: "softwood", xp: 12, kind: "woodcutting" });
  await f.ui.gatherNode({ id: "forest-soft", x: 0, y: 0, kind: "woodcutting", name: "Grove" });
  await assert.rejects(button(stale, "Finish gathering").onclick(), /activity has changed/);
  await assert.rejects(button(stale, "Cancel gathering").onclick(), /activity has changed/);
  assert.equal(f.requests.filter((r) => ["finishGather", "cancelGather"].includes(r.data?.action)).length, 0);
  t.mock.timers.tick(1250);
  await flush();
  assert.deepEqual(f.requests.filter((r) => r.data?.action === "finishGather").map((r) => r.data.harvestId), ["new"]);
});


test("beginner pack offers actual companion and travel controls derived from server state", async (t) => {
  const f = fixture(t);
  f.state.player.starter = true;
  await f.ui.pack();
  await button(f.dialogs[0], "Choose a Mochi").onclick();
  assert.ok(f.notices.includes("choose companion"));
  f.state.player.activePet = "server-owned-pet";
  await f.ui.pack();
  await button(f.dialogs[1], "Travel to Training Yard").onclick();
  assert.ok(f.notices.includes("travel:yard"));
  assert.equal(f.requests.filter((r) => r.data).length, 0);
});


test("persisted Coins wood sale advances guide even when optional token treasury is paused", async (t) => {
  const f = fixture(t, { rewards: { enabled: false, woodSales: 0 } });
  Object.assign(f.state.player, { starter: true, activePet: "owned" });
  Object.assign(f.state.player.progress, { kills: 1, woodcutting: 1 });
  f.commerceState.woodSales = 1;
  await f.ui.pack();
  assert.ok(button(f.dialogs[0], "Travel to Trading Hall"));
  assert.ok(!f.dialogs[0].children.some((e) => e.textContent?.includes("sale remains unfinished")));
  assert.equal(f.requests.filter((r) => r.data).length, 0);
});

test("partial live progress hydrates full journey facts once and remains complete after dialog closure", async t => {
  const f = fixture(t, { rewards: { enabled: false, woodSales: 0 } });
  Object.assign(f.state.player, { starter: true, activePet: "owned" });
  Object.assign(f.state.player.progress, { trainingDummy: 1, kills: 1, woodcutting: 1, tradingHall: 1 });
  f.commerceState.woodSales = 1;
  const guidance = f.shell.children[0].children.at(-1);
  const live = { player: { hp: 100, mp: 60, petHp: 80, stats: f.state.player.stats,
    progress: { ...f.state.player.progress } }, serverTime: 11000 };
  // Exact live-frame shape omits starter, activePet, inventory and sale history.
  f.ui.event("adventureState", live);
  f.ui.event("adventureState", live);
  assert.equal(guidance.textContent, "First adventures");
  await flush();
  assert.equal(guidance.textContent, "First adventures complete");
  assert.deepEqual(f.requests.map(r => r.path), ["/api/adventure", "/api/adventure/commerce"]);
  await f.ui.pack();
  f.dialogs[0].close();
  const requests = f.requests.length;
  f.ui.event("adventureState", live);
  assert.equal(guidance.textContent, "First adventures complete");
  assert.equal(f.requests.length, requests);
});

test("hydrated guide applies live Trading Hall progress while preserving starter companion and sale facts", async t => {
  const f = fixture(t);
  Object.assign(f.state.player, { starter: true, activePet: "owned" });
  Object.assign(f.state.player.progress, { kills: 1, woodcutting: 1 });
  f.commerceState.woodSales = 1;
  await f.ui.pack();
  const guidance = f.shell.children[0].children.at(-1), requests = f.requests.length;
  assert.equal(guidance.textContent, "Next: Discover the Trading Hall");
  f.dialogs[0].close();
  f.ui.event("adventureState", { player: { hp: 100, mp: 60, petHp: 80, stats: f.state.player.stats,
    progress: { kills: 1, woodcutting: 1, tradingHall: 1 } }, serverTime: 11000 });
  assert.equal(guidance.textContent, "First adventures complete");
  assert.equal(f.requests.length, requests);
});
