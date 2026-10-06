import pg from "pg";
import { WorldService } from "../server/world/service.mjs";
import { BrainRepository } from "../server/world/checkpoints.mjs";
import { CheckpointCollector } from "../server/world/checkpoint-retention.mjs";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const repo = new BrainRepository(new WorldService(pool));
const args = Object.fromEntries(
  process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
);
try {
  if (args.pin) {
    if (!args.pet) throw Error("--pet is required with --pin");
    await repo.pin(args.pet, args.pin, args.unpin === undefined);
  }
  const gc = new CheckpointCollector(repo);
  const result = await gc.run({ dryRun: args["dry-run"] !== undefined });
  console.log(JSON.stringify({ result, metrics: repo.diagnostics() }, null, 2));
  if (!gc.policy.enabled)
    console.error(
      "Retention is disabled: set all required CHECKPOINT settings; no files deleted.",
    );
} finally {
  await pool.end();
}
