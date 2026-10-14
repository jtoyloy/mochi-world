import test from "node:test";
import assert from "node:assert/strict";
import { commerceUI } from "../../web/js/game/CommerceUI.js";
class Element {
  constructor(tag, text) { this.tagName = tag; this.textContent = text; this.children = []; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  close() { this.closed = true; }
}
function fixture(savedStorage) {
  const dialogs = [], requests = [], notices = [];
  const catalog = { userId: "user-a", currency: "Coins", coins: 80, woodSales: 0,
    shops: [{ id: "apothecary", name: "Sage", items: [{ id: "small-potion", name: "Small Potion", price: 20, maxQuantity: 10, owned: 0 }] }],
    buyers: [{ id: "wood", name: "Alder", items: [{ id: "softwood", name: "Softwood", price: 10, owned: 3 }] }] };
  const values = new Map();
  const storage = savedStorage ?? { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  let failure = false, serverOwner = "user-a", mutations = 0;
  const ui = commerceUI({ storage,
    request: async (path, data) => {
      requests.push({ path, data });
      if (!data) return catalog;
      if (data.expectedOwner !== serverOwner) throw Object.assign(new Error("Sign in to the receipt owner account"), { status: 401 });
      if (failure) throw failure === true ? new Error("Response unavailable") : failure;
      mutations++;
      return { message: "Recorded Coins transaction" };
    },
    dialog: (title, invoker) => { const d = new Element("dialog"); d.invoker = invoker; dialogs.push(d); return d; },
    element: (tag, text) => new Element(tag, text),
    btn: (text, onclick) => Object.assign(new Element("button", text), { onclick }),
    bridge: { scene: { audio: { cue() {} }, adventure: { roomId: "town" } }, join() {} },
    notice: (message) => notices.push(message),
    afterSale: () => notices.push("refresh guide"),
    openTokenBuyer: (id) => notices.push("optional token buyer:" + id),
    openTokenShop: (id) => notices.push("optional token shop:" + id),
  });
  return { ui, catalog, storage, dialogs, requests, notices, get mutations() { return mutations; }, setServerOwner(value) { serverOwner = value; }, setFailure(value) { failure = value; } };
}
const button = (d, label) => d.children.find((e) => e.tagName === "button" && e.textContent === label);

test("Coins directory and post-purchase replacement retain the outer launcher", async () => {
  const f = fixture(), launcher = { disabled: true };
  await f.ui.shops(launcher);
  assert.equal(f.dialogs[0].invoker, launcher);
  await button(f.dialogs[0], "Sage").onclick();
  assert.equal(f.dialogs[1].invoker, launcher);
  await button(f.dialogs[1], "Buy Small Potion for Coins").onclick();
  assert.equal(f.dialogs[2].invoker, launcher);
});

test("Coins supplies dispatch separate gameplay checkout and reuse receipt on response retry", async () => {
  const f = fixture();
  await f.ui.shop("apothecary");
  const d = f.dialogs[0], buy = button(d, "Buy Small Potion for Coins");
  f.setFailure(true);
  await assert.rejects(buy.onclick(), /unavailable/);
  f.setFailure(false);
  await buy.onclick();
  const buys = f.requests.filter((r) => r.data);
  assert.equal(buys.length, 2);
  assert.deepEqual(buys[0], buys[1]);
  assert.equal(buys[0].path, "/api/adventure/commerce/buy");
  assert.deepEqual({ ...buys[0].data, id: undefined }, { vendor: "apothecary", itemId: "small-potion", quantity: 1, expectedOwner: "user-a", id: undefined });
  assert.ok(d.children.some((e) => e.textContent?.includes("80 Coins")));
  assert.ok(button(d, "Optional $MOCHI token market"));
});

test("Coins resource sale validates owned quantity and never dispatches SPL rewards", async () => {
  const f = fixture();
  await f.ui.buyer("wood");
  const d = f.dialogs[0], sell = button(d, "Sell selected for Coins");
  await assert.rejects(sell.onclick(), /Choose owned/);
  const field = d.children.find((e) => e.tagName === "input");
  field.value = 2; field.oninput();
  assert.ok(d.children.some((e) => e.textContent === "Sale value: 20 Coins"));
  await sell.onclick();
  const sale = f.requests.find((r) => r.data);
  assert.equal(sale.path, "/api/adventure/commerce/sell");
  assert.deepEqual(sale.data.items, { softwood: 2 });
  assert.ok(f.notices.includes("refresh guide"));
  assert.ok(!f.requests.some((r) => r.path === "/api/adventure/sell"));
});

test("optional token buyer opens only through explicit separate choice", async () => {
  const f = fixture();
  await f.ui.buyer("wood");
  await button(f.dialogs[0], "Optional $MOCHI token rewards").onclick();
  assert.deepEqual(f.notices, ["optional token buyer:wood"]);
  assert.equal(f.requests.filter((r) => r.data).length, 0);
});

test("out-of-range purchase quantities cannot submit economic intents", async () => {
  const f = fixture();
  await f.ui.shop("apothecary");
  const d = f.dialogs[0];
  d.children.find((e) => e.tagName === "input").value = 11;
  await assert.rejects(button(d, "Buy Small Potion for Coins").onclick(), /valid purchase/);
  assert.equal(f.requests.filter((r) => r.data).length, 0);
});


test("closing and remounting restores exact pending receipt and blocks a silent second purchase", async () => {
  const first = fixture();
  await first.ui.shop("apothecary");
  first.setFailure(true);
  await assert.rejects(button(first.dialogs[0], "Buy Small Potion for Coins").onclick());
  const sent = first.requests.find((r) => r.data);
  first.dialogs[0].close();
  const restored = fixture(first.storage);
  await restored.ui.shop("apothecary");
  const d = restored.dialogs[0];
  assert.equal(button(d, "Buy Small Potion for Coins"), undefined);
  await button(d, "Retry saved Coins transaction").onclick();
  assert.deepEqual(restored.requests.find((r) => r.data), sent);
  assert.equal(restored.storage.getItem("mochi:pending-commerce:user-a"), null);
});

test("5xx ambiguity preserves receipt while definitive rejection clears it", async () => {
  const f = fixture();
  await f.ui.shop("apothecary");
  const buy = button(f.dialogs[0], "Buy Small Potion for Coins");
  f.setFailure(Object.assign(new Error("Database unavailable"), { status: 503 }));
  await assert.rejects(buy.onclick());
  assert.ok(f.storage.getItem("mochi:pending-commerce:user-a"));
  f.setFailure(Object.assign(new Error("Not enough Coins"), { status: 400 }));
  await assert.rejects(buy.onclick());
  assert.equal(f.storage.getItem("mochi:pending-commerce:user-a"), null);
});

test("another account neither recovers nor dispatches the saved owner's receipt", async () => {
  const first = fixture();
  await first.ui.shop("apothecary");
  first.setFailure(true);
  await assert.rejects(button(first.dialogs[0], "Buy Small Potion for Coins").onclick());
  const other = fixture(first.storage);
  other.catalog.userId = "user-b";
  await other.ui.shop("apothecary");
  assert.ok(button(other.dialogs[0], "Buy Small Potion for Coins"));
  assert.equal(button(other.dialogs[0], "Retry saved Coins transaction"), undefined);
  // A panel opened by A must also revalidate owner just before retrying.
  first.catalog.userId = "user-b";
  const count = first.requests.filter((r) => r.data).length;
  await assert.rejects(button(first.dialogs[0], "Buy Small Potion for Coins").onclick(), /another account/);
  assert.equal(first.requests.filter((r) => r.data).length, count);
  assert.ok(first.storage.getItem("mochi:pending-commerce:user-a"));
});


test("auth expiry timeout and throttling retain an unresolved receipt for later recovery", async () => {
  const f = fixture();
  await f.ui.shop("apothecary");
  const buy = button(f.dialogs[0], "Buy Small Potion for Coins");
  for (const status of [401, 408, 429]) {
    f.setFailure(Object.assign(new Error("Retry later"), { status }));
    await assert.rejects(buy.onclick());
    assert.ok(f.storage.getItem("mochi:pending-commerce:user-a"));
  }
  assert.equal(new Set(f.requests.filter((r) => r.data).map((r) => r.data.id)).size, 1);
});


test("server expected-owner binding refuses cookie switch between catalog check and POST", async () => {
  const f = fixture();
  await f.ui.shop("apothecary");
  const buy = button(f.dialogs[0], "Buy Small Potion for Coins");
  // The GET still reports A, but the POST is authenticated as B.
  f.setServerOwner("user-b");
  await assert.rejects(buy.onclick(), /receipt owner/);
  assert.equal(f.mutations, 0);
  const saved = JSON.parse(f.storage.getItem("mochi:pending-commerce:user-a"));
  assert.equal(saved.payload.expectedOwner, "user-a");
  f.setServerOwner("user-a");
  await buy.onclick();
  assert.equal(f.mutations, 1);
  assert.equal(new Set(f.requests.filter((r) => r.data).map((r) => r.data.id)).size, 1);
});
