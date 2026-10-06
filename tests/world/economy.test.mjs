import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WorldService,
  integer,
  calendarDay,
} from "../../server/world/service.mjs";
import {
  BrainRepository,
  FileCheckpointStorage,
} from "../../server/world/checkpoints.mjs";
import { Competitions } from "../../server/world/competitions.mjs";
import { BrainService } from "../../server/world/brain-service.mjs";
import {
  ITEMS,
  SHOPS,
  TROPHIES,
  ACHIEVEMENTS,
} from "../../web/js/world/catalog.js";
const enabled = !!process.env.TEST_DATABASE_URL;
let pool,
  admin,
  s,
  repo,
  cups,
  dir,
  a,
  b,
  c,
  schema,
  now = Date.parse("2026-10-05T12:00:00Z");
const check = (name, fn) => test(name, { skip: !enabled }, fn);
before(async () => {
  if (!enabled) return;
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  schema = "world_test_" + Math.random().toString(36).slice(2, 10);
  await admin.query("CREATE SCHEMA " + schema);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  await pool.query(await readFile("server/schema.sql", "utf8"));
  await pool.query(await readFile("server/world/schema.sql", "utf8"));
  for (const item of ITEMS)
    await pool.query(
      "INSERT INTO items(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
      [item.id, item],
    );
  for (const shop of SHOPS)
    await pool.query(
      "INSERT INTO shops(id,slug,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [shop.id, shop.slug, shop],
    );
  for (const trophy of TROPHIES)
    await pool.query(
      "INSERT INTO trophies(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [trophy.id, trophy],
    );
  for (const definition of ACHIEVEMENTS)
    await pool.query(
      "INSERT INTO achievement_definitions(id,data) VALUES($1,$2)",
      [definition.id, definition],
    );
  s = new WorldService(pool, { now: () => now });
  dir = await mkdtemp(join(tmpdir(), "mochi-checkpoints-"));
  repo = new BrainRepository(s, new FileCheckpointStorage(dir));
  cups = new Competitions(s);
  const suffix = Math.random().toString(36).slice(2, 9);
  a = await s.ensureUser("testa_" + suffix);
  b = await s.ensureUser("testb_" + suffix);
  c = await s.ensureUser("testc_" + suffix);
  await s.adopt(a.id, "pet-" + suffix, "Test Mochi");
  a.pet = "pet-" + suffix;
});
after(async () => {
  if (pool) await pool.end();
  if (admin) {
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("Coins reject decimals, negatives, unsafe integers and forged numeric strings", () => {
  for (const n of [1.1, -1, Number.MAX_SAFE_INTEGER + 1, "20", NaN])
    assert.throws(() => integer(n));
  assert.equal(integer(0, 0), 0);
  assert.equal(calendarDay(Date.parse("2026-10-06T03:59:00Z")), "2026-10-05");
});
check(
  "starter items are discovered once and starter Coins have a ledger entry",
  async () => {
    const first = await s.account(a.id);
    await s.ensureUser(a.username);
    assert.equal((await s.account(a.id)).coins, first.coins);
    assert.equal((await s.overview(a.id)).collection.length, 3);
    assert.equal(
      (
        await pool.query(
          "SELECT sum(amount) n FROM currency_transactions WHERE user_id=$1",
          [a.id],
        )
      ).rows[0].n,
      String(first.coins),
    );
  },
);
check("NPC stock is finite and racing purchases cannot oversell", async () => {
  const shop = await s.shop("foods"),
    row = shop.stock.find((x) => x.item.id === "plain");
  const results = await Promise.allSettled(
    Array.from({ length: row.quantity + 2 }, () =>
      s.buyNpc(a.id, { shopId: "foods", itemId: "plain" }),
    ),
  );
  assert.equal(
    results.filter((x) => x.status === "fulfilled").length,
    row.quantity,
  );
  assert.equal(
    (await s.shop("foods")).stock.find((x) => x.item.id === "plain").quantity,
    0,
  );
  now += 600001;
  assert.equal(
    (await s.shop("foods")).stock.find((x) => x.item.id === "plain").quantity,
    8,
  );
});
check(
  "insufficient Coins roll back stock and inventory; client prices are ignored",
  async () => {
    const previous = (await s.shop("home")).stock.find(
      (x) => x.item.id === "bed",
    ).quantity;
    await assert.rejects(
      s.buyNpc(a.id, { shopId: "home", itemId: "bed", quantity: 8, price: 0 }),
    );
    assert.equal(
      (await s.shop("home")).stock.find((x) => x.item.id === "bed").quantity,
      previous,
    );
  },
);
check(
  "food consumption applies catalog effects and discovery remains after consumption",
  async () => {
    await pool.query(
      "UPDATE mochi_pet_state SET state=jsonb_set(state,'{world,m,needs,hunger}','0.8') WHERE mochi_id=$1",
      [a.pet],
    );
    await pool.query("UPDATE mochis SET last_pet_tick=$2 WHERE id=$1", [
      a.pet,
      now,
    ]);
    const before = (await s.economy(a.id, a.pet)).inventory.plain;
    await s.care(a.id, { mochiId: a.pet, kind: "feed", itemId: "plain" });
    assert.equal((await s.economy(a.id, a.pet)).inventory.plain, before - 1);
    assert.equal((await s.pet(a.pet, { tick: false })).stats.Fullness, 30);
    assert.ok(
      (await s.overview(a.id)).collection.some((x) => x.item_id === "plain"),
    );
    await assert.rejects(
      s.care(a.id, { mochiId: a.pet, kind: "feed", itemId: "plain" }),
      /seconds/,
    );
  },
);
check(
  "storage and equipment use ownership, and equipped items cannot leave a bag",
  async () => {
    await s.equip(a.id, { mochiId: a.pet, itemId: "ball" });
    await assert.rejects(
      s.moveItem(a.id, { itemId: "ball", to: "storage" }),
      /Unequip/,
    );
    await s.equip(a.id, { mochiId: a.pet, slot: "toy", remove: true });
    await s.moveItem(a.id, { itemId: "ball", to: "storage" });
    assert.equal((await s.economy(a.id, a.pet)).inventory.ball, undefined);
    await assert.rejects(s.equip(a.id, { mochiId: a.pet, itemId: "ball" }));
    await s.moveItem(a.id, { itemId: "ball", to: "bag" });
    await assert.rejects(
      s.equip(b.id, { mochiId: a.pet, itemId: "ball" }),
      /not your/,
    );
  },
);
check(
  "player listing escrows items, rejects self buys, pays seller, prevents double purchase",
  async () => {
    const beforeA = (await s.account(a.id)).coins,
      beforeB = (await s.account(b.id)).coins;
    const listing = await s.createListing(a.id, { itemId: "ball", price: 40 });
    assert.equal((await s.economy(a.id, a.pet)).inventory.ball, undefined);
    await assert.rejects(s.buyListing(a.id, { listingId: listing.id }));
    const results = await Promise.allSettled([
      s.buyListing(b.id, { listingId: listing.id }),
      s.buyListing(c.id, { listingId: listing.id }),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await s.account(a.id)).coins, beforeA + 40);
    const totalBuyer =
      (await s.account(b.id)).coins + (await s.account(c.id)).coins;
    assert.equal(totalBuyer, beforeB + 500 - 40 + 20);
  },
);
check(
  "canceling a listing returns escrow once without creating Coins",
  async () => {
    const listing = await s.createListing(a.id, {
      itemId: "plain",
      quantity: 2,
      price: 20,
    });
    const coins = (await s.account(a.id)).coins,
      before = (await s.economy(a.id, a.pet)).inventory.plain;
    await s.cancelListing(a.id, listing.id);
    assert.equal((await s.economy(a.id, a.pet)).inventory.plain, before + 2);
    assert.equal((await s.account(a.id)).coins, coins);
    await assert.rejects(s.cancelListing(a.id, listing.id));
  },
);
check(
  "daily claims are calendar-bound, prerequisites enforced and racing claims pay once",
  async () => {
    await assert.rejects(s.daily(a.id, "market"), /Visit/);
    await s.visit(a.id, "market");
    const coins = (await s.account(a.id)).coins;
    const results = await Promise.allSettled([
      s.daily(a.id, "market"),
      s.daily(a.id, "market"),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await s.account(a.id)).coins, coins + 20);
    await s.daily(a.id, "gift");
    await assert.rejects(s.daily(a.id, "gift"));
    now += 86400000;
    await s.daily(a.id, "gift");
  },
);
check(
  "friend requests accept and decline once; gifts require friendship and preserve quantity",
  async () => {
    await assert.rejects(
      s.gift(a.id, { username: b.username, itemId: "plain" }),
    );
    await s.friendRequest(a.id, b.username);
    await assert.rejects(s.friendRequest(b.id, a.username));
    const request = (await s.friends(b.id)).requests[0];
    await assert.rejects(
      s.respondFriend(c.id, { requestId: request.id, accept: true }),
    );
    await s.respondFriend(b.id, { requestId: request.id, accept: true });
    await assert.rejects(
      s.respondFriend(b.id, { requestId: request.id, accept: true }),
    );
    const bBefore = (
      await pool.query(
        "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='plain' AND location='bag'",
        [b.id],
      )
    ).rows[0].quantity;
    await s.gift(a.id, { username: b.username, itemId: "plain" });
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='plain' AND location='bag'",
          [b.id],
        )
      ).rows[0].quantity,
      bBefore + 1,
    );
    await s.removeFriend(a.id, b.id);
    assert.equal((await s.friends(b.id)).friends.length, 0);
    await s.friendRequest(a.id, c.username);
    const decline = (await s.friends(c.id)).requests[0];
    await s.respondFriend(c.id, { requestId: decline.id, accept: false });
    assert.equal((await s.friends(c.id)).friends.length, 0);
  },
);
check(
  "arcade score comes from timed server hits, rejects replay and obeys 100-Coin daily cap",
  async () => {
    let rewards = 0;
    for (let game = 0; game < 2; game++) {
      const round = await s.startArcade(a.id);
      await assert.rejects(s.hitArcade(a.id, { roundId: round.id, tick: 20 }));
      await assert.rejects(s.finishArcade(a.id, round.id));
      for (let tick = 0; tick < 30; tick++) {
        await s.hitArcade(a.id, { roundId: round.id, tick });
        await assert.rejects(s.hitArcade(a.id, { roundId: round.id, tick }));
        now += 1500;
      }
      const result = await s.finishArcade(a.id, round.id);
      assert.equal(result.score, 30);
      rewards += result.reward;
      await assert.rejects(s.finishArcade(a.id, round.id));
    }
    assert.equal(rewards, 100);
  },
);
check(
  "brain lease and version prevent parallel writers; client Coins and portfolio are ignored",
  async () => {
    const lease = await repo.acquire(a.id, a.pet);
    await assert.rejects(repo.acquire(a.id, a.pet), /another room/);
    await assert.rejects(
      s.care(a.id, { mochiId: a.pet, kind: "pet" }),
      /open room/,
    );
    const record = await repo.load(a.pet, a.id),
      coins = (await s.account(a.id)).coins;
    record.state.economy.coins = 999999;
    record.state.portfolio.cash = 999999;
    const result = await repo.save(
      a.id,
      a.pet,
      record,
      lease.token,
      lease.version,
    );
    assert.equal(result.version, lease.version + 1);
    assert.equal((await s.account(a.id)).coins, coins);
    assert.equal((await s.pet(a.pet, { tick: false })).portfolio.cash, 10000);
    await assert.rejects(
      repo.save(a.id, a.pet, record, lease.token, lease.version),
      /Another session/,
    );
    assert.ok(
      (
        await pool.query(
          "SELECT checkpoint_key,life FROM mochi_brains WHERE mochi_id=$1",
          [a.pet],
        )
      ).rows[0].checkpoint_key,
    );
    assert.equal(
      (
        await pool.query("SELECT life FROM mochi_brains WHERE mochi_id=$1", [
          a.pet,
        ])
      ).rows[0].life.brain,
      undefined,
    );
    await repo.release(a.id, a.pet, lease.token);
  },
);
check(
  "competitions isolate paper portfolio and settle only once with participation-only small field",
  async () => {
    await cups.enter(a.id, a.pet);
    await assert.rejects(cups.enter(a.id, a.pet));
    const cup = await cups.daily();
    assert.equal(new Date(cup.starts_at).toISOString().slice(11, 16), "04:00");
    await pool.query(
      "UPDATE competition_entries SET portfolio=jsonb_set(portfolio,'{cash}','11000') WHERE competition_id=$1 AND mochi_id=$2",
      [cup.id, a.pet],
    );
    assert.equal((await s.pet(a.pet, { tick: false })).portfolio.cash, 10000);
    await pool.query("UPDATE competitions SET ends_at=$2 WHERE id=$1", [
      cup.id,
      new Date(now - 1),
    ]);
    const before = (await s.account(a.id)).coins;
    await cups.settle();
    await cups.settle();
    assert.equal((await s.account(a.id)).coins, before + 25);
    const entry = (
      await pool.query(
        "SELECT * FROM competition_entries WHERE competition_id=$1 AND mochi_id=$2",
        [cup.id, a.pet],
      )
    ).rows[0];
    assert.equal(entry.rank, 1);
    assert.equal(entry.reward, 25);
  },
);
check(
  "one shared actual Cadence host advances separate checkpoints and skips leased pets",
  async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    await s.adopt(b.id, "native-" + suffix, "Native");
    await s.adopt(c.id, "native2-" + suffix, "Native Two");
    const native = new BrainService(s, repo, cups);
    try {
      const lease = await repo.acquire(b.id, "native-" + suffix);
      assert.equal(
        (await native.tick("native-" + suffix, b.id)).skipped,
        "leased",
      );
      await repo.release(b.id, "native-" + suffix, lease.token);
      const worldBefore = (
        await pool.query(
          "SELECT state FROM mochi_pet_state WHERE mochi_id=$1",
          ["native-" + suffix],
        )
      ).rows[0].state.world;
      const first = await native.tick("native-" + suffix, b.id);
      assert.ok(first.action);
      const worldAfter = (
        await pool.query(
          "SELECT state FROM mochi_pet_state WHERE mochi_id=$1",
          ["native-" + suffix],
        )
      ).rows[0].state.world;
      if (!first.refused) assert.ok(worldAfter.t > worldBefore.t);
      const host = native.host;
      const second = await native.tick("native2-" + suffix, c.id);
      assert.ok(second.action);
      assert.equal(native.host, host);
      const rows = (
        await pool.query(
          "SELECT checkpoint_key,version FROM mochi_brains WHERE mochi_id=ANY($1)",
          [["native-" + suffix, "native2-" + suffix]],
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((x) => x.version === 1));
      assert.notEqual(rows[0].checkpoint_key, rows[1].checkpoint_key);
    } finally {
      await native.stop();
    }
  },
);

