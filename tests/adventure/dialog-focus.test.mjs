import test from "node:test";
import assert from "node:assert/strict";
import { restoreDialogInvoker } from "../../web/js/game/dialog-focus.js";

function fixture() {
  let closed;
  const invoker = { isConnected: true, disabled: false, focuses: 0, focus() { this.focuses++; } };
  const document = { open: [], querySelectorAll() { return this.open; } };
  restoreDialogInvoker({ addEventListener(type, callback) { assert.equal(type, "close"); closed = callback; } }, invoker, document);
  return { invoker, document, close: async () => { closed(); await Promise.resolve(); } };
}
test("explicit async dialog invoker is restored only after a confirmed close", async () => {
  const f = fixture();
  f.invoker.disabled = true; // Shared wrapper disables before asynchronous creation.
  assert.equal(f.invoker.focuses, 0); // Refused save/close leaves the modal focused.
  f.invoker.disabled = false;
  await f.close(); assert.equal(f.invoker.focuses, 1);
});
test("replacement modal and detached or disabled invokers cannot steal focus", async () => {
  for (const state of ["replacement", "detached", "disabled"]) {
    const f = fixture();
    if (state === "replacement") f.document.open = [{ contains: () => false }];
    if (state === "detached") f.invoker.isConnected = false;
    if (state === "disabled") f.invoker.disabled = true;
    await f.close(); assert.equal(f.invoker.focuses, 0);
  }
});
test("a nested dialog returns focus to its invoker inside the still-open parent", async () => {
  const f = fixture(); f.document.open = [{ contains: element => element === f.invoker }];
  await f.close(); assert.equal(f.invoker.focuses, 1);
});
