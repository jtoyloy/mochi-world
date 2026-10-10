import { test } from "node:test";
import assert from "node:assert/strict";
import { companionPicker } from "../../web/js/game/CompanionUI.js";

function fixture() {
  const dialogs = [], calls = [], notices = [];
  let world = { mochis: [], activeMochi: null }, closed = false, refresh = async () => world;
  const adoption = new EventTarget();
  const open = companionPicker({
    refresh: () => refresh(),
    request: async (path, data) => calls.push({ path, data }),
    element: (tag, text) => ({ tag, text }),
    btn: (text, click) => ({ text, click }),
    dialog: (title, invoker) => {
      const d = { invoker, children: [], append(...items) { this.children.push(...items); }, close() { this.closed = true; } };
      dialogs.push(d); return d;
    },
    panel: (title, url, invoker) => { adoption.invoker = invoker; return adoption; },
    isClosed: () => closed,
    notice: message => notices.push(message),
  });
  return { open, adoption, dialogs, calls, notices, setWorld(value) { world = value; }, setRefresh(fn) { refresh = fn; }, teardown() { closed = true; } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("companion adoption replacement retains its original launcher through both refreshes", async () => {
  const f = fixture(), launcher = { disabled: true };
  await f.open(launcher);
  assert.equal(f.dialogs[0].invoker, launcher);
  f.dialogs[0].children.find(item => item.text === "Adopt a Mochi").click();
  assert.equal(f.adoption.invoker, launcher);
  f.setWorld({ mochis: [{ id: "pet", name: "Birch" }] });
  f.adoption.dispatchEvent(new Event("close"));
  await flush();
  assert.equal(f.dialogs[1].invoker, launcher);
});

test("adoption return closes stale picker and displays the newly adopted companion once", async () => {
  const f = fixture();
  await f.open();
  f.dialogs[0].children.find(item => item.text === "Adopt a Mochi").click();
  assert.equal(f.dialogs[0].closed, true);
  f.setWorld({ mochis: [{ id: "new-pet", name: "Mochi" }], activeMochi: null });
  f.adoption.dispatchEvent(new Event("close"));
  await flush();
  const picker = f.dialogs[1];
  assert.equal(picker.children.length, 1);
  assert.match(picker.children[0].text, /^Mochi/);
  await picker.children[0].click();
  assert.deepEqual(f.calls, [{ path: "/api/active", data: { mochiId: "new-pet" } }]);
  assert.equal(picker.closed, true);
  f.adoption.dispatchEvent(new Event("close"));
  await flush();
  assert.equal(f.dialogs.length, 2);
});

test("closing adoption during world teardown does not revive the old picker", async () => {
  const f = fixture();
  await f.open();
  f.dialogs[0].children.find(item => item.text === "Adopt a Mochi").click();
  f.teardown();
  f.adoption.dispatchEvent(new Event("close"));
  await flush();
  assert.equal(f.dialogs.length, 1);
});

test("an adoption refresh already in flight cannot recreate a picker after teardown", async () => {
  const f = fixture();
  await f.open();
  f.dialogs[0].children.find(item => item.text === "Adopt a Mochi").click();
  let resolve;
  f.setRefresh(() => new Promise(done => { resolve = done; }));
  f.adoption.dispatchEvent(new Event("close"));
  f.teardown();
  resolve({ mochis: [{ id: "new-pet", name: "Mochi" }] });
  await flush();
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.notices.length, 0);
});

test("an adoption refresh rejected after teardown does not show a stale error", async () => {
  const f = fixture();
  await f.open();
  f.dialogs[0].children.find(item => item.text === "Adopt a Mochi").click();
  let reject;
  f.setRefresh(() => new Promise((resolve, fail) => { reject = fail; }));
  f.adoption.dispatchEvent(new Event("close"));
  f.teardown();
  reject(new Error("Session expired"));
  await flush();
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.notices.length, 0);
});
