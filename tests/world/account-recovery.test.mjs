import { test } from "node:test";
import assert from "node:assert/strict";
import { accountRecovery } from "../../web/js/world/account-recovery.js";
import { accountGate } from "../../web/js/world/account.js";

test("a refused save retains cleanup and can be retried after same-account authentication", async () => {
  const retainedPanel = { unsaved: "brain state" }, calls = [];
  let fail = true;
  const recover = accountRecovery({ ownerId: "original", identify: async () => "original",
    cleanup: async () => { calls.push("save"); if (fail) throw new Error("The brain could not save. Keep this panel open and retry."); },
    enter: async () => { calls.push("enter"); retainedPanel.unsaved = null; },
  });
  await assert.rejects(recover({ userId: "original" }), /brain could not save/);
  assert.equal(retainedPanel.unsaved, "brain state");
  assert.deepEqual(calls, ["save"]);
  fail = false;
  await recover({ userId: "original" });
  assert.deepEqual(calls, ["save", "save", "enter"]);
});

test("different-account login or a changed cookie cannot clean up or enter the retained room", async () => {
  let identity = "original", cleanups = 0, enters = 0, checks = 0;
  const recover = accountRecovery({ ownerId: "original", identify: async () => { checks++; return identity; },
    cleanup: async () => cleanups++, enter: async () => enters++,
  });
  await assert.rejects(recover({ userId: "other" }), error => error.accountMismatch && /original account/.test(error.message));
  assert.equal(checks, 0);
  identity = "other";
  await assert.rejects(recover({ userId: "original" }), error => error.accountMismatch && /changed/.test(error.message));
  assert.equal(cleanups, 0); assert.equal(enters, 0);
  identity = "original";
  await recover({ userId: "original" });
  assert.equal(cleanups, 1); assert.equal(enters, 1);
});

test("failed identity refresh never attempts a save, and concurrent recovery cannot double-clean", async () => {
  let reject = true, release, cleanups = 0;
  const recover = accountRecovery({ ownerId: "original", identify: async () => { if (reject) throw new Error("Session expired"); return "original"; },
    cleanup: async () => { cleanups++; await new Promise(done => { release = done; }); }, enter: async () => {},
  });
  await assert.rejects(recover({ userId: "original" }), /Session expired/);
  assert.equal(cleanups, 0);
  reject = false;
  const first = recover({ userId: "original" });
  await Promise.resolve();
  await assert.rejects(recover({ userId: "original" }), /already in progress/);
  release(); await first;
  assert.equal(cleanups, 1);
});

function documentFixture(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => ({ tag, children: [], value: "", hidden: false,
    setAttribute() {}, focus() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  }) };
  t.after(() => { globalThis.document = previous; });
  return document.createElement("div");
}

test("account gate renders before any cleanup and exposes a save retry without repeating login", async t => {
  const host = documentFixture(t);
  let requests = 0, attempts = 0;
  accountGate(host, { recovering: true, request: async () => { requests++; return { userId: "original" }; },
    ready: async login => { assert.equal(login.userId, "original"); attempts++; if (attempts === 1) throw new Error("Brain save refused"); },
  });
  assert.equal(attempts, 0);
  assert.match(host.children[0].children[1].textContent, /unsaved brain are retained/);
  const form = host.children[0].children[2];
  const retry = form.children.find(child => child.textContent === "Retry saving and continue");
  const error = form.children.find(child => child.tag === "p" && !child.id);
  await form.onsubmit({ preventDefault() {} });
  assert.equal(error.textContent, "Brain save refused");
  assert.equal(retry.hidden, false);
  await retry.onclick();
  assert.equal(requests, 1); assert.equal(attempts, 2);
});

test("wrong-account rejection leaves sign-in available and does not offer a save against that account", async t => {
  const host = documentFixture(t);
  accountGate(host, { recovering: true, request: async () => ({ userId: "other" }),
    ready: accountRecovery({ ownerId: "original", identify: async () => { assert.fail("must not verify mismatched login"); },
      cleanup: async () => assert.fail("must not save"), enter: async () => assert.fail("must not enter"), }),
  });
  const form = host.children[0].children[2];
  await form.onsubmit({ preventDefault() {} });
  assert.equal(form.children.find(child => child.textContent === "Sign in").disabled, false);
  assert.equal(form.children.find(child => child.textContent === "Retry saving and continue").hidden, true);
});
