import { TemplateNarrator } from "../../web/js/traders/narrator.js";
import { BrainProcess } from "../../sim/brain_proc.mjs";
import { World, TICK_STEPS } from "../../web/js/world.js";
import { sense } from "../../web/js/senses.js";
import {
  TRADER_SPEC,
  tradingObservations,
  translateAction,
} from "../../web/js/traders/brain.js";
import { MockMarketDataProvider, ASSETS } from "../../web/js/traders/market.js";
import {
  markPortfolio,
  portfolioValue,
  executePaperTrade,
  tradingReward,
  drawdown,
} from "../../web/js/traders/trading.js";
import { applyTradeMood } from "../../web/js/traders/pet.js";
/** A single serial host is reused across pets; every turn loads/saves one owned checkpoint. */
export class BrainService {
  constructor(service, repository, competitions, liveSnapshot) {
    Object.assign(this, { service, repository, competitions, liveSnapshot });
    this.pool = service.pool;
    this.host = null;
    this.running = false;
    this.timer = null;
    this.lastError = null;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(
      () =>
        this.run().catch((error) => {
          this.lastError = error.message;
          console.error("Scheduled Cadence tick failed", error);
        }),
      10000,
    );
    this.timer.unref();
  }
  async snapshots(step) {
    const provider = new MockMarketDataProvider(step, { drift: false });
    if (process.env.MARKET_MODE === "live") {
      try {
        return await Promise.all(
          ASSETS.map((x) => this.liveSnapshot(x.symbol)),
        );
      } catch (error) {
        console.error(
          "Scheduled live provider failed; labeled mock fallback",
          error.message,
        );
      }
    }
    return Promise.all(ASSETS.map((x) => provider.getSnapshot(x.symbol)));
  }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.competitions.settle();
      const rows = (
        await this.pool.query("SELECT id,user_id FROM mochis ORDER BY id")
      ).rows;
      for (const row of rows) {
        try {
          await this.tick(row.id, row.user_id);
        } catch (error) {
          this.lastError = error.message;
          console.error(
            `Scheduled Cadence tick failed for ${row.id}`,
            error.message,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
  async tick(id, userId) {
    await this.service.pet(id);
    return this.service.transaction([userId], async (tx) => {
      await this.repository.lock(tx, id);
      const row = await this.service.owner(tx, userId, id),
        brain = await this.repository.ensure(tx, id),
        now = this.service.now();
      if (brain.lease_until && new Date(brain.lease_until).getTime() > now)
        return { skipped: "leased" };
      const data = (
          await tx.query(
            "SELECT state FROM mochi_pet_state WHERE mochi_id=$1",
            [id],
          )
        ).rows[0].state,
        world = World.restore(data.world),
        state = row.state;
      if (world.m.asleep || state.personality.sleepUntil > now)
        return { skipped: "sleeping" };
      const entry = (
        await tx.query(
          "SELECT e.*,c.ends_at FROM competition_entries e JOIN competitions c ON c.id=e.competition_id WHERE e.mochi_id=$1 AND c.status='open' AND c.ends_at>$2 FOR UPDATE OF e",
          [id, new Date(now)],
        )
      ).rows[0];
      const interval = Number(
        entry
          ? (process.env.COMPETITION_INTERVAL_MS ?? 60000)
          : (process.env.TRADING_INTERVAL_MS ?? 300000),
      );
      if (now < (state.serverNextTick ?? 0)) return { skipped: "interval" };
      const snapshots = await this.snapshots(Math.floor(now / 60000));
      for (const snapshot of snapshots)
        if (snapshot.source === "mock") snapshot.timestamp = now;
      markPortfolio(state.portfolio, snapshots);
      if (entry) markPortfolio(entry.portfolio, snapshots);
      const decisionState = entry
        ? { ...state, portfolio: entry.portfolio }
        : state;
      decisionState.economy = await this.service.economy(userId, id);
      const obs = new Float32Array(TRADER_SPEC.inputs);
      sense(world, obs);
      obs.set(tradingObservations(world, decisionState, snapshots, true), 223);
      this.host ??= new BrainProcess();
      const record = await this.repository.load(id, userId);
      await this.host.call({
        op: "boot",
        spec: TRADER_SPEC,
        npz: record.life.brain,
      });
      const pending = entry ? entry.pending : state.pending;
      let intervalReward = null;
      if (pending && snapshots.every((s) => s.source === pending.source)) {
        const p = decisionState.portfolio,
          reward = tradingReward({
            before: pending.value,
            after: portfolioValue(p),
            drawdown: drawdown(p),
            trades: (entry ? entry.trades : state.trades).filter(
              (t) => t.timestamp > now - 3600000,
            ).length,
            invalid: pending.invalid,
          });
        intervalReward = reward;
        await this.host.call({
          op: "trade_credit",
          obs: pending.obs,
          action: pending.action,
          reward,
        });
      }
      // Close any saved pet outcome before choosing this turn. Pending continuation stays in Life.
      const outcome = world.takeOutcome();
      const answer = await this.host.call({
        op: "tick",
        obs: [Array.from(obs)],
        reward: [outcome.reward],
        aroused: true,
        want: { policy: true, learning: true },
      });
      const index = answer.action[0],
        action = answer.refused ? "HOLD" : translateAction(index),
        snapshot = snapshots[state.assetIndex ?? 0],
        p = decisionState.portfolio,
        before = portfolioValue(p),
        trades = entry ? entry.trades : state.trades;
      const result = executePaperTrade(
        p,
        action,
        snapshot.symbol,
        snapshot.price,
        trades,
        false,
        now,
      );
      const newPending =
        !answer.refused && index >= 17
          ? {
              obs: Array.from(obs),
              action: index,
              value: before,
              invalid: !result.risk.allowed,
              source: snapshot.source,
            }
          : null;
      if (result.trade)
        await this.service.award(tx, userId, "first-paper-trade", id);
      if (result.trade) applyTradeMood(state.personality, result.trade.pnl);
      // Execute the body motor on the same original World for one decision interval.
      // Trading motors map to rest; a refused settlement holds the body without stepping.
      const bodyAction = answer.refused ? null : index < 17 ? index : 0;
      if (bodyAction !== null) {
        world.setAction(bodyAction);
        for (let frame = 0; frame < TICK_STEPS; frame++) world.step();
      }
      state.lastObservations = snapshots;
      state.commentary = await new TemplateNarrator().narrate({
        action,
        snapshot,
        risk: result.risk,
        sleeping: false,
      });
      state.currentAction = result.risk.allowed ? action : "HOLD";
      state.lastDecision = {
        at: now,
        brainAction: index,
        executedBodyAction: bodyAction,
        action,
        risk: result.risk,
        reward: intervalReward,
        learning: answer.learning ?? null,
        normalizedObservations: Array.from(obs.slice(223)),
        source: snapshot.source,
        refused: answer.refused,
      };
      state.serverNextTick = now + interval;
      state.step = (state.step ?? 0) + 1;
      state.assetIndex = ((state.assetIndex ?? 0) + 1) % 3;
      if (entry)
        await tx.query(
          "UPDATE competition_entries SET portfolio=$3,trades=$4,pending=$5,last_tick_at=$6 WHERE competition_id=$1 AND mochi_id=$2",
          [
            entry.competition_id,
            id,
            p,
            JSON.stringify(trades),
            newPending,
            new Date(now),
          ],
        );
      else state.pending = newPending;
      const saved = await this.host.call({ op: "save" }),
        key = await this.repository.storage.write(
          id,
          brain.version + 1,
          Buffer.from(saved.npz, "base64"),
        );
      await tx.query(
        "UPDATE mochi_brains SET checkpoint_key=$2,version=version+1,updated_at=now() WHERE mochi_id=$1",
        [id, key],
      );
      await tx.query(
        "UPDATE mochis SET state=$2,updated_at=now() WHERE id=$1",
        [id, state],
      );
      await tx.query("UPDATE mochi_pet_state SET state=$2 WHERE mochi_id=$1", [
        id,
        { world: world.snapshot(), personality: state.personality },
      ]);
      await tx.query(
        "INSERT INTO portfolios(mochi_id,data) VALUES($1,$2) ON CONFLICT(mochi_id) DO UPDATE SET data=$2",
        [id, state.portfolio],
      );
      if (!entry) {
        await tx.query("DELETE FROM positions WHERE mochi_id=$1", [id]);
        for (const position of state.portfolio.positions)
          await tx.query(
            "INSERT INTO positions(mochi_id,symbol,data) VALUES($1,$2,$3)",
            [id, position.symbol, position],
          );
        if (result.trade)
          await tx.query(
            "INSERT INTO trades(mochi_id,id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [
              id,
              String(result.trade.timestamp) + "-" + state.step,
              result.trade,
            ],
          );
      }
      for (const quote of snapshots)
        await tx.query(
          "INSERT INTO market_snapshots(symbol,data,observed_at) VALUES($1,$2,$3) ON CONFLICT(symbol) DO UPDATE SET data=$2,observed_at=$3",
          [quote.symbol, quote, new Date(now)],
        );
      if (result.trade)
        await this.service.event(tx, userId, "trade", {
          message: `${row.name} chose ${result.trade.side} ${snapshot.symbol} using simulated funds.`,
          action,
          symbol: snapshot.symbol,
        });
      return { action, risk: result.risk, refused: answer.refused };
    });
  }
  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.host?.close();
    this.host = null;
  }
}
