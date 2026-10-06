import pg from "pg";
import { readFile } from "node:fs/promises";
import { WorldService } from "./service.mjs";
import { BrainRepository } from "./checkpoints.mjs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  s = new WorldService(pool),
  repo = new BrainRepository(s);
try {
  const user = await s.ensureUser("devuser", "City Explorer");
  let old;
  try {
    old = JSON.parse(await readFile("data/momo.json", "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await s.adopt(user.id, "momo", old?.state?.name ?? "Momo");
  if (old?.life?.brain)
    await s.transaction([user.id], async (tx) => {
      await repo.lock(tx, "momo");
      const brain = await repo.ensure(tx, "momo");
      if (brain.checkpoint_key) return;
      const key = await repo.writeCheckpoint(
        tx,
        "momo",
        1,
        Buffer.from(old.life.brain, "base64"),
      );
      const meta = { ...old.life };
      delete meta.brain;
      delete meta.trader;
      await tx.query(
        "UPDATE mochi_brains SET checkpoint_key=$2,life=$3,version=1 WHERE mochi_id=$1",
        ["momo", key, meta],
      );
      await tx.query("UPDATE mochis SET state=$2 WHERE id=$1", [
        "momo",
        old.state,
      ]);
      await tx.query("UPDATE mochi_pet_state SET state=$2 WHERE mochi_id=$1", [
        "momo",
        { world: old.life.world, personality: old.state.personality },
      ]);
      const balance = (
        await tx.query("SELECT coins FROM users WHERE id=$1", [user.id])
      ).rows[0].coins;
      await s.coins(tx, user.id, old.state.economy.coins - balance, "admin", {
        reason: "Legacy save migration",
      });
      await tx.query("DELETE FROM player_inventory WHERE user_id=$1", [
        user.id,
      ]);
      for (const [id, n] of Object.entries(old.state.economy.inventory))
        if (n > 0) await s.inventory(tx, user.id, id, n);
      await tx.query("UPDATE equipped_items SET slots=$2 WHERE mochi_id=$1", [
        "momo",
        old.state.economy.equipped,
      ]);
      console.log("Imported Momo; preserved trained checkpoint.");
    });
  console.log("Development account ready: devuser");
} finally {
  await pool.end();
}
