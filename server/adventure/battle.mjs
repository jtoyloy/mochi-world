import { createHash, randomUUID } from "node:crypto";
import { BattleWorkers } from "./battle-workers.mjs";
import { performance } from "node:perf_hooks";
import { BATTLE_ACTIONS } from "../../web/js/game/adventure.js";
export class BattleBrains {
  constructor(service, options = {}) {
    this.service = service;
    this.pool = service.pool;
    this.workers = new BattleWorkers(options);
    this.samples = [];
  }
  decide(
    id,
    userId,
    obs,
    reward = 0,
    { aroused = true, finish = false, execution = null, executionRequired = false, outcome = {}, ability = null, expectedVersion = null, deadlineAt = Infinity, requestId = randomUUID() } = {},
  ) {
    const submitted = performance.now();
    return this.workers.run(id, async (call, scheduling) => {
      const timing = { ...scheduling, db: 0 };
      const started = performance.now();
      const result = await this.service.transaction([userId], async (client) => {
        const tx = { query: async (...args) => { const at=performance.now(); try { return await client.query(...args); } finally { timing.db += performance.now()-at; } } };
        await this.service.owner(tx, userId, id);
        await tx.query(
          "INSERT INTO mochi_battle_brains(mochi_id) VALUES($1) ON CONFLICT DO NOTHING",
          [id],
        );
        const row = (
          await tx.query(
            "SELECT * FROM mochi_battle_brains WHERE mochi_id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (row.last_request_id === requestId) return row.last_response;
        if (expectedVersion !== null && row.version !== expectedVersion)
          throw Error("Stale battle brain version");
        if (Date.now() > deadlineAt) throw Error("Battle decision deadline expired waiting for database");
        const ipcAt = performance.now();
        const response = await call({
          op: "execute", id, version: row.version,
          pack: row.pack ?? "battle-0.74.0-v1",
          seed: createHash("sha256").update(id).digest().readUInt32BE(0),
          checkpoint: row.checkpoint?.toString("base64"),
          decision: {op: execution ?? (finish ? "finish" : "tick"), obs, reward, aroused, executionRequired},
        });
        timing.ipc = performance.now()-ipcAt;
        Object.assign(timing, response.timings);
        timing.transport = Math.max(0, timing.ipc-response.timings.host);
        const answer = response.answer, saved = response;
        const action = answer.refused
          ? null
          : (BATTLE_ACTIONS[answer.action?.[0]] ?? null);
        const metrics = row.metrics;
        metrics.decisions = (metrics.decisions ?? 0) + Number(!finish && !execution);
        metrics.refused = (metrics.refused ?? 0) + Number(!finish && !execution && !action);
        metrics.actions ??= {};
        if (action)
          metrics.actions[action] = (metrics.actions[action] ?? 0) + 1;
        for (const key of [
          "damageDealt",
          "protection",
          "ownerDamage",
          "petDamage",
        ])
          metrics[key] = (metrics[key] ?? 0) + (outcome[key] ?? 0);
        if (outcome.victory) metrics.wins = (metrics.wins ?? 0) + 1;
        if (execution) metrics[execution === "ack" ? "executed" : "cancelled"] =
          (metrics[execution === "ack" ? "executed" : "cancelled"] ?? 0) + 1;
        metrics.last = {
          at: this.service.now(),
          action,
          reward,
          refused: answer.refused,
          learning: answer.learning,
        };
        if (!finish && !execution) {
          metrics.recent = [
            ...(metrics.recent ?? []),
            { at: this.service.now(), action, refused: !action },
          ].slice(-15);
          if (action === "USE_SPECIAL" && ability) {
            metrics.abilities ??= {};
            metrics.abilities[ability] = (metrics.abilities[ability] ?? 0) + 1;
          }
        }
        const receipt = {
          action, refused: !finish && !execution && !action, finished: finish, execution,
          version: row.version + 1, requestId,
        };
        await tx.query(
          "UPDATE mochi_battle_brains SET checkpoint=$2,version=version+1,metrics=$3,updated_at=now(),last_request_id=$4,last_response=$5 WHERE mochi_id=$1",
          [id, Buffer.from(saved.checkpoint, "base64"), metrics, requestId, receipt],
        );
        return receipt;
      });
      timing.service = performance.now()-started;
      timing.endToEnd = performance.now()-submitted;
      this.samples.push(timing);
      if(this.samples.length>10000)this.samples.shift();
      return result;
    }, {deadlineAt});
  }
  close() {
    return this.workers.close();
  }
}
