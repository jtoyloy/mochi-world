import test from "node:test";
import assert from "node:assert/strict";
import { paymentRecovery, tokenCheckout } from "../../web/js/game/ui/TokenUI.js";

class Element {
  constructor(tag, text = "") { this.tagName = tag; this.textContent = text; this.children = []; this.attributes = {}; this.listeners = {}; this.value = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  showModal() {}
  close() { this.onclose?.(); this.listeners.close?.(); }
  remove() { this.removed = true; }
}
const all = node => [node, ...node.children.flatMap(all)];
const find = (node, text) => all(node).find(child => child.textContent === text);
const payment = (id, changes = {}) => ({ id, itemName: "Small Potion", quantity: 1, formatted: "20", createdAt: "2026-10-14T10:00:00Z", message: "Payment verified; delivery pending.", paymentVerified: true, requiresSignature: false, canRetry: true, ...changes });
function fixture(respond) {
  const app = new Element("main"), requests = [];
  const request = async (path, data) => { requests.push({path, data}); return respond(path, data); };
  const element = (tag, text) => new Element(tag, text);
  const control = (text, action, status) => Object.assign(element("button", text), {onclick: async () => {
    try { await action(); } catch (error) { status.textContent = error.message; }
  }});
  return { app, requests, options: {request, element, control} };
}

test("verified recovery retries delivery without a signature or another payment and refreshes the owned list", async () => {
  let delivered = false;
  const f = fixture((path, data) => {
    if (data) { assert.deepEqual(data, {intentId: "paid"}); delivered = true; return {message: "Item delivered once."}; }
    return {payments: delivered ? [] : [payment("paid")], nextCursor: null};
  });
  await paymentRecovery(f.app, f.options);
  assert.equal(all(f.app).some(e => e.tagName === "input" || e.tagName === "a"), false);
  await find(f.app, "Retry item delivery").onclick();
  assert.equal(f.requests.filter(r => r.data).length, 1);
  assert.equal(f.requests[1].path, "/api/token/verify");
  assert.ok(find(f.app, "No open token checkouts."));
  assert.ok(find(f.app, "Item delivered once."));
});

test("unverified existing payments accept a signature while reconciliation has no automatic grant control", async () => {
  const f = fixture((_path, data) => data ? {message: "Payment recorded for reconciliation."} : {
    payments: [payment("unverified", {paymentVerified: false, requiresSignature: true}), payment("held", {canRetry: false, message: "Payment recorded. Reconciliation required."})], nextCursor: null,
  });
  await paymentRecovery(f.app, f.options);
  const input = all(f.app).find(e => e.tagName === "input");
  assert.match(input.attributes["aria-label"], /Existing payment signature/);
  input.value = "  existing-signature  ";
  assert.equal(all(f.app).filter(e => e.textContent === "Verify existing payment").length, 1);
  assert.equal(find(f.app, "Retry item delivery"), undefined);
  await find(f.app, "Verify existing payment").onclick();
  assert.deepEqual(f.requests.find(r => r.data).data, {intentId: "unverified", signature: "existing-signature"});
  assert.ok(find(f.app, "Payment recorded. Reconciliation required."));
});

test("cursor pagination, mock recovery and readable load failures retain a refresh path", async () => {
  let fail = true;
  const f = fixture(path => {
    if (fail) throw new Error("Connection unavailable");
    return path.includes("?after=") ? {mock: true, payments: [payment("mock")], nextCursor: null}
      : {payments: [payment("first")], nextCursor: "opaque+/="};
  });
  await paymentRecovery(f.app, f.options);
  assert.ok(find(f.app, "Connection unavailable"));
  fail = false;
  await find(f.app, "Refresh checkouts").onclick();
  await find(f.app, "Load more checkouts").onclick();
  assert.equal(f.requests.at(-1).path, "/api/token/payments?after=opaque%2B%2F%3D");
  assert.ok(find(f.app, "Complete test checkout"));
  assert.ok(find(f.app, "20 TEST $MOCHI"));
  assert.equal(find(f.app, "Load more checkouts").hidden, true);
});

test("a delivered purchase with an unavailable list refresh retains success and a safe refresh control", async () => {
  let delivered = false, offline = false;
  const f = fixture((_path, data) => {
    if (data) { delivered = true; offline = true; return {message: "Item delivered once."}; }
    if (offline) throw new Error("Checkout list unavailable");
    return {payments: delivered ? [] : [payment("paid")], nextCursor: null};
  });
  await paymentRecovery(f.app, f.options);
  await find(f.app, "Retry item delivery").onclick();
  assert.ok(find(f.app, "Item delivered once."));
  assert.ok(find(f.app, "Checkout list unavailable"));
  assert.equal(f.requests.filter(r => r.data).length, 1);
  offline = false;
  await find(f.app, "Refresh checkouts").onclick();
  assert.ok(find(f.app, "No open token checkouts."));
  assert.equal(f.requests.filter(r => r.data).length, 1);
});

test("closing real checkout preserves its recovery intent while mock cancellation remains simulated", async () => {
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  try {
    for (const mock of [false, true]) {
      const body = new Element("body"), requests = [];
      globalThis.document = {body, createElement: tag => new Element(tag)};
      globalThis.fetch = async (path) => {
        requests.push(path);
        return {ok: true, json: async () => ({id: "owned", formatted: "1", mock, network: "devnet", recipient: "recipient", mint: "mint", memo: "mochi:owned"})};
      };
      const closed = tokenCheckout({itemId: "small-potion"});
      await new Promise(resolve => setImmediate(resolve));
      const dialog = body.children[0];
      assert.ok(dialog);
      await find(dialog, mock ? "Cancel checkout" : "Close checkout").onclick();
      await closed;
      assert.equal(requests.includes("/api/token/cancel"), mock);
    }
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch; }
});

test("known-paid checkout removes the payment link and retries only delivery without resending a signature", async () => {
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  try {
    const body = new Element("body"), verifies = [];
    globalThis.document = {body, createElement: tag => new Element(tag)};
    globalThis.fetch = async (path, options) => ({ok: true, json: async () => {
      if (path === "/api/token/intent") return {id: "owned", formatted: "1", mock: false, network: "devnet", recipient: "recipient", mint: "mint", memo: "mochi:owned"};
      assert.equal(path, "/api/token/verify");
      verifies.push(JSON.parse(options.body));
      return verifies.length === 1 ? {status: "verified", message: "Payment verified. Make room before delivery."}
        : {status: "confirmed", message: "Item delivered once."};
    }});
    const closed = tokenCheckout({itemId: "small-potion"});
    await new Promise(resolve => setImmediate(resolve));
    const dialog = body.children[0], input = all(dialog).find(e => e.tagName === "input");
    input.value = " existing-signature ";
    const verify = find(dialog, "Verify & deliver item"), link = find(dialog, "Open payment in your wallet");
    await verify.onclick();
    assert.equal(link.removed, true); assert.equal(input.removed, true);
    assert.equal(verify.textContent, "Retry item delivery");
    assert.ok(find(dialog, "Payment verified. Make room before delivery."));
    await verify.onclick();
    assert.deepEqual(verifies, [{intentId: "owned", signature: "existing-signature"}, {intentId: "owned"}]);
    assert.equal(verify.removed, true);
    await find(dialog, "Close checkout").onclick(); await closed;
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch; }
});

test("lost verification response keeps retries on the existing transfer without offering another payment", async () => {
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  try {
    const body = new Element("body"), verifies = [];
    globalThis.document = {body, createElement: tag => new Element(tag)};
    globalThis.fetch = async (path, options) => {
      if (path === "/api/token/intent") return {ok: true, json: async () => ({id: "owned", formatted: "1", mock: false, network: "devnet", recipient: "recipient", mint: "mint", memo: "mochi:owned"})};
      assert.equal(path, "/api/token/verify");
      verifies.push(JSON.parse(options.body));
      assert.equal(find(body, "Open payment in your wallet").removed, true);
      if (verifies.length === 1) throw new Error("Verification response lost");
      return {ok: true, json: async () => ({status: "confirmed", message: "Item delivered once."})};
    };
    const closed = tokenCheckout({itemId: "small-potion"});
    await new Promise(resolve => setImmediate(resolve));
    const dialog = body.children[0], input = all(dialog).find(e => e.tagName === "input");
    const verify = find(dialog, "Verify & deliver item"), link = find(dialog, "Open payment in your wallet");
    await verify.onclick();
    assert.equal(verifies.length, 0);
    assert.equal(link.removed, undefined);
    assert.ok(find(dialog, "Paste the signature of the payment you already sent."));
    input.value = " existing-signature ";
    await verify.onclick();
    assert.equal(link.removed, true);
    assert.equal(input.removed, undefined);
    assert.equal(verify.disabled, false);
    assert.ok(find(dialog, "Verification response lost"));
    await verify.onclick();
    assert.deepEqual(verifies, Array.from({length: 2}, () => ({intentId: "owned", signature: "existing-signature"})));
    assert.equal(verify.removed, true);
    await find(dialog, "Close checkout").onclick(); await closed;
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch; }
});
