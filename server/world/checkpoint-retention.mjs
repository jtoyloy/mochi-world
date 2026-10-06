import { BrainProcess } from "../../sim/brain_proc.mjs";
import { TRADER_SPEC } from "../../web/js/traders/brain.js";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { digest } from "./checkpoints.mjs";

// Production policy must be explicit. Development defaults bound ordinary tests.
export function retentionPolicy(env = process.env) {
  const development = env.DEV_MODE === "true";
  const fields = {
    keepRecent: ["CHECKPOINT_KEEP_RECENT", 3, true],
    retentionHours: ["CHECKPOINT_RETENTION_HOURS", 0, false],
    intervalMs: ["CHECKPOINT_GC_INTERVAL_MS", 60000, true],
    graceMs: ["CHECKPOINT_GC_GRACE_MS", 600000, true],
  };
  const policy = {};
  for (const [key, [name, fallback, integer]] of Object.entries(fields)) {
    const value = env[name] ?? (development ? fallback : undefined);
    if (value === undefined)
      return {
        enabled: false,
        reason: "Set all four CHECKPOINT retention settings in production",
      };
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n)))
      throw Error("Invalid " + name);
    policy[key] = n;
  }
  if (
    policy.keepRecent < 1 ||
    policy.intervalMs < 1000 ||
    policy.graceMs < 1000
  )
    throw Error(
      "Retention needs at least one recent checkpoint and >=1s GC/grace intervals",
    );
  return { enabled: true, ...policy };
}

