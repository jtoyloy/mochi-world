import { MOB_DEFINITIONS } from "./adventure.js";
// Read-only guidance. Only persisted server facts can complete a step.
export function beginnerJourney({ player = {}, rewards = {} } = {}) {
  const progress = player.progress ?? {};
  const fought = Number(progress.kills ?? 0) > 0;
  const steps = [
    { id: "starter", title: "Meet your adventure pack", detail: "Town is safe. Click a path to walk. Your free sword, three potions, fishing rod and axe are in Adventure; the sword starts equipped.", done: player.starter === true },
    { id: "companion", title: "Choose your Mochi", detail: "Open Mochis, adopt your first companion, then choose it to follow you. No wallet is needed to adopt.", action: "companion", done: !!player.activePet },
    { id: "practice", title: "Practice in the Training Yard", detail: "Click the Practice Dummy, walk within sword range and let basic attacks work. Use 1 for your weapon skill; 4 uses a Small Potion.", room: "yard", done: Number(progress.trainingDummy ?? 0) > 0 || fought },
    { id: "fight", title: "Win your first adventure fight", detail: `Travel to Whispering Forest with your Mochi. Click a ${MOB_DEFINITIONS.slime.name} and move close to attack. Your Mochi chooses its own battle actions.`, room: "forest", done: fought },
    { id: "wood", title: "Gather your first wood", detail: "Find the Softwood Grove in the Forest. Click it once to approach, then again to chop. Stay still until your resource and XP arrive.", room: "forest", done: Number(progress.woodcutting ?? 0) > 0 },
    { id: "sell", title: "Visit Alder, the Lumber Buyer", detail: rewards.enabled === false ? "Token resource rewards are paused. Keep your wood; you can still explore and visit the Trading Hall. This sale remains unfinished." : "Return to Town and find Alder south of the plaza. Sell wood for treasury-backed rewards. Real token rewards require a verified wallet; gathering and exploration stay free.", room: "town", done: Number(rewards.woodSales ?? 0) > 0, blocked: rewards.enabled === false },
    { id: "hall", title: "Discover the Trading Hall", detail: "Visit the Trading Hall north of Town. Explore paper trading and meet other players; paper competitions do not trade your real assets.", room: "exchange", done: Number(progress.tradingHall ?? 0) > 0 },
  ];
  const next = steps.find((step) => !step.done && !step.blocked);
  return { steps, next, complete: steps.every((step) => step.done) };
}
