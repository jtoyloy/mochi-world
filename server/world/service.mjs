import { randomUUID, createHash } from "node:crypto";
import {
  ITEMS,
  SHOPS,
  LOCATIONS,
  DAILY_ACTIVITIES,
} from "../../web/js/world/catalog.js";
import { World, BODY } from "../../web/js/world.js";
import {
  newPersonality,
  petStats,
  interact,
  updatePersonality,
} from "../../web/js/traders/pet.js";
import { newPortfolio, portfolioValue } from "../../web/js/traders/trading.js";
export const itemById = new Map(ITEMS.map((x) => [x.id, x]));
export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const integer = (value, min = 1, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new GameError("Enter a valid whole number");
  return value;
};
export function calendarDay(
  now = Date.now(),
  zone = process.env.GAME_TIMEZONE ?? "America/New_York",
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}
export const hashNumber = (text) =>
  createHash("sha256").update(text).digest().readUInt32BE(0);
const safeUser = (row) =>
  row
    ? {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        coins: row.coins,
        profile: row.profile,
        createdAt: row.created_at,
      }
    : null;
export class WorldService {
  constructor(pool, { now = () => Date.now() } = {}) {
    this.pool = pool;
    this.now = now;
  }
  async transaction(userIds, fn) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of [...new Set(userIds)].sort())
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "user:" + id,
        ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async event(tx, userId, type, payload) {
    await tx.query(
      "INSERT INTO user_events(id,user_id,type,payload,created_at) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), userId, type, payload, new Date(this.now())],
    );
  }
  async coins(
    tx,
    userId,
    amount,
    type,
    metadata = {},
    relatedUser = null,
    itemId = null,
    { mirrorMockTokens = true } = {},
  ) {
    integer(Math.abs(amount), 0);
    if (this.tokenConfig?.mock && !mirrorMockTokens) {
      // Freeze the pre-commerce mock compatibility balance before soft Coins
      // change; TokenService's lazy initial balance must never include this delta.
      await tx.query(
        "INSERT INTO mock_token_balances(user_id,amount_raw) SELECT id,coins::numeric*$2::numeric FROM users WHERE id=$1 ON CONFLICT DO NOTHING",
        [userId, (10n ** BigInt(this.tokenConfig.decimals)).toString()],
      );
    }
    const result = await tx.query(
      "UPDATE users SET coins=coins+$2 WHERE id=$1 AND coins+$2>=0 RETURNING coins",
      [userId, amount],
    );
    if (!result.rows.length) throw new GameError("Not enough Mochi Coins");
    await tx.query(
      "INSERT INTO currency_transactions(id,user_id,amount,type,metadata,related_user_id,related_item_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        userId,
        amount,
        type,
        metadata,
        relatedUser,
        itemId,
        new Date(this.now()),
      ],
    );
    if (mirrorMockTokens && this.tokenConfig?.mock && amount > 0) {
      const scale = (10n ** BigInt(this.tokenConfig.decimals)).toString();
      await tx.query(
        "INSERT INTO mock_token_balances(user_id,amount_raw) VALUES($1,$2::numeric*$3::numeric) ON CONFLICT(user_id) DO UPDATE SET amount_raw=mock_token_balances.amount_raw+$4::numeric",
        [
          userId,
          result.rows[0].coins,
          scale,
          (BigInt(amount) * BigInt(scale)).toString(),
        ],
      );
      await tx.query(
        "INSERT INTO mock_token_ledger(id,user_id,amount_raw,type) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          userId,
          (BigInt(amount) * BigInt(scale)).toString(),
          type,
        ],
      );
    }
    return result.rows[0].coins;
  }
  async inventory(tx, userId, itemId, amount, location = "bag") {
    if (!itemById.has(itemId)) throw new GameError("Unknown item");
    if (!["bag", "storage"].includes(location))
      throw new GameError("Unknown storage location");
    if (amount > 0) {
      await tx.query(
        "INSERT INTO player_inventory(user_id,item_id,location,quantity) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,item_id,location) DO UPDATE SET quantity=player_inventory.quantity+$4",
        [userId, itemId, location, amount],
      );
      await tx.query(
        "INSERT INTO collection_entries(user_id,item_id,discovered_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [userId, itemId, new Date(this.now())],
      );
    } else {
      const result = await tx.query(
        "UPDATE player_inventory SET quantity=quantity+$4 WHERE user_id=$1 AND item_id=$2 AND location=$3 AND quantity>=-($4::integer) RETURNING quantity",
        [userId, itemId, location, amount],
      );
      if (!result.rows.length)
        throw new GameError("You do not own that quantity");
      await tx.query(
        "DELETE FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location=$3 AND quantity=0",
        [userId, itemId, location],
      );
    }
  }
  async ensureUser(username, displayName = username, { passwordHash = null } = {}) {
    if (!/^[a-z0-9_-]{3,24}$/.test(username))
      throw new GameError(
        "Username needs 3–24 lowercase letters, numbers or underscores",
      );
    const id = "user-" + username;
    return this.transaction([id], async (tx) => {
      const old = await tx.query("SELECT * FROM users WHERE username=$1", [
        username,
      ]);
      if (old.rows[0]) {
        if (passwordHash) throw new GameError("That username is already in use.", 409);
        return safeUser(old.rows[0]);
      }
      const row = await tx.query(
        "INSERT INTO users(id,username,display_name,coins,profile,created_at,password_hash) VALUES($1,$2,$3,0,$4,$5,$6) RETURNING *",
        [
          id,
          username,
          displayName,
          { locations: [], careCount: 0, arcadeGames: 0 },
          new Date(this.now()),
          passwordHash,
        ],
      );
      await this.coins(tx, id, 500, "admin", { reason: "Starter Coins" });
      for (const [itemId, n] of [
        ["plain", 3],
        ["ball", 1],
        ["terminal", 1],
      ])
        await this.inventory(tx, id, itemId, n);
      await this.event(tx, id, "welcome", {
        message: "Your first little adventure begins.",
      });
      return { ...safeUser(row.rows[0]), coins: 500 };
    });
  }
  async adopt(userId, id, name) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id))
      throw new GameError("Invalid Mochi ID");
    return this.transaction([userId], async (tx) => {
      const existing = await tx.query("SELECT * FROM mochis WHERE id=$1", [id]);
      if (existing.rows[0]) {
        if (existing.rows[0].user_id !== userId)
          throw new GameError("That Mochi belongs to another explorer", 403);
        return existing.rows[0];
      }
      const state = {
        schema: "mochi-traders/1",
        mochiId: id,
        name,
        portfolio: newPortfolio(),
        personality: newPersonality(),
        economy: { coins: 0, inventory: {}, equipped: {}, achievements: [] },
        trades: [],
        assetIndex: 0,
        step: 0,
        nextDecisionAt: 0,
        pending: null,
      };
      const world = new World({ seed: hashNumber(id) % 100000 });
      world.spawnToy("ball", 300, 420);
      const profile = {
        variant: "Aurora Mochi",
        species: "Mochi",
        color: "Aurora",
        adoptedAt: new Date(this.now()).toISOString(),
        level: 1,
        experience: 0,
        traits: ["Curious"],
        behavior: { care: 0, play: 0, social: 0 },
        homeSlots: {},
      };
      const result = await tx.query(
        "INSERT INTO mochis(id,user_id,name,state,profile,last_pet_tick) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [id, userId, name, state, profile, this.now()],
      );
      await tx.query(
        "INSERT INTO mochi_pet_state(mochi_id,state) VALUES($1,$2)",
        [id, { world: world.snapshot(), personality: state.personality }],
      );
      await tx.query(
        "INSERT INTO equipped_items(mochi_id,slots) VALUES($1,$2)",
        [id, {}],
      );
      await tx.query(
        "UPDATE users SET profile=jsonb_set(profile,'{activeMochi}',to_jsonb($2::text)) WHERE id=$1",
        [userId, id],
      );
      await this.event(tx, userId, "adopted", {
        message: `${name} has a place to call home.`,
        mochiId: id,
      });
      return result.rows[0];
    });
  }
  async account(userId) {
    const user = (
      await this.pool.query("SELECT * FROM users WHERE id=$1", [userId])
    ).rows[0];
    if (!user) throw new GameError("Sign in to a development account", 401);
    return safeUser(user);
  }
  async owner(tx, userId, id) {
    const row = (
      await tx.query("SELECT * FROM mochis WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row || row.user_id !== userId)
      throw new GameError("This is not your Mochi", 403);
    return row;
  }
  async economy(userId, mochiId, database = this.pool) {
    const queries = [
      () => database === this.pool
        ? this.account(userId)
        : database.query("SELECT * FROM users WHERE id=$1", [userId]).then(result => {
            if (!result.rows[0]) throw new GameError("Sign in to a development account", 401);
            return safeUser(result.rows[0]);
          }),
      () => database.query(
        "SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 AND location='bag'",
        [userId],
      ),
      () => database.query("SELECT slots FROM equipped_items WHERE mochi_id=$1", [
        mochiId,
      ]),
      () => database.query(
        "SELECT achievement_id FROM user_achievements WHERE user_id=$1",
        [userId],
      ),
    ];
    let results;
    if (database === this.pool) results = await Promise.all(queries.map(query => query()));
    else {
      results = [];
      for (const query of queries) results.push(await query());
    }
    const [user, items, equipment, awards] = results;
    return {
      coins: user.coins,
      inventory: Object.fromEntries(
        items.rows.map((x) => [x.item_id, x.quantity]),
      ),
      equipped: equipment.rows[0]?.slots ?? {},
      achievements: awards.rows.map((x) => x.achievement_id),
    };
  }
  async pet(id, { tick = true } = {}) {
    let row = (
      await this.pool.query(
        "SELECT m.*,u.username,u.display_name FROM mochis m JOIN users u ON u.id=m.user_id WHERE m.id=$1",
        [id],
      )
    ).rows[0];
    if (!row) throw new GameError("Mochi not found", 404);
    if (tick)
      await this.transaction([row.user_id], async (tx) => {
        const locked = await this.owner(tx, row.user_id, id);
        const brain = (
          await tx.query(
            "SELECT lease_until FROM mochi_brains WHERE mochi_id=$1",
            [id],
          )
        ).rows[0];
        if (
          brain?.lease_until &&
          new Date(brain.lease_until).getTime() > this.now()
        )
          return;
        const pet = (
          await tx.query(
            "SELECT state FROM mochi_pet_state WHERE mochi_id=$1",
            [id],
          )
        ).rows[0]?.state;
        if (!pet?.world) return;
        const hours = Math.max(
          0,
          Math.min(
            24,
            (this.now() - Number(locked.last_pet_tick || this.now())) / 3600000,
          ),
        );
        const world = World.restore(pet.world),
          n = world.m.needs;
        const sleeping = this.now() < locked.state.personality.sleepUntil;
        const sleepHours = Math.max(
          0,
          Math.min(
            hours,
            (Math.min(this.now(), locked.state.personality.sleepUntil) -
              Number(locked.last_pet_tick || this.now())) /
              3600000,
          ),
        );
        const clamp = (x) => Math.max(0, Math.min(1, x));
        n.hunger = clamp(n.hunger + hours * 0.06);
        n.thirst = clamp(n.thirst + hours * 0.05);
        n.boredom = clamp(n.boredom + hours * 0.04);
        n.lonely = clamp(n.lonely + hours * 0.04);
        n.fatigue = clamp(
          n.fatigue + (hours - sleepHours) * 0.035 - sleepHours * 0.18,
        );
        world.m.asleep = sleeping;
        updatePersonality(world, locked.state.personality, this.now());
        await tx.query(
          "UPDATE mochi_pet_state SET state=$2 WHERE mochi_id=$1",
          [
            id,
            { world: world.snapshot(), personality: locked.state.personality },
          ],
        );
        await tx.query(
          "UPDATE mochis SET state=$2,last_pet_tick=$3 WHERE id=$1",
          [id, locked.state, this.now()],
        );
      });
    row = (
      await this.pool.query(
        "SELECT m.*,u.username,u.display_name FROM mochis m JOIN users u ON u.id=m.user_id WHERE m.id=$1",
        [id],
      )
    ).rows[0];
    const [pet, prefs, trophies] = await Promise.all([
      this.pool.query("SELECT state FROM mochi_pet_state WHERE mochi_id=$1", [
        id,
      ]),
      this.pool.query(
        "SELECT kind,item_id,score FROM mochi_preferences WHERE mochi_id=$1 ORDER BY score DESC,item_id",
        [id],
      ),
      this.pool.query(
        "SELECT t.data FROM mochi_trophies mt JOIN trophies t ON t.id=mt.trophy_id WHERE mt.mochi_id=$1",
        [id],
      ),
    ]);
    const world = World.restore(pet.rows[0].state.world),
      stats = petStats(world, row.state.personality),
      economy = await this.economy(row.user_id, id);
    const favorites = {};
    for (const p of prefs.rows)
      if (!favorites[p.kind] && p.score >= 3)
        favorites[p.kind] =
          itemById.get(p.item_id)?.name ??
          LOCATIONS.find((x) => x.id === p.item_id)?.name ??
          p.item_id;
    return {
      id,
      name: row.name,
      owner: { username: row.username, displayName: row.display_name },
      profile: row.profile,
      stats: Object.fromEntries(
        Object.entries(stats).map(([k, v]) => [k, Math.round(v)]),
      ),
      mood: world.m.asleep
        ? "Sleeping"
        : stats.Happiness > 70
          ? "Happy"
          : stats.Happiness > 40
            ? "Settled"
            : "Needs a little care",
      favorites,
      personality: row.profile.traits ?? ["Still getting to know you"],
      tradingStyle:
        row.state.trades.length < 5
          ? "Still learning"
          : row.state.trades.filter((t) => t.side === "BUY").length >
              row.state.trades.length * 0.7
            ? "An eager observer"
            : "Patient explorer",
      portfolio: row.state.portfolio,
      trades: row.state.trades,
      trophies: trophies.rows.map((x) => x.data),
      equipped: economy.equipped,
      homeSlots: row.profile.homeSlots ?? {},
      ageDays: Math.floor(
        (this.now() - new Date(row.profile.adoptedAt).getTime()) / 86400000,
      ),
    };
  }
  async award(tx, userId, id, mochiId = null) {
    const d = (
      await tx.query("SELECT data FROM achievement_definitions WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!d) return;
    const insert = await tx.query(
      "INSERT INTO user_achievements(user_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING achievement_id",
      [userId, id],
    );
    if (insert.rows.length) {
      await this.coins(tx, userId, d.data.reward, "achievement_reward", {
        achievement: id,
      });
      await this.event(tx, userId, "achievement", {
        message: `Achievement earned: ${d.data.name}`,
        achievement: id,
      });
      if (["gourmet", "collector"].includes(id)) {
        await tx.query(
          "INSERT INTO user_trophies(user_id,trophy_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [userId, id],
        );
        if (mochiId)
          await tx.query(
            "INSERT INTO mochi_trophies(mochi_id,trophy_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [mochiId, id],
          );
      }
    }
  }
  async collector(tx, userId) {
    const count = Number(
      (
        await tx.query(
          "SELECT count(*) FROM collection_entries WHERE user_id=$1",
          [userId],
        )
      ).rows[0].count,
    );
    if (count >= 10) await this.award(tx, userId, "collector");
  }
  async stock(tx, shopId) {
    const shop = SHOPS.find((x) => x.id === shopId || x.slug === shopId);
    if (!shop) throw new GameError("Shop not found", 404);
    const cycle = Math.floor(
      this.now() / (shop.restockIntervalMinutes * 60000),
    );
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "shop:" + shop.id,
    ]);
    for (const item of ITEMS.filter(
      (x) => (x.category === shop.category || (shop.id === "blacksmith" && x.category === "armor")) && x.id !== "terminal",
    )) {
      const rarity = {
        common: { n: 8, chance: 100 },
        uncommon: { n: 4, chance: 100 },
        rare: { n: 2, chance: 45 },
        epic: { n: 1, chance: 15 },
        legendary: { n: 1, chance: 5 },
      }[item.rarity];
      const quantity =
        hashNumber(`${shop.id}:${item.id}:${cycle}`) % 100 < rarity.chance
          ? rarity.n
          : 0;
      await tx.query(
        "INSERT INTO shop_stock(shop_id,item_id,quantity,price,cycle,stocked_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(shop_id,item_id) DO UPDATE SET quantity=$3,price=$4,cycle=$5,stocked_at=$6 WHERE shop_stock.cycle<$5",
        [
          shop.id,
          item.id,
          quantity,
          item.baseValue,
          cycle,
          new Date(cycle * shop.restockIntervalMinutes * 60000),
        ],
      );
    }
    return shop;
  }
  async shop(shopId) {
    return this.transaction([], async (tx) => {
      const shop = await this.stock(tx, shopId),
        stock = (
          await tx.query(
            "SELECT * FROM shop_stock WHERE shop_id=$1 ORDER BY item_id",
            [shop.id],
          )
        ).rows;
      return {
        ...shop,
        stock: stock.map((x) => ({
          item: itemById.get(x.item_id),
          quantity: x.quantity,
          price: x.price,
        })),
        nextRestockAt: new Date(
          (Math.floor(this.now() / (shop.restockIntervalMinutes * 60000)) + 1) *
            shop.restockIntervalMinutes *
            60000,
        ).toISOString(),
      };
    });
  }
  async buyNpc(userId, { shopId, itemId, quantity = 1 }) {
    integer(quantity, 1, 50);
    return this.transaction([userId], async (tx) => {
      const shop = await this.stock(tx, shopId);
      const stock = (
        await tx.query(
          "SELECT * FROM shop_stock WHERE shop_id=$1 AND item_id=$2 FOR UPDATE",
          [shop.id, itemId],
        )
      ).rows[0];
      if (!stock || stock.quantity < quantity)
        throw new GameError("Sold out. Watch for the next restock.");
      await this.coins(
        tx,
        userId,
        -integer(stock.price * quantity, 0),
        "shop_purchase",
        { shop: shop.id, quantity },
        null,
        itemId,
      );
      await tx.query(
        "UPDATE shop_stock SET quantity=quantity-$3 WHERE shop_id=$1 AND item_id=$2",
        [shop.id, itemId, quantity],
      );
      await this.inventory(tx, userId, itemId, quantity);
      await this.collector(tx, userId);
      await this.event(tx, userId, "discovered", {
        message: `${quantity} ${itemById.get(itemId).name} joined your collection.`,
        itemId,
      });
      return { message: "Purchase complete" };
    });
  }
  async moveItem(userId, { itemId, quantity = 1, to }) {
    integer(quantity, 1, 100);
    if (!["bag", "storage"].includes(to))
      throw new GameError("Unknown destination");
    return this.transaction([userId], async (tx) => {
      await this.assertUnEquipped(tx, userId, itemId);
      await this.inventory(
        tx,
        userId,
        itemId,
        -quantity,
        to === "bag" ? "storage" : "bag",
      );
      await this.inventory(tx, userId, itemId, quantity, to);
      return { message: "Item moved" };
    });
  }
  async assertUnEquipped(tx, userId, itemId) {
    if ((await tx.query("SELECT to_regclass('player_adventure') AS table_name")).rows[0].table_name) {
      const a=(await tx.query('SELECT state FROM player_adventure WHERE user_id=$1',[userId])).rows[0];
      if(Object.values(a?.state.equipment??{}).includes(itemId)) throw new GameError('Unequip combat gear before moving, listing or gifting it');
    }

    if (
      this.tokenConfig &&
      (
        await tx.query(
          "SELECT 1 FROM player_avatars WHERE user_id=$1 AND equipment::text LIKE $2",
          [userId, '%"' + itemId + '"%'],
        )
      ).rowCount
    )
      throw new GameError("Unequip this penguin cosmetic first");
    const rows = (
      await tx.query(
        "SELECT e.slots,m.profile FROM equipped_items e JOIN mochis m ON m.id=e.mochi_id WHERE m.user_id=$1",
        [userId],
      )
    ).rows;
    for (const row of rows)
      if (
        Object.values(row.slots).includes(itemId) ||
        Object.values(row.profile.homeSlots ?? {}).includes(itemId)
      )
        throw new GameError(
          "Unequip this item before moving, listing or gifting it",
        );
  }
  async equip(userId, { mochiId, itemId, slot, remove = false }) {
    return this.transaction([userId], async (tx) => {
      const pet = await this.owner(tx, userId, mochiId);
      if (remove) {
        if (
          ![
            "hat",
            "glasses",
            "shirt",
            "accessory",
            "bed",
            "plant",
            "rug",
            "computer",
            "toy",
          ].includes(slot)
        )
          throw new GameError("Unknown slot");
        if (["hat", "glasses", "shirt", "accessory"].includes(slot)) {
          const e = (
            await tx.query(
              "SELECT slots FROM equipped_items WHERE mochi_id=$1",
              [mochiId],
            )
          ).rows[0].slots;
          delete e[slot];
          await tx.query(
            "UPDATE equipped_items SET slots=$2 WHERE mochi_id=$1",
            [mochiId, e],
          );
        } else {
          delete pet.profile.homeSlots[slot];
          if(pet.profile.homePositions)delete pet.profile.homePositions[slot];
          await tx.query("UPDATE mochis SET profile=$2 WHERE id=$1", [
            mochiId,
            pet.profile,
          ]);
        }
        return { message: "Item unequipped" };
      }
      const item = itemById.get(itemId);
      if (!item) throw new GameError("Unknown item");
      const actualSlot =
        item.slot ??
        item.furnitureSlot ??
        (item.id === "plant"
          ? "plant"
          : item.category === "toy"
            ? "toy"
            : null);
      if (!actualSlot) throw new GameError("This item cannot be equipped");
      const owned = (
        await tx.query(
          "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag'",
          [userId, itemId],
        )
      ).rows[0];
      if (!owned?.quantity) throw new GameError("You do not own this item");
      if (item.slot) {
        const e = (
          await tx.query("SELECT slots FROM equipped_items WHERE mochi_id=$1", [
            mochiId,
          ])
        ).rows[0].slots;
        e[actualSlot] = itemId;
        await tx.query("UPDATE equipped_items SET slots=$2 WHERE mochi_id=$1", [
          mochiId,
          e,
        ]);
      } else {
        pet.profile.homeSlots ??= {};
        pet.profile.homeSlots[actualSlot] = itemId;
        await tx.query("UPDATE mochis SET profile=$2 WHERE id=$1", [
          mochiId,
          pet.profile,
        ]);
      }
      return { message: `${item.name} equipped` };
    });
  }
  async care(userId, { mochiId, kind, itemId, leaseToken }) {
    await this.pet(mochiId);
    return this.transaction([userId], async (tx) => {
      const pet = await this.owner(tx, userId, mochiId),
        item = itemById.get(itemId);
      const lease = (
        await tx.query(
          "SELECT lease_token,lease_until FROM mochi_brains WHERE mochi_id=$1",
          [mochiId],
        )
      ).rows[0];
      if (
        lease?.lease_until &&
        new Date(lease.lease_until).getTime() > this.now() &&
        lease.lease_token !== leaseToken
      )
        throw new GameError(
          "Care for this Mochi in its open room, or close that room first.",
          409,
        );
      if (!["feed", "play", "pet", "sleep"].includes(kind))
        throw new GameError("Unknown care action");
      if (kind === "feed" || kind === "play") {
        if (item?.category !== (kind === "feed" ? "food" : "toy"))
          throw new GameError("Choose an appropriate item");
        const owned = (
          await tx.query(
            "SELECT quantity FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag'",
            [userId, itemId],
          )
        ).rows[0];
        if (!owned?.quantity) throw new GameError("You do not own this item");
      }
      const data = (
          await tx.query(
            "SELECT state FROM mochi_pet_state WHERE mochi_id=$1 FOR UPDATE",
            [mochiId],
          )
        ).rows[0].state,
        world = World.restore(data.world),
        p = pet.state.personality;
      const now = this.now();
      if (now - (p.lastInteraction[kind] ?? 0) < 5000)
        throw new GameError("Give Mochi a few seconds to enjoy that");
      if (!interact(world, p, kind, itemId, now))
        throw new GameError("Care cooldown");
      if (kind === "sleep") p.sleepUntil = now + 2 * 3600000;
      if (kind === "pet") {
        p.sleepUntil = 0;
        world.wake("pet");
      }
      if (kind === "feed") {
        await this.inventory(tx, userId, itemId, -1);
        const food = item.effects;
        world.m.needs.hunger = Math.max(
          0,
          data.world.m.needs.hunger - food.fullness / 100,
        );
        world.m.needs.lonely = Math.max(
          0,
          world.m.needs.lonely - (food.happiness ?? 0) / 100,
        );
        world.m.needs.fatigue = Math.max(
          0,
          world.m.needs.fatigue - (food.energy ?? 0) / 100,
        );
      }
      if (item) {
        await tx.query(
          "INSERT INTO mochi_preferences(mochi_id,kind,item_id,score) VALUES($1,$2,$3,1) ON CONFLICT(mochi_id,kind,item_id) DO UPDATE SET score=mochi_preferences.score+1",
          [mochiId, item.category, itemId],
        );
      }
      pet.profile.experience = (pet.profile.experience ?? 0) + 1;
      pet.profile.level = 1 + Math.floor(pet.profile.experience / 20);
      pet.profile.behavior ??= { care: 0, play: 0, social: 0 };
      pet.profile.behavior.care++;
      if (kind === "feed")
        pet.profile.behavior.feed = (pet.profile.behavior.feed ?? 0) + 1;
      if (kind === "play") pet.profile.behavior.play++;
      if (kind === "pet") pet.profile.behavior.social++;
      if (
        pet.profile.behavior.care >= 20 &&
        now - (pet.profile.lastTraitUpdate ?? 0) >= 86400000
      ) {
        pet.profile.lastTraitUpdate = now;
        const b = pet.profile.behavior;
        pet.profile.traits = [
          p.curiosity > 65 ? "Curious" : "Patient",
          b.play > b.care * 0.3 ? "Playful" : "Independent",
          b.social > b.care * 0.3 ? "Social" : "Quiet",
        ];
      }
      await tx.query("UPDATE mochi_pet_state SET state=$2 WHERE mochi_id=$1", [
        mochiId,
        { world: world.snapshot(), personality: p },
      ]);
      await tx.query(
        "UPDATE mochis SET state=$2,profile=$3,last_pet_tick=$4 WHERE id=$1",
        [mochiId, pet.state, pet.profile, now],
      );
      const user = (
        await tx.query("SELECT profile FROM users WHERE id=$1", [userId])
      ).rows[0];
      user.profile.careCount =
        (user.profile.careCount ?? 0) + (kind === "feed" ? 1 : 0);
      user.profile.checkedPetDay = calendarDay(now);
      await tx.query("UPDATE users SET profile=$2 WHERE id=$1", [
        userId,
        user.profile,
      ]);
      await this.award(tx, userId, "first-care", mochiId);
      if (pet.profile.behavior.feed >= 10)
        await this.award(tx, userId, "gourmet", mochiId);
      return {
        message: "Your Mochi enjoyed that.",
        world: world.snapshot(),
        personality: p,
      };
    });
  }
  async visit(userId, location) {
    if (
      ![
        "market",
        "arcade",
        "park",
        "trading",
        "arena",
        "bank",
        "research",
        "home",
      ].includes(location)
    )
      throw new GameError("Unknown location");
    return this.transaction([userId], async (tx) => {
      const user = (
        await tx.query("SELECT profile FROM users WHERE id=$1", [userId])
      ).rows[0];
      user.profile.locations ??= [];
      if (!user.profile.locations.includes(location)) {
        user.profile.locations.push(location);
        await this.event(tx, userId, "explore", {
          message: `You discovered ${location}.`,
          location,
        });
      }
      user.profile.visits ??= {};
      if (
        user.profile.activeMochi &&
        user.profile.visits[location] !== calendarDay(this.now())
      )
        await tx.query(
          "INSERT INTO mochi_preferences(mochi_id,kind,item_id,score) VALUES($1,$2,$3,1) ON CONFLICT(mochi_id,kind,item_id) DO UPDATE SET score=mochi_preferences.score+1",
          [user.profile.activeMochi, "location", location],
        );
      user.profile.visits[location] = calendarDay(this.now());
      await tx.query("UPDATE users SET profile=$2 WHERE id=$1", [
        userId,
        user.profile,
      ]);
      if (user.profile.locations.length >= 5)
        await this.award(tx, userId, "explorer");
      return { message: "Welcome to this city corner" };
    });
  }
  async daily(userId, activity) {
    if (!DAILY_ACTIVITIES.some((x) => x.id === activity))
      throw new GameError("Unknown daily");
    return this.transaction([userId], async (tx) => {
      const day = calendarDay(this.now());
      if (
        (
          await tx.query(
            "SELECT 1 FROM daily_claims WHERE user_id=$1 AND activity=$2 AND day=$3",
            [userId, activity, day],
          )
        ).rows.length
      )
        throw new GameError("Already claimed today");
      const profile = (
        await tx.query("SELECT profile FROM users WHERE id=$1", [userId])
      ).rows[0].profile;
      if (activity === "market" && profile.visits?.market !== day)
        throw new GameError("Visit Market Row first");
      if (activity === "pet" && profile.checkedPetDay !== day)
        throw new GameError("Feed, pet, play or sleep with your Mochi first");
      if (activity === "trading" && profile.visits?.trading !== day)
        throw new GameError("Visit the Trading Floor first");
      const random = hashNumber(`${userId}:${day}:gift`),
        reward =
          activity === "gift"
            ? 50 + (random % 101)
            : activity === "pet"
              ? 25
              : activity === "market"
                ? 20
                : 15;
      let itemId = null;
      if (activity === "gift" && random % 10 === 0) {
        itemId = "moon-stamp";
        await this.inventory(tx, userId, itemId, 1);
        await this.collector(tx, userId);
      }
      await this.coins(
        tx,
        userId,
        reward,
        "daily_reward",
        { activity, day },
        null,
        itemId,
      );
      await tx.query(
        "INSERT INTO daily_claims(user_id,activity,day,reward,data) VALUES($1,$2,$3,$4,$5)",
        [userId, activity, day, reward, { itemId }],
      );
      await this.event(tx, userId, "daily", {
        message: `${reward} Coins from ${activity === "gift" ? "the Daily Gift" : activity + " daily"}.`,
        reward,
        itemId,
      });
      return {
        message: `+${reward} Mochi Coins${itemId ? " and a Moonlit City Stamp!" : ""}`,
        reward,
        itemId,
      };
    });
  }
  async createListing(
    userId,
    { itemId, quantity = 1, price, title, description },
  ) {
    const item = itemById.get(itemId);
    integer(quantity, 1, 100);
    integer(price, 1, 100000);
    if (!item?.tradable) throw new GameError("This item cannot be traded");
    return this.transaction([userId], async (tx) => {
      await this.assertUnEquipped(tx, userId, itemId);
      await this.inventory(tx, userId, itemId, -quantity);
      const user = (
        await tx.query("SELECT display_name FROM users WHERE id=$1", [userId])
      ).rows[0];
      await tx.query(
        "INSERT INTO player_shops(user_id,title,description) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET title=$2,description=$3",
        [
          userId,
          String(title ?? `${user.display_name}’s little shop`).slice(0, 80),
          String(
            description ?? "Treasures from one explorer to another.",
          ).slice(0, 300),
        ],
      );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO player_shop_listings(id,seller_id,item_id,quantity,price) VALUES($1,$2,$3,$4,$5)",
        [id, userId, itemId, quantity, price],
      );
      return { message: "Item listed safely in your shop", id };
    });
  }
  async buyListing(userId, { listingId, quantity = 1 }) {
    integer(quantity, 1, 100);
    const lookup = (
      await this.pool.query(
        "SELECT seller_id FROM player_shop_listings WHERE id=$1",
        [listingId],
      )
    ).rows[0];
    if (!lookup) throw new GameError("This listing is no longer available");
    if (lookup.seller_id === userId)
      throw new GameError("This is your own listing");
    return this.transaction([userId, lookup.seller_id], async (tx) => {
      const listing = (
        await tx.query(
          "SELECT * FROM player_shop_listings WHERE id=$1 FOR UPDATE",
          [listingId],
        )
      ).rows[0];
      if (!listing || listing.quantity < quantity)
        throw new GameError("Another explorer already bought this item");
      const cost = integer(listing.price * quantity, 1);
      await this.coins(
        tx,
        userId,
        -cost,
        "shop_purchase",
        { listingId, quantity },
        listing.seller_id,
        listing.item_id,
      );
      await this.coins(
        tx,
        listing.seller_id,
        cost,
        "player_sale",
        { listingId, quantity },
        userId,
        listing.item_id,
      );
      await this.inventory(tx, userId, listing.item_id, quantity);
      if (quantity === listing.quantity)
        await tx.query("DELETE FROM player_shop_listings WHERE id=$1", [
          listingId,
        ]);
      else
        await tx.query(
          "UPDATE player_shop_listings SET quantity=quantity-$2 WHERE id=$1",
          [listingId, quantity],
        );
      await this.event(tx, listing.seller_id, "sale", {
        message: `Your shop sold ${itemById.get(listing.item_id).name} for ${cost} MC.`,
        amount: cost,
      });
      await this.event(tx, userId, "purchase", {
        message: `You bought ${itemById.get(listing.item_id).name} from a neighbor.`,
      });
      await this.award(tx, userId, "first-player-buy");
      await this.collector(tx, userId);
      return { message: "A little treasure changed hands" };
    });
  }
  async cancelListing(userId, listingId) {
    return this.transaction([userId], async (tx) => {
      const listing = (
        await tx.query(
          "SELECT * FROM player_shop_listings WHERE id=$1 AND seller_id=$2 FOR UPDATE",
          [listingId, userId],
        )
      ).rows[0];
      if (!listing) throw new GameError("Listing not found");
      await this.inventory(tx, userId, listing.item_id, listing.quantity);
      await tx.query("DELETE FROM player_shop_listings WHERE id=$1", [
        listingId,
      ]);
      return { message: "Listing returned to your bag" };
    });
  }
  async playerShop(username) {
    const user = (
      await this.pool.query("SELECT * FROM users WHERE username=$1", [username])
    ).rows[0];
    if (!user) throw new GameError("Player not found", 404);
    const [shop, listings] = await Promise.all([
      this.pool.query("SELECT * FROM player_shops WHERE user_id=$1", [user.id]),
      this.pool.query(
        "SELECT * FROM player_shop_listings WHERE seller_id=$1 ORDER BY created_at DESC",
        [user.id],
      ),
    ]);
    return {
      owner: { username: user.username, displayName: user.display_name },
      title: shop.rows[0]?.title ?? `${user.display_name}’s shop`,
      description:
        shop.rows[0]?.description ??
        "A new shop, waiting for its first treasure.",
      listings: listings.rows.map((x) => ({
        id: x.id,
        item: itemById.get(x.item_id),
        quantity: x.quantity,
        price: x.price,
      })),
    };
  }
  async friendRequest(userId, username) {
    const other = (
      await this.pool.query("SELECT id FROM users WHERE username=$1", [
        username,
      ])
    ).rows[0];
    if (!other || other.id === userId)
      throw new GameError("Choose another explorer");
    return this.transaction([userId, other.id], async (tx) => {
      const [a, b] = [userId, other.id].sort();
      if (
        (
          await tx.query(
            "SELECT 1 FROM friendships WHERE user_a_id=$1 AND user_b_id=$2",
            [a, b],
          )
        ).rows.length
      )
        throw new GameError("Already friends");
      if (
        (
          await tx.query(
            "SELECT 1 FROM friend_requests WHERE least(sender_id,recipient_id)=$1 AND greatest(sender_id,recipient_id)=$2 AND status='pending'",
            [a, b],
          )
        ).rows.length
      )
        throw new GameError("A request is already pending");
      await tx.query(
        "INSERT INTO friend_requests(id,sender_id,recipient_id) VALUES($1,$2,$3)",
        [randomUUID(), userId, other.id],
      );
      await this.event(tx, other.id, "friend_request", {
        message: "An explorer would like to be your friend.",
        from: userId,
      });
      return { message: "Friend request sent" };
    });
  }
  async respondFriend(userId, { requestId, accept }) {
    const req = (
      await this.pool.query("SELECT * FROM friend_requests WHERE id=$1", [
        requestId,
      ])
    ).rows[0];
    if (!req || req.recipient_id !== userId)
      throw new GameError("Request not found");
    return this.transaction([req.sender_id, userId], async (tx) => {
      const r = (
        await tx.query(
          "UPDATE friend_requests SET status=$3 WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING *",
          [requestId, userId, accept ? "accepted" : "declined"],
        )
      ).rows[0];
      if (!r) throw new GameError("Request already answered");
      if (accept) {
        const [a, b] = [req.sender_id, userId].sort();
        await tx.query(
          "INSERT INTO friendships(user_a_id,user_b_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [a, b],
        );
        await this.event(tx, req.sender_id, "friend", {
          message: "Your friend request was accepted.",
        });
      }
      return { message: accept ? "A new friend!" : "Request declined" };
    });
  }
  async removeFriend(userId, otherId) {
    const [a, b] = [userId, otherId].sort();
    return this.transaction([a, b], async (tx) => {
      await tx.query(
        "DELETE FROM friendships WHERE user_a_id=$1 AND user_b_id=$2",
        [a, b],
      );
      return { message: "Friend removed" };
    });
  }
  async friends(userId) {
    const [friends, requests] = await Promise.all([
      this.pool.query(
        "SELECT u.id,u.username,u.display_name,u.profile FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a_id=$1 THEN f.user_b_id ELSE f.user_a_id END WHERE f.user_a_id=$1 OR f.user_b_id=$1",
        [userId],
      ),
      this.pool.query(
        "SELECT r.*,u.username,u.display_name FROM friend_requests r JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=$1 AND r.status='pending'",
        [userId],
      ),
    ]);
    return { friends: friends.rows, requests: requests.rows };
  }
  async gift(userId, { username, itemId, quantity = 1 }) {
    integer(quantity, 1, 50);
    if (!itemById.get(itemId)?.tradable)
      throw new GameError("This item cannot be gifted");
    const other = (
      await this.pool.query("SELECT id FROM users WHERE username=$1", [
        username,
      ])
    ).rows[0];
    if (!other || other.id === userId) throw new GameError("Choose a friend");
    return this.transaction([userId, other.id], async (tx) => {
      const [a, b] = [userId, other.id].sort();
      if (
        !(
          await tx.query(
            "SELECT 1 FROM friendships WHERE user_a_id=$1 AND user_b_id=$2",
            [a, b],
          )
        ).rows.length
      )
        throw new GameError("Gifts are for accepted friends");
      await this.assertUnEquipped(tx, userId, itemId);
      await this.inventory(tx, userId, itemId, -quantity);
      await this.inventory(tx, other.id, itemId, quantity);
      await this.event(tx, other.id, "gift", {
        message: `A friend sent you ${itemById.get(itemId).name}.`,
        itemId,
        quantity,
      });
      await tx.query(
        "INSERT INTO currency_transactions(id,user_id,amount,type,related_user_id,related_item_id,metadata) VALUES($1,$2,0,'gift',$3,$4,$5)",
        [randomUUID(), userId, other.id, itemId, { quantity }],
      );
      return { message: "Gift delivered" };
    });
  }
  async startArcade(userId) {
    return this.transaction([userId], async (tx) => {
      const active = (
        await tx.query(
          "SELECT * FROM arcade_rounds WHERE user_id=$1 AND ends_at>$2 AND claimed=false",
          [userId, new Date(this.now())],
        )
      ).rows[0];
      if (active)
        return {
          id: active.id,
          startedAt: active.started_at,
          endsAt: active.ends_at,
          seed: active.seed,
        };
      const id = randomUUID(),
        seed = hashNumber(id) % 100000,
        started = new Date(this.now()),
        ends = new Date(this.now() + 45000);
      await tx.query(
        "INSERT INTO arcade_rounds(id,user_id,started_at,ends_at,seed) VALUES($1,$2,$3,$4,$5)",
        [id, userId, started, ends, seed],
      );
      return { id, seed, startedAt: started, endsAt: ends };
    });
  }
  async hitArcade(userId, { roundId, tick }) {
    integer(tick, 0, 29);
    return this.transaction([userId], async (tx) => {
      const round = (
        await tx.query(
          "SELECT * FROM arcade_rounds WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [roundId, userId],
        )
      ).rows[0];
      if (!round || round.claimed) throw new GameError("Round unavailable");
      const elapsed = this.now() - new Date(round.started_at).getTime();
      if (
        elapsed < tick * 1500 ||
        elapsed > tick * 1500 + 1450 ||
        this.now() > new Date(round.ends_at).getTime()
      )
        throw new GameError("That berry has already passed");
      if (round.hits.includes(tick))
        throw new GameError("Berry already caught");
      round.hits.push(tick);
      await tx.query("UPDATE arcade_rounds SET hits=$2 WHERE id=$1", [
        roundId,
        JSON.stringify(round.hits),
      ]);
      return { score: round.hits.length };
    });
  }
  async finishArcade(userId, roundId) {
    return this.transaction([userId], async (tx) => {
      const round = (
        await tx.query(
          "SELECT * FROM arcade_rounds WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [roundId, userId],
        )
      ).rows[0];
      if (!round || round.claimed) throw new GameError("Round already claimed");
      if (this.now() < new Date(round.ends_at).getTime())
        throw new GameError("Finish the round first");
      const day = calendarDay(this.now()),
        earned = Number(
          (
            await tx.query(
              "SELECT coalesce(sum(reward),0) n FROM arcade_scores WHERE user_id=$1 AND day=$2",
              [userId, day],
            )
          ).rows[0].n,
        ),
        score = round.hits.length,
        reward = Math.max(0, Math.min(score * 3, 100 - earned));
      await tx.query("UPDATE arcade_rounds SET claimed=true WHERE id=$1", [
        roundId,
      ]);
      await tx.query(
        "INSERT INTO arcade_scores(id,user_id,round_id,score,reward,day) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), userId, roundId, score, reward, day],
      );
      if (reward)
        await this.coins(tx, userId, reward, "arcade_reward", {
          roundId,
          score,
          day,
        });
      const user = (
        await tx.query("SELECT profile FROM users WHERE id=$1", [userId])
      ).rows[0];
      user.profile.arcadeGames = (user.profile.arcadeGames ?? 0) + 1;
      await tx.query("UPDATE users SET profile=$2 WHERE id=$1", [
        userId,
        user.profile,
      ]);
      if (score >= 15)
        await tx.query(
          "INSERT INTO user_trophies(user_id,trophy_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [userId, "arcade-master"],
        );
      if (user.profile.arcadeGames >= 10)
        await this.award(tx, userId, "arcade-ten");
      await this.event(tx, userId, "arcade", {
        message: `Caught ${score} berries. Earned ${reward} Coins.`,
        score,
        reward,
      });
      return { score, reward, message: `${score} berries · +${reward} Coins` };
    });
  }
  async publicUser(username) {
    const row = (
      await this.pool.query("SELECT * FROM users WHERE username=$1", [username])
    ).rows[0];
    if (!row) throw new GameError("Explorer not found", 404);
    const [pets, trophies, awards, collection, friends, entries] =
      await Promise.all([
        this.pool.query("SELECT id,name,profile FROM mochis WHERE user_id=$1", [
          row.id,
        ]),
        this.pool.query(
          "SELECT t.data FROM user_trophies ut JOIN trophies t ON t.id=ut.trophy_id WHERE ut.user_id=$1",
          [row.id],
        ),
        this.pool.query(
          "SELECT a.data FROM user_achievements ua JOIN achievement_definitions a ON a.id=ua.achievement_id WHERE ua.user_id=$1",
          [row.id],
        ),
        this.pool.query(
          "SELECT count(*) FROM collection_entries WHERE user_id=$1",
          [row.id],
        ),
        this.friends(row.id),
        this.pool.query(
          "SELECT c.name,e.rank,e.reward FROM competition_entries e JOIN competitions c ON c.id=e.competition_id WHERE e.user_id=$1 AND e.settled_at IS NOT NULL",
          [row.id],
        ),
      ]);
    return {
      username: row.username,
      displayName: row.display_name,
      createdAt: row.created_at,
      profile: row.profile,
      pets: pets.rows,
      trophies: trophies.rows.map((x) => x.data),
      achievements: awards.rows.map((x) => x.data),
      collectionCount: Number(collection.rows[0].count),
      friends: friends.friends,
      competitionRecord: entries.rows,
    };
  }
  async overview(userId) {
    const user = await this.account(userId),
      mochiRows = (
        await this.pool.query(
          "SELECT id,name,profile FROM mochis WHERE user_id=$1",
          [userId],
        )
      ).rows;
    const activeId = user.profile.activeMochi ?? mochiRows[0]?.id;
    const [pet, events, inventory, collections, claims, friends, ledger] =
      await Promise.all([
        activeId ? this.pet(activeId) : null,
        this.pool.query(
          "SELECT id,type,payload,created_at,read_at FROM user_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
          [userId],
        ),
        this.pool.query(
          "SELECT item_id,location,quantity FROM player_inventory WHERE user_id=$1 ORDER BY item_id",
          [userId],
        ),
        this.pool.query(
          "SELECT item_id,discovered_at FROM collection_entries WHERE user_id=$1",
          [userId],
        ),
        this.pool.query(
          "SELECT activity,reward,data FROM daily_claims WHERE user_id=$1 AND day=$2",
          [userId, calendarDay(this.now())],
        ),
        this.friends(userId),
        this.pool.query(
          "SELECT amount,type,metadata,created_at,related_item_id FROM currency_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
          [userId],
        ),
      ]);
    return {
      user,
      mochis: mochiRows,
      activeMochi: pet,
      events: events.rows,
      inventory: inventory.rows.map((x) => ({
        item: itemById.get(x.item_id),
        quantity: x.quantity,
        location: x.location,
      })),
      collection: collections.rows,
      claims: claims.rows,
      friends,
      ledger: ledger.rows,
      day: calendarDay(this.now()),
    };
  }
}