check(
  "elapsed pet clock counts completed sleep and waking separately, with bounded needs",
  async () => {
    await pool.query(
      "UPDATE mochi_pet_state SET state=jsonb_set(state,'{world,m,needs,fatigue}','0.8') WHERE mochi_id=$1",
      [a.pet],
    );
    await s.care(a.id, { mochiId: a.pet, kind: "sleep" });
    now += 3 * 3600000;
    const pet = await s.pet(a.pet);
    const body = (
      await pool.query("SELECT state FROM mochi_pet_state WHERE mochi_id=$1", [
        a.pet,
      ])
    ).rows[0].state;
    assert.ok(Math.abs(body.world.m.needs.fatigue - 0.475) < 1e-6);
    assert.ok(pet.stats.Energy >= 52 && pet.stats.Energy <= 53);
    assert.notEqual(pet.mood, "Sleeping");
    await s.care(a.id, { mochiId: a.pet, kind: "pet" });
    assert.equal((await s.pet(a.pet)).mood === "Sleeping", false);
  },
);
check(
  "repeated successful care creates a persistent favorite rather than random adjectives",
  async () => {
    for (let i = 0; i < 2; i++) {
      now += 5001;
      await s.care(a.id, { mochiId: a.pet, kind: "feed", itemId: "plain" });
    }
    const pet = await s.pet(a.pet);
    assert.equal(pet.favorites.food, "Plain Mochi");
    assert.ok(pet.profile.level >= 1);
    const claimed = (
      await pool.query(
        "SELECT count(*) FROM user_achievements WHERE user_id=$1 AND achievement_id='first-care'",
        [a.id],
      )
    ).rows[0].count;
    assert.equal(claimed, "1");
  },
);

