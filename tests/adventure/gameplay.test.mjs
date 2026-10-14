import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { WorldService } from "../../server/world/service.mjs";
import { AdventureService } from "../../server/adventure/service.mjs";
import { ResourceRewards } from "../../server/adventure/rewards.mjs";
import { ITEMS } from "../../web/js/world/catalog.js";
import {
  damage,
  clampHealth,
  combatStats,
  battleReward,
  battleObservation,
  SPAWNS,
  RESOURCE_NODES,
} from "../../web/js/game/adventure.js";
import { NavigationService } from "../../web/js/game/NavigationService.js";
import { walkable, validSegment } from "../../web/js/game/model.js";
let pool,
  admin,
  s,
  a,
  b,
  game,
  schema,
  p,
  presentation = [],
  now = Date.parse("2026-10-05T12:00:00Z");
const enabled = !!process.env.TEST_DATABASE_URL,
  check = (name, fn) => test(name, { skip: !enabled }, fn);
before(async () => {
  if (!enabled) return;
  schema = "adventure_test_" + randomUUID().replaceAll("-", "");
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query("CREATE SCHEMA " + schema);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  for (const file of [
    "server/schema.sql",
    "server/world/schema.sql",
    "server/social/schema.sql",
    "server/adventure/schema.sql",
  ])
    await pool.query(await readFile(file, "utf8"));
  for (const item of ITEMS)
    await pool.query("INSERT INTO items(id,data) VALUES($1,$2)", [
      item.id,
      item,
    ]);
  s = new WorldService(pool, { now: () => now });
  a = await s.ensureUser("adventure_a");
  b = await s.ensureUser("adventure_b");
  game = new AdventureService(s, {
    random: () => 0.1,
    rewards: new ResourceRewards(s, { mock: true }),
    brains: { decide: async () => ({ action: "ATTACK" }), close() {} },
  });
  await game.rewards.init();
  p = {
    userId: a.id,
    roomId: "forest",
    room: "forest-1",
    x: 380,
    y: 280,
    companion: null,
  };
  game.effect = (_p, kind, data = {}) => presentation.push({kind, ...data});
  await game.state(a.id);
});
after(async () => {
  await game?.close();
  await pool?.end();
  if (admin) {
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
test("damage, health and modifiers remain deterministic and bounded", () => {
  assert.equal(damage(10, 3), 7);
  assert.equal(damage(0, 99), 1);
  assert.equal(clampHealth(200, 100), 100);
  assert.equal(clampHealth(-3, 100), 0);
  const stats = combatStats({
    weapon: "reed-staff",
    body: "padded-coat",
    accessory1: "iron-ring",
    accessory2: "ember-charm",
  });
  assert.equal(stats.defense, 9);
  assert.equal(stats.magic, 8);
  assert.equal(stats.fireMultiplier, 1.05);
  assert.equal(battleReward({ damageDealt: 10000 }), 1);
  assert.equal(battleReward({ ownerDamage: 10000 }), -1);
  assert(battleReward({ protection: 15 }) > 0);
});
test("all resource and mob cells are reachable; malformed segments refuse", () => {
  for (const n of RESOURCE_NODES) {const nav=new NavigationService(n.room),goal=nav.nearestWalkable(n);assert(goal&&Math.hypot(goal.x-n.x,goal.y-n.y)<100,n.id);assert(nav.findPath({x:550,y:590},goal),n.id);}
  for (const z of SPAWNS)
    for (const [x, y] of z.cells) assert(walkable(z.room, x, y));
  assert.equal(validSegment("forest", { x: 1 }, 2, 3, 4), false);
});
check("starter grants happen once and require no tokens", async () => {
  await game.state(a.id);
  await game.status(a.id);
  const q = (
    await pool.query(
      "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='small-potion'",
      [a.id],
    )
  ).rows[0].quantity;
  assert.equal(q, 3);
});
check(
  "target, range, cooldown, mana, and forged damage are server controlled",
  async () => {
    const m = [...game.instance(p).mobs.values()][0],
      state = await game.state(a.id);
    await assert.rejects(
      game.action(p, { action: "kill", targetId: m.id, damage: 999999 }),
      /Unsupported/,
    );
    await assert.rejects(
      game.action(p, { action: "target", targetId: "forged" }),
      /living/,
    );
    p.x = 1000;
    p.y = 600;
    await assert.rejects(
      game.action(p, { action: "spell", spellId: "fire-bolt", targetId: m.id }),
      /range/,
    );
    p.x = 380;
    p.y = 280;
    const hp = m.hp;
    await game.action(p, {
      action: "spell",
      spellId: "fire-bolt",
      targetId: m.id,
      damage: 99999,
    });
    assert.equal(m.hp, hp - 19);
    assert.equal(state.mp, 50);
    await assert.rejects(
      game.action(p, { action: "spell", spellId: "fire-bolt", targetId: m.id }),
      /cooling/,
    );
    state.mp = 0;
    now += 4000;
    await assert.rejects(
      game.action(p, { action: "spell", spellId: "fire-bolt", targetId: m.id }),
      /mana/,
    );
    state.mp = 60;
  },
);
check(
  "owned consumables decrement once, heal clamps, unowned and forged items refuse",
  async () => {
    const state = await game.state(a.id);
    state.hp = 95;
    await game.action(p, {
      action: "item",
      itemId: "small-potion",
      quantity: -100,
      amount: 10000,
    });
    assert.equal(state.hp, 100);
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='small-potion'",
          [a.id],
        )
      ).rows[0].quantity,
      2,
    );
    await assert.rejects(
      game.action(p, { action: "item", itemId: "small-potion" }),
      /cooling/,
    );
    now += 3000;
    await assert.rejects(
      game.action(p, { action: "item", itemId: "large-potion" }),
      /own/,
    );
    await assert.rejects(
      game.action(p, { action: "item", itemId: "fake" }),
      /consumable/,
    );
  },
);
check(
  "equipment ownership, slots and listing escrow protect worn combat gear",
  async () => {
    await assert.rejects(
      game.action(p, { action: "equip", slot: "weapon", itemId: "ash-bow" }),
      /level|Own/,
    );
    await assert.rejects(
      game.action(p, { action: "equip", slot: "head", itemId: "basic-sword" }),
      /slot/,
    );
    await assert.rejects(
      s.createListing(a.id, { itemId: "basic-sword", price: 10 }),
      /Unequip combat/,
    );
  },
);
check(
  "death grants server loot and XP once; repeated hits never duplicate",
  async () => {
    const m = [...game.instance(p).mobs.values()][0],
      state = await game.state(a.id),
      before = state.xp.combat;
    await game.hit(p, state, m, 9999);
    assert.equal(m.hp, 0);
    assert.equal(m.state, "DEAD");
    assert.equal(state.xp.combat, before + 18);
    const q = (
      await pool.query(
        "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='slime-resin'",
        [a.id],
      )
    ).rows[0].quantity;
    await game.hit(p, state, m, 9999);
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='slime-resin'",
          [a.id],
        )
      ).rows[0].quantity,
      q,
    );
    assert.equal(state.xp.combat, before + 18);
    assert(m.respawnAt > now);
  },
);
check(
  "trees enforce ownership, timing and shared cooldown; completion grants resource and XP once",
  async () => {
    const n = RESOURCE_NODES[0];
    Object.assign(p, { roomId: n.room, x: n.x, y: n.y });
    const start = await game.action(p, { action: "gather", nodeId: n.id });
    await assert.rejects(
      game.action(p, { action: "finishGather", harvestId: start.id }),
      /not finished/,
    );
    await assert.rejects(
      game.action(p, { action: "gather", nodeId: n.id }),
      /recovering/,
    );
    now += n.durationMs;
    const result = await game.action(p, {
      action: "finishGather",
      harvestId: start.id,
      quantity: 10000,
      xp: 10000,
    });
    assert.equal(result.quantity, 1);
    assert.ok(presentation.some(e => e.kind === "woodcut_start" && e.nodeId === n.id));
    assert.equal(presentation.at(-1).kind, "woodcutting");
    assert.equal((await game.state(a.id)).xp.woodcutting, 12);
    await assert.rejects(
      game.action(p, { action: "finishGather", harvestId: start.id }),
      /already granted/,
    );
    assert.equal((await game.state(a.id)).xp.woodcutting, 12);
    await assert.rejects(
      game.action(p, { action: "gather", nodeId: "town-tree" }),
      /available/,
    );
  },
);
check(
  "fishing cannot finish elsewhere or for another owner; valid catch grants once",
  async () => {
    const n = RESOURCE_NODES.find((n) => n.kind === "fishing");
    Object.assign(p, { roomId: n.room, x: n.x, y: n.y });
    const start = await game.action(p, { action: "gather", nodeId: n.id });
    now += n.durationMs;
    await assert.rejects(
      game.action(
        { ...p, userId: b.id },
        { action: "finishGather", harvestId: start.id },
      ),
      /unavailable/,
    );
    p.x = 200;
    await assert.rejects(
      game.action(p, { action: "finishGather", harvestId: start.id }),
      /Stay/,
    );
    p.x = n.x;
    const r = await game.action(p, {
      action: "finishGather",
      harvestId: start.id,
    });
    assert.equal(r.itemId, "common-minnow");
    assert.ok(presentation.some(e => e.kind === "fish_start" && e.nodeId === n.id));
    assert.equal(presentation.at(-1).kind, "fishing");
    assert.equal((await game.state(a.id)).xp.fishing, 12);
    await assert.rejects(
      game.action(p, { action: "finishGather", harvestId: start.id }),
      /already granted/,
    );
  },
);
check(
  "sales remove only owned resources and accrue exactly once transactionally",
  async () => {
    Object.assign(p, { roomId: "town", x: 600, y: 1450 });
    const id = randomUUID();
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id, vendor: "wood", items: { softwood: 2 } },
        p,
      ),
      /own/,
    );
    assert.equal((await game.rewards.balance(a.id)).amountRaw, "0");
    const r = await game.rewards.sell(
      a.id,
      { id, vendor: "wood", items: { softwood: 1 } },
      p,
    );
    assert.equal(r.amountRaw, "1000");
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id, vendor: "wood", items: { softwood: 1 } },
        p,
      ),
      /already/,
    );
    assert.equal((await game.rewards.balance(a.id)).amountRaw, "1000");
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='softwood'",
          [a.id],
        )
      ).rowCount,
      0,
    );
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id: randomUUID(), vendor: "wood", items: { "common-minnow": 1 } },
        p,
      ),
      /does not buy/,
    );
  },
);
check(
  "account/global caps and exhausted funding preserve resources without liabilities",
  async () => {
    await s.transaction([a.id], (tx) => s.inventory(tx, a.id, "softwood", 2));
    now += 3000;
    const original = game.rewards.dailyCap;
    game.rewards.dailyCap = 1000n;
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id: randomUUID(), vendor: "wood", items: { softwood: 1 } },
        p,
      ),
      /limit/,
    );
    game.rewards.dailyCap = original;
    const global = game.rewards.globalCap;
    game.rewards.globalCap = 1000n;
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id: randomUUID(), vendor: "wood", items: { softwood: 1 } },
        p,
      ),
      /limit/,
    );
    game.rewards.globalCap = global;
    await pool.query(
      "UPDATE reward_treasury SET balance_raw=liability_raw WHERE id=$1",
      [game.rewards.id],
    );
    await assert.rejects(
      game.rewards.sell(
        a.id,
        { id: randomUUID(), vendor: "wood", items: { softwood: 1 } },
        p,
      ),
      /exhausted/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id='softwood'",
          [a.id],
        )
      ).rows[0].quantity,
      2,
    );
  },
);
check(
  "claim batches exactly accrued value; replay and ledger mutation refuse",
  async () => {
    const id = randomUUID(),
      r = await game.rewards.claim(a.id, { id, amountRaw: "99999999999" });
    assert.equal(r.amountRaw, "1000");
    assert.equal(r.status, "paid");
    await assert.rejects(game.rewards.claim(a.id, { id }), /already/);
    await assert.rejects(
      game.rewards.claim(a.id, { id: randomUUID() }),
      /No unclaimed/,
    );
    assert.equal((await game.rewards.balance(a.id)).amountRaw, "0");
    await assert.rejects(
      pool.query("UPDATE game_reward_payouts SET amount_raw=1000000"),
      /immutable/,
    );
    await assert.rejects(
      pool.query("UPDATE game_reward_accruals SET amount_raw=1000000"),
      /claim assignment/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT balance_raw,liability_raw FROM reward_treasury WHERE id=$1",
          [game.rewards.id],
        )
      ).rows[0].liability_raw,
      "0",
    );
  },
);
check(
  "payout cannot exceed its funded pending claim, even at the database boundary",
  async () => {
    await pool.query(
      "UPDATE reward_treasury SET balance_raw=100000 WHERE id=$1",
      [game.rewards.id],
    );
    await pool.query(
      "INSERT INTO game_reward_claims(id,user_id,treasury_id,amount_raw,status) VALUES($1,$2,$3,100,$4)",
      ["unpaid-test", a.id, game.rewards.id, "pending"],
    );
    await pool.query(
      "UPDATE reward_treasury SET liability_raw=100 WHERE id=$1",
      [game.rewards.id],
    );
    await assert.rejects(
      pool.query(
        "INSERT INTO game_reward_payouts(id,claim_id,amount_raw,signature,mode) VALUES($1,$2,1000,$3,$4)",
        [randomUUID(), "unpaid-test", "forged", "mock"],
      ),
      /match/,
    );
  },
);
check(
  "production rewards have no invented limits or prices and cannot use the mock pool",
  async () => {
    const real = new ResourceRewards(s, {
      mock: false,
      dailyCap: "0",
      globalCap: "0",
      prices: "{}",
    });
    assert.equal((await real.balance(a.id)).enabled, false);
    assert.throws(() => real.quote("wood", { softwood: 1 }), /paused/);
  },
);
check(
  "native battle checkpoints advance independently and never touch an existing trading checkpoint",
  async () => {
    const { BattleBrains } = await import("../../server/adventure/battle.mjs");
    const pet = "battle-native-test";
    await s.adopt(a.id, pet, "Native battle tester");
    await pool.query(
      "INSERT INTO mochi_brains(mochi_id,pack,life,version) VALUES($1,'traders-0.74.0-v1',$2,84)",
      [pet, { brain: "preserved-trading-checkpoint", pending: "trade" }],
    );
    const before = (
      await pool.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [pet])
    ).rows[0];
    const brains = new BattleBrains(s);
    try {
      const obs = [0.9, 0.9, 0.8, 0.1, 0.16, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 1, 1];
      const a1 = await brains.decide(pet, a.id, obs, 0);
      assert.equal(a1.version, 1);
      const a2 = await brains.decide(pet, a.id, obs, 0.3);
      assert.equal(a2.version, 2);
      const saved = (
        await pool.query(
          "SELECT domain,checkpoint,metrics FROM mochi_battle_brains WHERE mochi_id=$1",
          [pet],
        )
      ).rows[0];
      assert.equal(saved.domain, "battle-v1");
      assert.equal(saved.metrics.decisions, 2);
      assert.equal(JSON.parse(saved.checkpoint.toString()).domain, "battle-v1");
      assert.deepEqual(
        (
          await pool.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [
            pet,
          ])
        ).rows[0],
        before,
      );
      await assert.rejects(
        brains.decide(pet, b.id, obs, 0),
        /not your|belong|own/i,
      );
    } finally {
      brains.close();
    }
  },
);
check(
  "invalid battle actions hold, and the declared follower resumes after combat",
  async () => {
    const { Multiplayer } = await import("../../server/social/multiplayer.mjs");
    const state = await game.state(a.id),
      actor = {
        ...p,
        x: 550,
        y: 590,
        roomId: "forest",
        room: "forest-follow",
        companion: { id: "follow-test", x: 500, y: 590 },
      };
    const m = [...game.instance(actor).mobs.values()][0],
      before = { ...actor.companion };
    await game.petAction(actor, state, m, "CLIENT_FAKE_KILL");
    assert.deepEqual(actor.companion, before);
    const { CompanionFollowController } = await import(
      "../../web/js/game/CompanionFollowController.js"
    );
    const follow = new CompanionFollowController();
    const next = follow.step(
      { ...actor.companion, x: 100, y: 500 },
      { x: 550, y: 590, moving: false },
      "forest",
      0.4,
      now,
    );
    assert(["FOLLOWING", "RETURNING"].includes(next.state));
    assert(
      Math.hypot(next.x - 550, next.y - 590) < Math.hypot(100 - 550, 500 - 590),
    );
  },
);
check(
  "moving after a harvest starts invalidates the completion, without granting a resource",
  async () => {
    now += 40000;
    const n = RESOURCE_NODES[0];
    Object.assign(p, { roomId: n.room, x: n.x, y: n.y, lastMove: 0 });
    const h = await game.action(p, { action: "gather", nodeId: n.id });
    p.lastMove = now + 1;
    now += n.durationMs;
    await assert.rejects(
      game.action(p, { action: "finishGather", harvestId: h.id }),
      /Stay/,
    );
    await game.action(p, { action: "cancelGather" });
    assert.equal(
      (
        await pool.query("SELECT status FROM resource_harvests WHERE id=$1", [
          h.id,
        ])
      ).rows[0].status,
      "cancelled",
    );
  },
);
check(
  "player defeat returns safely without item loss, and Mochi exhaustion is reversible",
  async () => {
    const actor = {
        userId: a.id,
        roomId: "forest",
        room: "defeat-test",
        x: 380,
        y: 280,
        companion: null,
        lastSeen: now,
      },
      state = await game.state(a.id);
    game.multiplayer = {
      store: {
        players: new Map([[a.id, actor]]),
        rooms: new Map([
          ["defeat-test", { players: new Map([[a.id, actor]]) }],
        ]),
      },
      send() {},
      broadcast() {},
      async join(p, id) {
        p.roomId = id;
        p.room = id + "-safe";
        p.x = 550;
        p.y = 840;
      },
    };
    const m = [...game.instance(actor).mobs.values()][0];
    m.target = a.id;
    m.hp = 1000;
    m.damage = 20;
    m.attackAt = 0;
    state.hp = 1;
    state.activePet = null;
    state.target = null;
    state.cooldowns.attack = now + 10000;
    const before = (
      await pool.query(
        "SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 ORDER BY item_id",
        [a.id],
      )
    ).rows;
    await game.tick();
    assert.equal(actor.roomId, "town");
    assert.equal(state.hp, state.stats.maxHp);
    assert.deepEqual(
      (
        await pool.query(
          "SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 ORDER BY item_id",
          [a.id],
        )
      ).rows,
      before,
    );
    actor.roomId = "forest";
    actor.room = "defeat-test";
    actor.x = 380;
    actor.y = 280;
    actor.companion = { id: "pet-exhaust-test", x: 380, y: 280 };
    state.activePet = "pet-exhaust-test";
    state.hp = 100;
    state.petHp = 1;
    state.target = null;
    m.target = a.id;
    m.attackAt = 0;
    now += 2000;
    await game.tick();
    assert.equal(state.petHp, 0);
    assert.equal(actor.companion.state, "EXHAUSTED");
    actor.roomId = "town";
    actor.room = "town-safe";
    actor.companion = null;
    state.activePet = null;
    now += 1000;
    await game.tick();
    assert(state.petHp > 0);
    game.multiplayer = null;
  },
);

check("dummy defeat persists onboarding progress once without real kills, XP or loot", async () => {
  const trainee = {...p,roomId:"yard",room:"training-yard"};
  const dummy = [...game.instance(trainee).mobs.values()].find(m=>m.type==="dummy");
  const state = await game.state(a.id), beforeXp=state.xp.combat, beforeKills=state.progress.kills??0;
  const inventory = async()=> (await pool.query("SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 ORDER BY item_id",[a.id])).rows;
  const beforeInventory=await inventory();
  await game.hit(trainee,state,dummy,9999);
  await game.hit(trainee,state,dummy,9999);
  const persisted=(await pool.query("SELECT state FROM player_adventure WHERE user_id=$1",[a.id])).rows[0].state;
  assert.equal(persisted.progress.trainingDummy,1);
  assert.equal(persisted.progress.kills??0,beforeKills);
  assert.equal(persisted.xp.combat,beforeXp);
  assert.deepEqual(await inventory(),beforeInventory);
});
