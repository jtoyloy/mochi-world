import { createHash } from "node:crypto";
import { BrainProcess } from "../../sim/brain_proc.mjs";
import { BATTLE_ACTIONS } from "../../web/js/game/adventure.js";
export class BattleBrains {
  constructor(service) {
    this.service = service;
    this.pool = service.pool;
    this.host = null;
    this.queue = Promise.resolve();
  }
  decide(
    id,
    userId,
    obs,
    reward = 0,
    { aroused = true, finish = false, outcome = {}, ability = null } = {},
  ) {
    const task = () =>
      this.service.transaction([userId], async (tx) => {
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
        this.host ??= new BrainProcess({
          module: "mochi.battle",
          timeoutMs: 10000,
        });
        await this.host.call({
          op: "boot",
          domain: "battle-v1",
          pack: row.pack ?? "battle-0.74.0-v1",
          seed: createHash("sha256").update(id).digest().readUInt32BE(0),
          checkpoint: row.checkpoint?.toString("base64"),
        });
        const answer = await this.host.call({
          op: finish ? "finish" : "tick",
          obs,
          reward,
          aroused,
        });
        const saved = await this.host.call({ op: "save" });
        const action = answer.refused
          ? null
          : (BATTLE_ACTIONS[answer.action?.[0]] ?? null);
        const metrics = row.metrics;
        metrics.decisions = (metrics.decisions ?? 0) + Number(!finish);
        metrics.refused = (metrics.refused ?? 0) + Number(!finish && !action);
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
        metrics.last = {
          at: this.service.now(),
          action,
          reward,
          refused: answer.refused,
          learning: answer.learning,
        };
        if (!finish) {
          metrics.recent = [
            ...(metrics.recent ?? []),
            { at: this.service.now(), action, refused: !action },
          ].slice(-15);
          if (action === "USE_SPECIAL" && ability) {
            metrics.abilities ??= {};
            metrics.abilities[ability] = (metrics.abilities[ability] ?? 0) + 1;
          }
        }
        await tx.query(
          "UPDATE mochi_battle_brains SET checkpoint=$2,version=version+1,metrics=$3,updated_at=now() WHERE mochi_id=$1",
          [id, Buffer.from(saved.checkpoint, "base64"), metrics],
        );
        return {
          action,
          refused: !finish && !action,
          finished: finish,
          version: row.version + 1,
        };
      });
    const result = this.queue.then(task);
    this.queue = result.catch(() => {
      this.host?.close();
      this.host = null;
    });
    return result;
  }
  close() {
    this.host?.close();
  }
}