check(
  "three real entries rank stored cup values and concurrent settlement pays podium once",
  async () => {
    now += 86400000;
    const bp = (await s.account(b.id)).profile.activeMochi,
      cp = (await s.account(c.id)).profile.activeMochi;
    for (const [user, mochiId] of [
      [a, a.pet],
      [b, bp],
      [c, cp],
    ])
      await cups.enter(user.id, mochiId);
    const cup = await cups.daily();
    for (const [id, cash] of [
      [a.pet, 11000],
      [bp, 10500],
      [cp, 9500],
    ])
      await pool.query(
        "UPDATE competition_entries SET portfolio=jsonb_set(portfolio,'{cash}',to_jsonb($3::integer)) WHERE competition_id=$1 AND mochi_id=$2",
        [cup.id, id, cash],
      );
    await pool.query("UPDATE competitions SET ends_at=$2 WHERE id=$1", [
      cup.id,
      new Date(now - 1),
    ]);
    const before = await Promise.all([a, b, c].map((u) => s.account(u.id)));
    await Promise.all([cups.settle(), cups.settle()]);
    const after = await Promise.all([a, b, c].map((u) => s.account(u.id)));
    assert.deepEqual(
      after.map((x, i) => x.coins - before[i].coins),
      [1000, 500, 500],
    );
    const winner = (
      await pool.query(
        "SELECT rank FROM competition_entries WHERE competition_id=$1 AND mochi_id=$2",
        [cup.id, a.pet],
      )
    ).rows[0];
    assert.equal(winner.rank, 1);
    assert.ok(
      (
        await pool.query(
          "SELECT 1 FROM mochi_trophies WHERE mochi_id=$1 AND trophy_id='sol-cup-gold'",
          [a.pet],
        )
      ).rows.length,
    );
  },
);
check(
  "calendar cups follow 23-hour and 25-hour New York daylight-saving days",
  async () => {
    now = Date.parse("2026-03-08T16:00:00Z");
    let cup = await cups.daily();
    assert.equal(new Date(cup.ends_at) - new Date(cup.starts_at), 23 * 3600000);
    now = Date.parse("2026-11-01T16:00:00Z");
    cup = await cups.daily();
    assert.equal(new Date(cup.ends_at) - new Date(cup.starts_at), 25 * 3600000);
  },
);
