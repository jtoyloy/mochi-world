import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { WorldService } from "../../server/world/service.mjs";
import { ResourceRewards } from "../../server/adventure/rewards.mjs";
import { ITEMS } from "../../web/js/world/catalog.js";

test("onboarding wood sales persist after payout and isolate users and fish sales", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = "guide_test_" + randomUUID().replaceAll("-", "");
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  try {
    await admin.query("CREATE SCHEMA " + schema);
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: "-c search_path=" + schema });
    for (const path of ["server/schema.sql", "server/world/schema.sql", "server/social/schema.sql", "server/adventure/schema.sql"])
      await pool.query(await readFile(path, "utf8"));
    for (const item of ITEMS) await pool.query("INSERT INTO items(id,data) VALUES($1,$2)", [item.id, item]);
    const world = new WorldService(pool);
    const a = await world.ensureUser("guide_a"), b = await world.ensureUser("guide_b");
    const rewards = new ResourceRewards(world, { mock: true });
    await rewards.init();
    await world.transaction([a.id, b.id], async (tx) => {
      await world.inventory(tx, a.id, "softwood", 1);
      await world.inventory(tx, b.id, "softwood", 1);
    });
    const actor = { roomId: "town", x: 600, y: 1450 };
    await rewards.sell(a.id, { id: randomUUID(), vendor: "wood", items: { softwood: 1 } }, actor);
    assert.equal((await rewards.balance(a.id)).woodSales, 1);
    assert.equal((await rewards.balance(b.id)).woodSales, 0);
    await rewards.claim(a.id, { id: randomUUID() });
    const paid = await rewards.balance(a.id);
    assert.equal(paid.amountRaw, "0");
    assert.equal(paid.woodSales, 1);
    await world.transaction([b.id], async (tx) => world.inventory(tx, b.id, "common-minnow", 1));
    await rewards.sell(b.id, { id: randomUUID(), vendor: "fish", items: { "common-minnow": 1 } }, { roomId: "town", x: 300, y: 1300 });
    assert.equal((await rewards.balance(b.id)).woodSales, 0);
  } finally {
    await pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await admin.end();
  }
});
