import test from "node:test";
import assert from "node:assert/strict";
import { commerceUI } from "../../web/js/game/CommerceUI.js";
class Element {
  constructor(tag, text) { this.tagName = tag; this.textContent = text; this.children = []; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  close() { this.closed = true; }
}
function fixture() {
  const dialogs = [], requests = [], notices = [];
  const catalog = { currency: "Coins", coins: 80, woodSales: 0,
    shops: [{ id: "apothecary", name: "Sage", items: [{ id: "small-potion", name: "Small Potion", price: 20, maxQuantity: 10, owned: 0 }] }],
    buyers: [{ id: "wood", name: "Alder", items: [{ id: "softwood", name: "Softwood", price: 10, owned: 3 }] }] };
  let failure = false;
  const ui = commerceUI({
    request: async (path, data) => {
      requests.push({ path, data });
      if (!data) return catalog;
      if (failure) throw new Error("Response unavailable");
      return { message: "Recorded Coins transaction" };
    },
    dialog: () => { const d = new Element("dialog"); dialogs.push(d); return d; },
    element: (tag, text) => new Element(tag, text),
    btn: (text, onclick) => Object.assign(new Element("button", text), { onclick }),
    bridge: { scene: { audio: { cue() {} }, adventure: { roomId: "town" } }, join() {} },
    notice: (message) => notices.push(message),
    afterSale: () => notices.push("refresh guide"),
    openTokenBuyer: (id) => notices.push("optional token buyer:" + id),
    openTokenShop: (id) => notices.push("optional token shop:" + id),
  });
  return { ui, catalog, dialogs, requests, notices, setFailure(value) { failure = value; } };
}
const button = (d, label) => d.children.find((e) => e.tagName === "button" && e.textContent === label);

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
  assert.deepEqual({ ...buys[0].data, id: undefined }, { vendor: "apothecary", itemId: "small-potion", quantity: 1, id: undefined });
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
