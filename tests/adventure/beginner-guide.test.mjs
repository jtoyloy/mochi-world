import test from "node:test";
import assert from "node:assert/strict";
import { beginnerJourney } from "../../web/js/game/beginner-guide.js";

test("beginner journey follows persisted starter companion practice combat gathering sale and hall facts", () => {
  const state = { player: { progress: {} }, rewards: { enabled: true } };
  for (const [id, advance] of [
    ["starter", () => state.player.starter = true],
    ["companion", () => state.player.activePet = "owned-pet"],
    ["practice", () => state.player.progress.trainingDummy = 1],
    ["fight", () => state.player.progress.kills = 1],
    ["wood", () => state.player.progress.woodcutting = 1],
    ["sell", () => state.rewards.woodSales = 1],
    ["hall", () => state.player.progress.tradingHall = 1],
  ]) {
    assert.equal(beginnerJourney(state).next.id, id);
    advance();
  }
  assert.equal(beginnerJourney(state).complete, true);
  assert.deepEqual(beginnerJourney(JSON.parse(JSON.stringify(state))), beginnerJourney(state));
});

test("returning combat players bypass introductory dummy without fabricated dummy credit", () => {
  const state = { player: { starter: true, activePet: "pet", progress: { kills: 2 } } };
  assert.equal(beginnerJourney(state).next.id, "wood");
  assert.equal(state.player.progress.trainingDummy, undefined);
});

test("paused token sale remains incomplete but does not block free exploration", () => {
  const state = { player: { starter: true, activePet: "pet", progress: { kills: 1, woodcutting: 1 } }, rewards: { enabled: false, woodSales: 0 } };
  const journey = beginnerJourney(state);
  assert.equal(journey.next.id, "hall");
  assert.equal(journey.steps.find((s) => s.id === "sell").done, false);
  assert.equal(journey.complete, false);
  state.player.progress.tradingHall = 1;
  assert.equal(beginnerJourney(state).next, undefined);
  assert.equal(beginnerJourney(state).complete, false);
});

test("unclaimed balances or claims cannot fake a wood sale", () => {
  const state = { player: { starter: true, activePet: "pet", progress: { kills: 1, woodcutting: 1 } }, rewards: { enabled: true, amountRaw: "500", claims: [{ status: "paid" }], sources: [{ source: "fishing" }] } };
  assert.equal(beginnerJourney(state).next.id, "sell");
});