export class CheckpointCollector {
  constructor(repository, policy = retentionPolicy()) {
    this.repo = repository;
    this.policy = policy;
    repository.retentionPolicy = policy;
    this.running = false;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(
      () =>
        this.run().catch((error) =>
          console.error("Checkpoint GC failed", error.message),
        ),
      this.policy.intervalMs ?? 60000,
    );
    this.timer.unref();
  }
  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.pending) await this.pending.catch(() => {});
  }
  run(options = {}) {
    if (this.running) return this.pending;
    this.running = true;
    this.pending = this.collect(options).finally(() => {
      this.running = false;
    });
    return this.pending;
  }
  async collect({ now = Date.now(), dryRun = false } = {}) {
    const r = this.repo,
      started = performance.now();
    let verifier;
    let coordinator, scope;
    let locked = false;
    try {
      // Only one collector per database/schema. Different namespaces cannot cross-delete.
      coordinator = await r.pool.connect();
      scope = await r.bindStorage(coordinator);
      locked = (
        await coordinator.query(
          "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
          ["checkpoint-gc:" + scope],
        )
      ).rows[0].locked;
      if (!locked) return { skipped: "another collector" };
      const files = await r.storage.list(scope);
      const identities = (
        await coordinator.query("SELECT id FROM mochis ORDER BY id")
      ).rows;
      let deleted = 0,
        eligible = 0,
        blockedBrains = 0;
      for (const { id } of identities) {
        let own = files.filter(
          (f) => f.identity === digest(Buffer.from("trading:" + id)),
        );

        await r.service.transaction([], async (tx) => {
          const available = (
            await tx.query(
              "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
              ["brain:" + id],
            )
          ).rows[0].locked;
          if (!available) {
            blockedBrains++;
            return;
          }
          const brain = (
            await tx.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [id])
          ).rows[0];
          // No known valid current recovery state: retain everything, including orphan/temp.
          if (!brain?.checkpoint_key) {
            blockedBrains++;
            return;
          }
          const leased =
            brain.lease_until &&
            new Date(brain.lease_until).getTime() > r.service.now();
          if (
            leased &&
            !brain.lease_checkpoint_known &&
            !brain.lease_checkpoint_key
          ) {
            blockedBrains++;
            return;
          }
          try {
            const bytes = await r.readVerified(tx, brain.checkpoint_key);
            const currentMeta = (
              await tx.query(
                "SELECT host_verified FROM brain_checkpoints WHERE key=$1",
                [brain.checkpoint_key],
              )
            ).rows[0];
            if (!currentMeta?.host_verified) {
              if (brain.pack !== "traders-0.74.0-v1")
                throw Error("Unsupported checkpoint pack for verification");
              verifier ??= new BrainProcess({ timeoutMs: 10000 });
              // Cold load/report only: no tick, action, reward, learning or save.
              const result = await verifier.call({
                op: "boot",
                spec: TRADER_SPEC,
                npz: bytes.toString("base64"),
              });
              if (!result.loaded)
                throw Error("Native checkpoint validation failed");
              await tx.query(
                "UPDATE brain_checkpoints SET host_verified=true WHERE key=$1 AND mochi_id=$2",
                [brain.checkpoint_key, id],
              );
            }
          } catch (error) {
            r.checkpointMetrics.validationFailures =
              (r.checkpointMetrics.validationFailures ?? 0) + 1;
            r.checkpointMetrics.validationLastError = error.message;
            blockedBrains++;
            return;
          }
          const catalog = (
            await tx.query(
              "SELECT * FROM brain_checkpoints WHERE mochi_id=$1 AND domain='trading' ORDER BY version DESC,created_at DESC,key DESC",
              [id],
            )
          ).rows;
          const present = new Set(
            own.filter((x) => !x.temporary).map((x) => x.key),
          );
          const recent = new Set(
            catalog
              .filter((x) => present.has(x.key))
              .slice(0, this.policy.keepRecent ?? catalog.length)
              .map((x) => x.key),
          );
          own = [
            ...own,
            ...catalog
              .filter(
                (x) =>
                  x.key.startsWith("managed-" + scope + "/") &&
                  !present.has(x.key),
              )
              .map((x) => ({
                key: x.key,
                bytes: 0,
                at: new Date(x.created_at).getTime(),
              })),
          ];
          const metadata = new Map(catalog.map((x) => [x.key, x]));
          for (const f of own) {
            const m = metadata.get(f.key);
            const at = m ? new Date(m.created_at).getTime() : f.at;
            if (
              !this.policy.enabled ||
              f.key === brain.checkpoint_key ||
              (leased && f.key === brain.lease_checkpoint_key) ||
              recent.has(f.key) ||
              m?.pinned ||
              now - at < this.policy.graceMs ||
              now - at < this.policy.retentionHours * 3600000
            )
              continue;
            // Verify ALL current references/pins again under the same save/read lock.
            const references = (
              await tx.query(
                `SELECT 1 FROM mochi_brains WHERE checkpoint_key=$1 OR
              (lease_checkpoint_key=$1 AND lease_until>$2)
              UNION ALL SELECT 1 FROM brain_checkpoints WHERE key=$1 AND pinned=true`,
                [f.key, new Date(r.service.now())],
              )
            ).rows;
            if (references.length) continue;
            const globalMeta = (
              await tx.query(
                "SELECT mochi_id,domain FROM brain_checkpoints WHERE key=$1",
                [f.key],
              )
            ).rows[0];
            if (
              globalMeta &&
              (globalMeta.mochi_id !== id || globalMeta.domain !== "trading")
            )
              throw Error("Checkpoint catalog identity mismatch; retained");
            if (m && (m.mochi_id !== id || m.domain !== "trading"))
              throw Error("Checkpoint identity mismatch");
            eligible++;
            if (dryRun) continue;
            let removed = true;
            try {
              await r.storage.remove(f.key);
            } catch (e) {
              if (e.code !== "ENOENT") throw e;
              removed = false;
            }
            // Delete succeeds first; a crash before catalog removal is harmless and retryable.
            await tx.query(
              "DELETE FROM brain_checkpoints WHERE key=$1 AND mochi_id=$2 AND pinned=false",
              [f.key, id],
            );
            if (removed) {
              r.checkpointMetrics.deleted = r.checkpointMetrics.deleted.filter(
                (x) => Date.now() - x.at < 3600000,
              );
              r.checkpointMetrics.deleted.push({
                at: Date.now(),
                bytes: f.bytes,
              });
              deleted++;
            }
          }
        });
      }
      const inventory = await r.storage.list(scope);
      const refs = (
        await coordinator.query(
          "SELECT checkpoint_key,lease_checkpoint_key,lease_until FROM mochi_brains",
        )
      ).rows;
      const referenced = new Set(
        refs
          .flatMap((x) => [
            x.checkpoint_key,
            ...(x.lease_until &&
            new Date(x.lease_until).getTime() > r.service.now()
              ? [x.lease_checkpoint_key]
              : []),
          ])
          .filter(Boolean),
      );
      const pinKeys = new Set(
        (
          await coordinator.query(
            "SELECT key FROM brain_checkpoints WHERE pinned=true",
          )
        ).rows.map((x) => x.key),
      );
      for (const key of pinKeys) referenced.add(key);
      // Root legacy files are inventoried but never swept. They may belong to another DB.
      const legacy = await r.storage.list();
      const managedInventory = inventory.slice();
      for (const file of legacy) inventory.push(file);
      r.inventory = {
        totalCheckpointCount: inventory.filter((x) => !x.temporary).length,
        temporaryCount: inventory.filter((x) => x.temporary).length,
        totalBytes: inventory.reduce((n, x) => n + x.bytes, 0),
        referencedCheckpointCount: inventory.filter((x) =>
          referenced.has(x.key),
        ).length,
        unreferencedCheckpointCount: managedInventory.filter(
          (x) => !x.temporary && !referenced.has(x.key),
        ).length,
        pinnedCheckpointCount: inventory.filter((x) => pinKeys.has(x.key))
          .length,
        oldestRetainedCheckpoint: inventory
          .filter((x) => !x.temporary)
          .reduce(
            (previous, x) =>
              !previous || x.at < previous.at
                ? { key: x.key, version: x.version, at: x.at }
                : previous,
            null,
          ),
        legacyCheckpointCount: legacy.filter((x) => !x.temporary).length,
        legacyBytes: legacy.reduce((n, x) => n + x.bytes, 0),
        unverifiedLegacyCheckpointCount: legacy.filter(
          (x) => !referenced.has(x.key),
        ).length,
        largestCheckpointBytes: inventory.reduce(
          (n, x) => Math.max(n, x.bytes),
          0,
        ),
        oldestRetainedAt: inventory
          .filter((x) => x.at !== null)
          .reduce((n, x) => (n === null ? x.at : Math.min(n, x.at)), null),
        at: Date.now(),
        blockedBrains,
        eligible,
      };
      r.checkpointMetrics.gcLastError = null;
      return { deleted, eligible, blockedBrains, dryRun, ...r.inventory };
    } catch (error) {
      r.checkpointMetrics.gcFailures++;
      r.checkpointMetrics.gcLastError = error.message;
      throw error;
    } finally {
      try {
        if (verifier) {
          const exited =
            verifier.child.exitCode === null &&
            verifier.child.signalCode === null
              ? once(verifier.child, "close")
              : null;
          verifier.close();
          if (exited) await exited;
        }
      } finally {
        let destroy = false;
        if (locked)
          await coordinator
            .query("SELECT pg_advisory_unlock(hashtext($1))", [
              "checkpoint-gc:" + scope,
            ])
            .catch(() => {
              destroy = true;
            });
        coordinator?.release(destroy);
        r.checkpointMetrics.gcDurationMs = performance.now() - started;
      }
    }
  }
}
