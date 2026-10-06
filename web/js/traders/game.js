import {
  newPortfolio,
  portfolioValue,
  markPortfolio,
  executePaperTrade,
  tradingReward,
  drawdown,
  clamp,
} from "./trading.js";
import { MarketService, ASSETS } from "./market.js";
import {
  newPersonality,
  petStats,
  interact,
  updatePersonality,
  applyTradeMood,
} from "./pet.js";
import { newEconomy, getUnlockedTradingFeatures } from "./economy.js";
import { ITEMS as CATALOG } from "../world/catalog.js";
const ITEMS = CATALOG.map((x) => ({
  ...x,
  category: x.legacyCategory,
  price: x.baseValue,
}));
import { TemplateNarrator } from "./narrator.js";
import { tradingObservations, translateAction } from "./brain.js";
import { MOCHI_ID, loadRecord, roomToken } from "./persistence.js";
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 0.01 ? 8 : 2,
  }).format(n);
const el = (id) => document.getElementById(id);
function element(tag, text, className) {
  const x = document.createElement(tag);
  x.textContent = text;
  if (className) x.className = className;
  return x;
}
export class TradingGame {
  constructor() {
    this.state = {
      schema: "mochi-traders/1",
      mochiId: MOCHI_ID,
      name: "Momo",
      portfolio: newPortfolio(),
      personality: newPersonality(),
      economy: newEconomy(),
      trades: [],
      assetIndex: 0,
      step: 0,
      nextDecisionAt: 0,
      pending: null,
    };
    this.snapshots = [];
    this.mode = "Loading market…";
    this.currentAction = "HOLD";
    this.commentary = "Getting comfortable in my new room.";
    this.debug = {};
    this.narrator = new TemplateNarrator();
    this.interval = 60000;
    this.lastRender = 0;
    this.category = "Food";
    this.period = "all";
    this.ready = false;
    this.buildUI();
  }
  async init() {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Local game server is required");
    const config = await response.json();
    this.development=config.development;
    this.interval = Math.max(1000, config.decisionIntervalMs);
    this.storage = config.storage;
    this.market = new MarketService(config.marketMode);
    const record = await loadRecord();
    if (record?.state?.schema === "mochi-traders/1") this.restore(record.state);
    await this.refresh();
    this.renderShop();
  }
  restore(state) {
    if (state.mochiId !== MOCHI_ID) throw new Error("Mochi identity mismatch");
    this.state = state;
  }
  async refresh() {
    const result = await this.market.refresh(this.state.step);
    this.snapshots = result.snapshots;
    this.mode = result.mode;
    markPortfolio(this.state.portfolio, this.snapshots);
    const dd = drawdown(this.state.portfolio),
      personality = this.state.personality;
    personality.stress = clamp(
      personality.stress +
        Math.max(0, dd - (personality.lastDrawdown ?? 0)) * 20,
      0,
      100,
    );
    personality.lastDrawdown = dd;
  }
  async prepare(now = Date.now()) {
    if (now >= this.state.nextDecisionAt) await this.refresh();
  }
  observations(world, now = Date.now()) {
    updatePersonality(world, this.state.personality, now);
    return tradingObservations(world, this.state, this.snapshots, false);
  }
  async onDecision(answer, obs, world) {
    this.currentAction = "Room care";
    this.debug = {
      brainAction: answer.action[0],
      refused: answer.refused,
      normalizedObservations: obs.slice(223),
    };
  }
  buildUI() {
    const navigate = (path) => {
      history.pushState({}, "", path + location.search);
      this.route();
    };
    document
      .querySelectorAll("[data-route]")
      .forEach((x) => (x.onclick = () => navigate(x.dataset.route)));
    window.addEventListener("popstate", () => this.route());
    el("feedPet").onclick = () => this.openPicker("feed");
    el("playPet").onclick = () => this.openPicker("play");
    el("dressPet").onclick = () => this.openPicker("dress");
    el("petPet").onclick = () => this.interaction("pet");
    el("sleepPet").onclick = () => this.interaction("sleep");
    el("closePicker").onclick = () => el("itemPicker").close();
    const cats = [...new Set(ITEMS.map((x) => x.category))];
    for (const category of cats) {
      const b = element("button", category);
      b.onclick = () => {
        this.category = category;
        this.renderShop();
      };
      el("shopCategories").append(b);
    }
    for (const period of ["today", "all"]) {
      const b = element("button", period === "today" ? "Today" : "All Time");
      b.onclick = () => {
        this.period = period;
        this.renderLeaderboard();
      };
      el("arenaFilters").append(b);
    }
    this.route();
    this.renderShop();
  }
  route() {
    document.querySelectorAll("[data-page]").forEach((x) => (x.hidden = true));
    el("originalRoom").hidden = false;
    el("traderHeader").hidden = true;
    const research =
      new URLSearchParams(location.search).get("research") === "1";
    document.body.classList.toggle("developer-tools", !!this.development);
    document.body.classList.toggle("research", research);
    el("brain").classList.toggle("open", research);
    document.body.classList.toggle("brain-open", research);
    if (window.mochi?.brainView) window.mochi.brainView.open = research;
  }
  async interaction(kind, item) {
    const world = window.mochi?.world;
    if (!world || !this.ready)
      return this.notice("Your Mochi is still waking up.");
    try {
      await window.mochi.save(false);
      const r = await fetch("/api/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mochiId: MOCHI_ID,
          kind,
          itemId: item,
          leaseToken: roomToken(),
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      Object.assign(world, world.constructor.restore(b.world));
      this.state.personality = b.personality;
      const overview = await (await fetch("/api/world")).json();
      this.state.economy.coins = overview.user.coins;
      this.state.economy.inventory = Object.fromEntries(
        overview.inventory
          .filter((x) => x.location === "bag")
          .map((x) => [x.item.id, x.quantity]),
      );
      this.notice(b.message);
      el("itemPicker").close();
      this.render(world);
      await window.mochi.save(false);
    } catch (e) {
      this.notice(e.message);
    }
  }
  openPicker(kind) {
    const host = el("pickerItems");
    host.replaceChildren();
    el("pickerTitle").textContent =
      kind === "dress"
        ? "Dress your Mochi"
        : kind === "feed"
          ? "A little treat?"
          : "Let’s play";
    const e = this.state.economy;
    const items = ITEMS.filter(
      (x) =>
        e.inventory[x.id] &&
        (kind === "dress"
          ? x.slot
          : kind === "feed"
            ? x.category === "Food"
            : x.category === "Toys"),
    );
    if (!items.length)
      host.append(
        element("p", "Your collection is empty. Find something at the shop!"),
      );
    for (const item of items) {
      const b = element(
        "button",
        `${item.icon} ${item.name} ${kind === "feed" ? `×${e.inventory[item.id]}` : ""}`,
      );
      b.onclick = () => {
        if (kind === "dress") {
          fetch("/api/equip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mochiId: MOCHI_ID,
              itemId: item.id,
              slot: item.slot,
              remove: e.equipped[item.slot] === item.id,
            }),
          })
            .then(async (r) => {
              const b = await r.json();
              if (!r.ok) throw new Error(b.error);
              e.equipped[item.slot] =
                e.equipped[item.slot] === item.id ? undefined : item.id;
              this.render(window.mochi.world);
              el("itemPicker").close();
            })
            .catch((e) => this.notice(e.message));
        } else this.interaction(kind, item.id);
      };
      host.append(b);
    }
    el("itemPicker").showModal();
  }
  notice(text) {
    el("gameNotice").textContent = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(
      () => (el("gameNotice").textContent = ""),
      5000,
    );
  }
  renderShop() {
    el("shopItems").textContent = "Visit Market Row in Mochi City to shop.";
  }
  async renderLeaderboard() {
    el("rankings").textContent = "Loading real saved Mochis…";
    try {
      const response = await fetch("/api/leaderboard?period=" + this.period);
      if (!response.ok) throw new Error("Leaderboard unavailable");
      const rows = await response.json();
      el("rankings").replaceChildren();
      if (!rows.length)
        el("rankings").append(
          element(
            "p",
            "No saved results for this period yet. Care for your Mochi and save its life.",
          ),
        );
      for (const [i, r] of rows.entries()) {
        const card = element("article", "", "ranking");
        card.append(
          element("b", `#${i + 1} ${r.name}`),
          element("span", r.owner),
          element("span", money(r.value)),
          element("span", `${r.returnPct.toFixed(2)}%`),
          element("span", `${r.trades} trades`),
          element(
            "span",
            r.winRate === null
              ? "No closed trades"
              : `${r.winRate.toFixed(0)}% wins`,
          ),
        );
        el("rankings").append(card);
      }
    } catch (error) {
      el("rankings").textContent = error.message;
    }
  }
  render(world) {
    if (!world) return;
    const state = this.state,
      p = state.portfolio,
      value = portfolioValue(p);
    const day = new Date().toISOString().slice(0, 10);
    if (state.dailyBaseline?.day !== day) state.dailyBaseline = { day, value };
    state.name = window.mochi?.page.name ?? state.name;
    el("coinBalance").textContent =
      state.economy.coins.toLocaleString() + " Mochi Coins";
    el("petTitle").textContent = state.name + "’s little corner of the world";
    el("petStatus").textContent = world.m.asleep
      ? "Sweet dreams, little trader."
      : state.personality.stress > 45
        ? "A little stressed. Some company would help."
        : "A little curious. A little cuddly. All yours.";
    const stats = petStats(world, state.personality);
    el("gameStats").replaceChildren(
      ...Object.entries(stats)
        .filter(
          ([key]) =>
            document.body.classList.contains("research") ||
            ["Happiness", "Fullness", "Energy"].includes(key),
        )
        .map(([key, v]) => {
          const card = element("div", "", "stat-card");
          card.append(
            element("span", key),
            element("b", String(Math.round(v))),
          );
          const meter = document.createElement("progress");
          meter.max = 100;
          meter.value = v;
          card.append(meter);
          return card;
        }),
    );
    el("portfolioValue").textContent = money(value);
    el("portfolioReturn").textContent =
      `${((value / p.startingBalance - 1) * 100).toFixed(2)}% all-time return`;
    el("cashValue").textContent = money(p.cash);
    el("pnlValue").textContent = money(p.realizedPnl + p.unrealizedPnl);
    el("actionValue").textContent = this.currentAction;
    el("commentary").textContent = this.commentary;
    el("marketLabel").textContent = this.mode;
    el("storageLabel").textContent =
      `${this.storage} · ${MOCHI_ID} · room session`;
    el("positions").replaceChildren(
      ...(p.positions.length
        ? p.positions.map((x) =>
            element(
              "p",
              `${x.symbol} · ${money(x.quantity * x.currentPrice)} · ${(100 * (x.currentPrice / x.averageEntry - 1)).toFixed(2)}%`,
            ),
          )
        : [element("p", "No positions yet. Mochi is finding its feet.")]),
    );
    el("tradeHistory").replaceChildren(
      ...(state.trades.length
        ? state.trades
            .slice(-15)
            .reverse()
            .map((t) =>
              element(
                "p",
                `${t.side} ${t.symbol} · ${t.quantity.toPrecision(5)} at ${money(t.price)} · ${new Date(t.timestamp).toLocaleTimeString()}${t.pnl !== undefined ? ` · P&L ${money(t.pnl)}` : ""}`,
              ),
            )
        : [element("p", "No paper trades yet. Cadence makes every decision.")]),
    );
    el("marketCards").replaceChildren(
      ...this.snapshots.map((s) => {
        const card = element("article", "", "market-card");
        card.append(
          element("h3", s.symbol),
          element("b", money(s.price)),
          element(
            "p",
            `5m ${s.return5m === null ? "Collecting history" : (s.return5m * 100).toFixed(2) + "%"} · 1h ${s.return1h === null ? "Collecting history" : (s.return1h * 100).toFixed(2) + "%"}`,
          ),
          element(
            "p",
            `Volatility ${s.volatility === null ? "Unavailable" : (s.volatility * 100).toFixed(2) + "%"} · Volume 5m ${s.volume5m === null ? "Unavailable" : s.volume5m.toLocaleString()}`,
          ),
          element(
            "small",
            s.source === "mock" ? "SIMULATED MARKET DATA" : "PUBLIC LIVE DATA",
          ),
        );
        return card;
      }),
    );
    el("debugData").textContent = JSON.stringify(this.debug, null, 2);
    el("equippedLabel").textContent =
      Object.values(state.economy.equipped)
        .filter(Boolean)
        .map((id) => ITEMS.find((x) => x.id === id)?.name)
        .join(" · ") || "A fresh outfit awaits";
    el("toolLabel").textContent =
      "Senses: " + [...getUnlockedTradingFeatures(state.economy)].join(", ");
  }
  frame(world, now) {
    if (!this.ready) return;
    if (Date.now() < this.state.personality.sleepUntil) {
      world.m.asleep = true;
      world.setAction(10);
    }
    if (now - this.lastRender > 1000) {
      this.lastRender = now;
      this.render(world);
    }
  }
  drawEquipment(ctx, world) {
    const e = this.state.economy.equipped;
    ctx.save();
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    if (e.hat) ctx.fillText("🧢", world.m.x, world.m.y - 35);
    if (e.glasses) ctx.fillText("👓", world.m.x, world.m.y - 8);
    if (e.shirt) ctx.fillText("👕", world.m.x, world.m.y + 20);
    const slots = this.state.homeSlots ?? {};
    if (e.accessory) ctx.fillText("🧣", world.m.x, world.m.y + 15);
    if (slots.plant) ctx.fillText("🪴", 80, 420);
    if (slots.bed) ctx.fillText("🛏️", 110, 440);
    if (slots.rug) {
      ctx.fillStyle = "#ccb7ee";
      ctx.fillRect(280, 435, 120, 10);
    }
    if (slots.computer) ctx.fillText("🖥️", 520, 420);
    if (slots.toy)
      ctx.fillText(
        ITEMS.find((i) => i.id === slots.toy)?.icon ?? "🧸",
        420,
        410,
      );
    ctx.restore();
  }
}
