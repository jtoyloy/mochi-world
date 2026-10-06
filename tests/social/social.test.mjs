import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import pg from "pg";
import { readFile } from "node:fs/promises";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { WorldService } from "../../server/world/service.mjs";
import { AvatarService } from "../../server/social/avatar.mjs";
import {
  DialogueService,
  TemplateDialogueProvider,
} from "../../server/social/dialogue.mjs";
import { Multiplayer } from "../../server/social/multiplayer.mjs";
import {
  SolanaVerifier,
  TokenService,
  tokenConfig,
  allocation,
  formatToken,
  validateTransfer,
} from "../../server/social/tokens.mjs";
import {
  companionStep,
  walkable,
  validSegment,
} from "../../web/js/game/model.js";
import {
  ITEMS,
  SHOPS,
  ACHIEVEMENTS,
  TROPHIES,
} from "../../web/js/world/catalog.js";
let pool,
  admin,
  schema,
  world,
  avatars,
  dialogue,
  tokens,
  a,
  b,
  c,
  now = Date.parse("2026-10-05T15:00:00Z");
const enabled = !!process.env.TEST_DATABASE_URL,
  check = (name, fn) => test(name, { skip: !enabled }, fn);
before(async () => {
  if (!enabled) return;
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  schema = "social_test_" + Math.random().toString(36).slice(2, 10);
  await admin.query("CREATE SCHEMA " + schema);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  for (const p of [
    "server/schema.sql",
    "server/world/schema.sql",
    "server/social/schema.sql",
  ])
    await pool.query(await readFile(p, "utf8"));
  for (const i of ITEMS)
    await pool.query("INSERT INTO items(id,data) VALUES($1,$2)", [i.id, i]);
  for (const shop of SHOPS)
    await pool.query("INSERT INTO shops(id,slug,data) VALUES($1,$2,$3)", [
      shop.id,
      shop.slug,
      shop,
    ]);
  for (const i of ACHIEVEMENTS)
    await pool.query(
      "INSERT INTO achievement_definitions(id,data) VALUES($1,$2)",
      [i.id, i],
    );
  for (const i of TROPHIES)
    await pool.query("INSERT INTO trophies(id,data) VALUES($1,$2)", [i.id, i]);
  world = new WorldService(pool, { now: () => now });
  avatars = new AvatarService(world);
  dialogue = new DialogueService(world, { now: () => now });
  tokens = new TokenService(world, {
    config: tokenConfig({
      MOCK_TOKEN_MODE: "true",
      DEV_MODE: "true",
      CADENCE_BUYBACK_BPS: "1250",
    }),
    now: () => now,
  });
  a = await world.ensureUser("social_a");
  b = await world.ensureUser("social_b");
  c = await world.ensureUser("social_c");
  await world.adopt(a.id, "pet_a", "Momo");
  await world.adopt(a.id, "pet_a2", "Kiki");
  await world.adopt(b.id, "pet_b", "Bao");
});
after(async () => {
  if (pool) await pool.end();
  if (admin) {
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
test("companion follows, returns from outside radius and rests near stationary owner", () => {
  const owner = { x: 550, y: 580, moving: true },
    p = { x: 100, y: 580, state: "WANDERING" };
  const next = companionStep(p, owner, 0.1, 0);
  assert.equal(next.state, "RETURNING");
  assert(next.x > p.x);
  assert.equal(
    companionStep({ x: 500, y: 590 }, owner, 0.1, 0).state,
    "FOLLOWING",
  );
  assert.equal(
    companionStep({ x: 505, y: 592 }, { ...owner, moving: false }, 0.1, 9000)
      .state,
    "RESTING",
  );
});
test("walkable geometry rejects NaN, wall destinations and fountain-crossing segments", () => {
  assert(!walkable("town", NaN, 500));
  assert(!walkable("town", -680, 500));
  assert(!walkable("town", 600, 430));
  assert(!validSegment("town", 400, 430, 800, 430));
  assert(validSegment("town", 400, 590, 800, 590));
});
test("token amounts remain bigint exact and unset buyback policy stays unset", () => {
  assert.equal(formatToken("9007199254740993123", 6), "9007199254740.993123");
  assert.equal(allocation("1001", 1250), 125n);
  assert.equal(allocation("1001", null), null);
  assert.throws(() =>
    tokenConfig({ MOCK_TOKEN_MODE: "true", DEV_MODE: "false" }),
  );
  assert.throws(() =>
    tokenConfig({
      MOCK_TOKEN_MODE: "true",
      DEV_MODE: "true",
      CADENCE_BUYBACK_BPS: "10001",
    }),
  );
  assert.throws(() => tokenConfig({ MOCK_TOKEN_MODE: "false" }));
});
check(
  "one owned companion is server selected and foreign Mochis cannot be selected",
  async () => {
    await avatars.select(a.id, "pet_a");
    assert.equal((await avatars.companion(a.id)).id, "pet_a");
    await avatars.select(a.id, "pet_a2");
    assert.equal((await avatars.companion(a.id)).id, "pet_a2");
    await assert.rejects(avatars.select(a.id, "pet_b"));
    await avatars.select(a.id, "pet_a");
  },
);
check("avatar persistence validates color and cosmetic ownership", async () => {
  await avatars.update(a.id, { displayName: "Jean", bodyColor: "#4e9bad" });
  assert.equal((await avatars.get(a.id)).display_name, "Jean");
  await assert.rejects(avatars.update(a.id, { bodyColor: "javascript:bad" }));
  await assert.rejects(avatars.update(a.id, { slot: "hat", itemId: "cap" }));
  await world.transaction([a.id], (tx) => world.inventory(tx, a.id, "cap", 1));
  await avatars.update(a.id, { slot: "hat", itemId: "cap" });
  assert.equal((await avatars.get(a.id)).equipment.hat, "cap");
});
class Socket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.messages = [];
  }
  send(data) {
    this.messages.push(JSON.parse(data));
  }
  close(code) {
    this.code = code;
    this.readyState = 3;
    this.emit("close");
  }
  terminate() {
    this.close(1006);
  }
}
check(
  "rooms enforce capacity, transition/leave/disconnect and duplicate connection cleanup",
  async () => {
    const m = new Multiplayer({
      avatars,
      dialogue,
      world,
      capacity: 2,
      now: () => now,
    });
    try {
      const sa = new Socket(),
        sb = new Socket(),
        sc = new Socket();
      await m.connect(sa, a.id);
      await m.connect(sb, b.id);
      await m.connect(sc, c.id);
      const pa = m.store.players.get(a.id),
        pb = m.store.players.get(b.id),
        pc = m.store.players.get(c.id);
      await m.join(pa, "town");
      await m.join(pb, "town");
      await m.join(pc, "town");
      assert.equal(pa.room, pb.room);
      assert.notEqual(pa.room, pc.room);
      assert.equal(m.store.rooms.get(pa.room).players.size, 2);
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 80);
      assert.equal(pc.companion, null);
      await m.handle(pa, { type: "move", data: { x: 720, y: 590 } });
      now += 200;
      m.tick();
      assert(pa.x > 550 && pa.x < 720);
      await assert.rejects(
        m.handle(pa, { type: "move", data: { x: 0, y: 0 } }),
      );
      await assert.rejects(
        m.handle(pa, { type: "emote", data: { emote: "freeform secret" } }),
      );
      const old = pa.room;
      await m.join(pa, "cafe");
      assert(!m.store.rooms.get(old).players.has(a.id));
      sa.close();
      assert(!m.store.players.has(a.id));
      const replacement = new Socket();
      await m.connect(replacement, b.id);
      assert.equal(sb.code, 4001);
      assert(!m.store.rooms.get(old));
      m.disconnect(m.store.players.get(b.id));
      assert(!m.store.players.has(b.id));
    } finally {
      m.close();
    }
  },
);
check(
  "owner speech is private while deliberate room speech reaches other players",
  async () => {
    const m = new Multiplayer({ avatars, dialogue, world, now: () => now });
    try {
      const sa = new Socket(),
        sb = new Socket();
      await m.connect(sa, a.id);
      await m.connect(sb, b.id);
      const pa = m.store.players.get(a.id);
      await m.join(pa, "town");
      await m.join(m.store.players.get(b.id), "town");
      m.speak(pa, {
        mochiId: "pet_a",
        text: "Private",
        visibility: "owner_only",
      });
      assert(!sb.messages.some((e) => e.type === "mochiSpoke"));
      m.speak(pa, { mochiId: "pet_a", text: "Public", visibility: "room" });
      assert(sb.messages.some((e) => e.data.text === "Public"));
    } finally {
      m.close();
    }
  },
);
check(
  "dialogue context is owned, minimal, template grounded and cannot command trades",
  async () => {
    const before = (
      await pool.query("SELECT state FROM mochis WHERE id='pet_a'")
    ).rows[0].state;
    const context = await dialogue.context(a.id, "pet_a", "Buy SOL", "cafe");
    assert(!Object.hasOwn(context, "wallet"));
    assert(!Object.hasOwn(context, "inventory"));
    assert.equal(context.location, "Mochi Café");
    await assert.rejects(dialogue.context(b.id, "pet_a", "hello"));
    const response = await dialogue.talk(a.id, {
      mochiId: "pet_a",
      message: "Buy SOL",
    });
    assert.match(response.text, /paper|simulation/);
    const after = (
      await pool.query("SELECT state FROM mochis WHERE id='pet_a'")
    ).rows[0].state;
    assert.deepEqual(after.portfolio, before.portfolio);
    assert.deepEqual(after.trades, before.trades);
    assert.equal((await dialogue.history(a.id, "pet_a")).length, 2);
    await assert.rejects(dialogue.history(b.id, "pet_a"));
  },
);
check(
  "dialogue caps message length, concurrent requests, rate and sanitizes provider HTML",
  async () => {
    await assert.rejects(
      dialogue.talk(a.id, { mochiId: "pet_a", message: "x".repeat(401) }),
    );
    const d = new DialogueService(world, {
      now: () => now,
      provider: {
        respond: async () => ({
          text: "<script>bad</script>Hello\u0000" + "x".repeat(300),
        }),
      },
    });
    const result = await d.talk(a.id, { mochiId: "pet_a", message: "hello" });
    assert(result.text.length <= 220);
    assert(!result.text.includes("<"));
    for (let i = 0; i < 5; i++)
      await d.talk(a.id, { mochiId: "pet_a", message: "hello" });
    await assert.rejects(
      d.talk(a.id, { mochiId: "pet_a", message: "hello" }),
      (e) => e.status === 429,
    );
    let finish;
    const pending = new DialogueService(world, {
      provider: { respond: () => new Promise((r) => (finish = r)) },
    });
    const first = pending.talk(b.id, { mochiId: "pet_b", message: "hello" });
    while (!finish) await new Promise((r) => setTimeout(r, 1));
    await assert.rejects(
      pending.talk(b.id, { mochiId: "pet_b", message: "again" }),
    );
    finish({ text: "Hi" });
    await first;
  },
);
check(
  "mock NPC payment reserves stock, ignores proposed price and fulfills exactly once",
  async () => {
    const stock = await world.shop("foods");
    const row = stock.stock.find((i) => i.quantity > 0);
    const intent = await tokens.intent(a.id, {
      shopId: "foods",
      itemId: row.item.id,
      quantity: 1,
      price: 0,
    });
    assert.equal(BigInt(intent.amountRaw), BigInt(row.price) * 1000000n);
    const original = (await tokens.balance(a.id)).amountRaw;
    await tokens.fulfill(a.id, intent.id);
    assert.equal(
      BigInt((await tokens.balance(a.id)).amountRaw),
      BigInt(original) - BigInt(intent.amountRaw),
    );
    await assert.rejects(tokens.fulfill(a.id, intent.id));
    const revenue = (await tokens.treasury()).records[0];
    assert.equal(revenue.source, "npc_shop");
    assert.equal(
      BigInt(revenue.allocation_raw),
      (BigInt(intent.amountRaw) * 1250n) / 10000n,
    );
    assert.equal((await tokens.treasury()).burns.length, 0);
  },
);
check(
  "cancel/expiration release NPC reservations without granting an item",
  async () => {
    const shop = await world.shop("foods"),
      row = shop.stock.find((i) => i.quantity > 1);
    const initial = row.quantity;
    const p = await tokens.intent(a.id, {
      shopId: "foods",
      itemId: row.item.id,
    });
    await tokens.cancel(a.id, p.id);
    assert.equal(
      (await world.shop("foods")).stock.find((i) => i.item.id === row.item.id)
        .quantity,
      initial,
    );
    const expired = await tokens.intent(a.id, {
      shopId: "foods",
      itemId: row.item.id,
    });
    now += 300001;
    await assert.rejects(tokens.fulfill(a.id, expired.id));
    const expiredRow = (
      await pool.query("SELECT status FROM token_payment_intents WHERE id=$1", [
        expired.id,
      ])
    ).rows[0];
    assert.equal(expiredRow.status, "expired");
    await world.transaction([], (tx) => tokens.expire(tx));
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM token_payment_intents WHERE id=$1",
          [expired.id],
        )
      ).rows[0].status,
      "expired",
    );
  },
);
check(
  "marketplace reservation prevents double sale, cancellation releases it, and P2P gross is not revenue",
  async () => {
    const listing = await world.createListing(b.id, {
      itemId: "plain",
      quantity: 1,
      price: 25,
    });
    const id = (
      await pool.query(
        "SELECT id FROM player_shop_listings WHERE seller_id=$1",
        [b.id],
      )
    ).rows[0].id;
    const intent = await tokens.intent(a.id, { listingId: id });
    await assert.rejects(tokens.intent(c.id, { listingId: id }));
    await tokens.cancel(a.id, intent.id);
    const retry = await tokens.intent(c.id, { listingId: id });
    const beforeRevenue = (await tokens.treasury()).records.length;
    await tokens.fulfill(c.id, retry.id);
    assert.equal((await tokens.treasury()).records.length, beforeRevenue);
    await assert.rejects(tokens.fulfill(c.id, retry.id));
    assert.equal(
      (await pool.query("SELECT * FROM player_shop_listings WHERE id=$1", [id]))
        .rowCount,
      0,
    );
    assert.equal((await tokens.balance(b.id)).amountRaw, "525000000");
  },
);
check(
  "wallet challenge verifies Ed25519 proof, rejects replay and cross-account linking",
  async () => {
    const pair = nacl.sign.keyPair(),
      key = bs58.encode(pair.publicKey),
      challenge = await tokens.challenge(a.id, key, "http://localhost:8777");
    const signature = bs58.encode(
      nacl.sign.detached(Buffer.from(challenge.message), pair.secretKey),
    );
    await tokens.link(a.id, { challengeId: challenge.id, signature });
    await assert.rejects(
      tokens.link(a.id, { challengeId: challenge.id, signature }),
    );
    const wrong = await tokens.challenge(b.id, key, "http://localhost:8777");
    await assert.rejects(
      tokens.link(b.id, {
        challengeId: wrong.id,
        signature: bs58.encode(
          nacl.sign.detached(Buffer.from(wrong.message), pair.secretKey),
        ),
      }),
    );
    assert.equal((await tokens.balance(a.id)).wallets[0], key);
  },
);
function fixture() {
  const p = {
    id: "payment1",
    mint: "mint",
    sender: "sender",
    recipient: "recipient",
    amount_raw: "20000000",
    decimals: 6,
    created_at: new Date(now - 1000),
    expires_at: new Date(now + 60000),
  };
  const t = {
    blockTime: Math.floor(now / 1000),
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [
          { pubkey: "sender", signer: true },
          { pubkey: "src" },
          { pubkey: "dst" },
        ],
        instructions: [
          {
            programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            parsed: "mochi:payment1",
          },
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsed: {
              type: "transferChecked",
              info: {
                mint: "mint",
                authority: "sender",
                source: "src",
                destination: "dst",
                tokenAmount: { amount: "20000000", decimals: 6 },
              },
            },
          },
        ],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: "mint",
          owner: "sender",
          uiTokenAmount: { amount: "30000000" },
        },
        {
          accountIndex: 2,
          mint: "mint",
          owner: "recipient",
          uiTokenAmount: { amount: "0" },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: "mint",
          owner: "sender",
          uiTokenAmount: { amount: "10000000" },
        },
        {
          accountIndex: 2,
          mint: "mint",
          owner: "recipient",
          uiTokenAmount: { amount: "20000000" },
        },
      ],
    },
  };
  return { p, t };
}
test("SPL verification rejects wrong mint, amount, recipient, sender, failed tx and missing intent memo", () => {
  const { p, t } = fixture();
  assert.equal(validateTransfer(p, t, "sig"), undefined);
  for (const alter of [
    (t) => (t.transaction.message.instructions[1].parsed.info.mint = "wrong"),
    (t) =>
      (t.transaction.message.instructions[1].parsed.info.tokenAmount.amount =
        "1"),
    (t) => (t.meta.postTokenBalances[1].owner = "wrong"),
    (t) => (t.transaction.message.accountKeys[0].signer = false),
    (t) => (t.meta.err = { InstructionError: 1 }),
    (t) => (t.transaction.message.instructions[0].parsed = "different"),
    (t) => (t.blockTime = 0),
  ]) {
    const bad = structuredClone(t);
    alter(bad);
    assert.throws(() => validateTransfer(p, bad, "sig"));
  }
});
check(
  "burn accounting cannot mark a record verified without transaction signatures",
  async () => {
    await assert.rejects(
      pool.query(
        "INSERT INTO cadence_buyback_records(id,status,allocated_raw,verified_at) VALUES('fake','verified',1,now())",
      ),
    );
  },
);
check(
  "actual shared-room encounters strengthen only the two nearby Mochi relationships",
  async () => {
    const m = new Multiplayer({ avatars, dialogue, world, now: () => now });
    try {
      const sa = new Socket(),
        sb = new Socket();
      await m.connect(sa, a.id);
      await m.connect(sb, b.id);
      await m.join(m.store.players.get(a.id), "park");
      await m.join(m.store.players.get(b.id), "park");
      await m.socialEncounters();
      const first = (
        await pool.query(
          "SELECT familiarity FROM mochi_relationships WHERE mochi_a_id='pet_a' AND mochi_b_id='pet_b'",
        )
      ).rows[0].familiarity;
      await m.socialEncounters();
      assert.equal(
        (
          await pool.query(
            "SELECT familiarity FROM mochi_relationships WHERE mochi_a_id='pet_a' AND mochi_b_id='pet_b'",
          )
        ).rows[0].familiarity,
        first,
      );
      for (let i = 0; i < 2; i++) {
        now += 60001;
        await m.socialEncounters();
      }
      assert(
        sa.messages.some(
          (e) => e.type === "mochiSpoke" && e.data.text === "Hi Bao!",
        ),
      );
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM mochi_relationships WHERE mochi_b_id='pet_a2'",
          )
        ).rowCount,
        0,
      );
    } finally {
      m.close();
    }
  },
);
check(
  "home visitors require friendship and home snapshots contain pets/furniture without private state",
  async () => {
    const m = new Multiplayer({ avatars, dialogue, world, now: () => now });
    try {
      const sa = new Socket(),
        sb = new Socket();
      await m.connect(sa, a.id);
      await m.connect(sb, b.id);
      await assert.rejects(
        m.join(m.store.players.get(b.id), "home:" + a.username),
      );
      await m.join(m.store.players.get(a.id), "home:" + a.username);
      const home = sa.messages.find((e) => e.type === "roomSnapshot").data.home;
      assert.equal(home.pets.length, 2);
      assert(home.pets.every((p) => !p.state && !p.brain && !p.wallet));
    } finally {
      m.close();
    }
  },
);
check(
  "verified real-mode adapter fulfills after RPC proof once and rejects reuse of a signature across intents",
  async () => {
    let proofs = 0;
    const real = new TokenService(world, {
      now: () => now,
      config: {
        mock: false,
        network: "devnet",
        mint: "configured-mint",
        decimals: 6,
        bps: null,
        fee: 0,
        treasury: "recipient",
      },
      verifier: {
        balance: async () => 1000000000n,
        verify: async (p, sig) => {
          proofs++;
          if (sig !== "verified-signature")
            throw new Error("Wrong mint or amount proof");
        },
      },
    });
    const p = await real.intent(a.id, { shopId: "foods", itemId: "sushi" });
    await assert.rejects(real.fulfill(a.id, p.id, "bad-proof"));
    await real.fulfill(a.id, p.id, "verified-signature");
    await assert.rejects(real.fulfill(a.id, p.id, "verified-signature"));
    const next = await real.intent(a.id, { shopId: "foods", itemId: "sushi" });
    await assert.rejects(real.fulfill(a.id, next.id, "verified-signature"));
    await real.cancel(a.id, next.id);
    assert(proofs >= 3);
  },
);
check(
  "token reservations release on failed test funding and canceled marketplace checkout",
  async () => {
    const p = await tokens.intent(c.id, { shopId: "foods", itemId: "ramen" });
    await pool.query(
      "UPDATE mock_token_balances SET amount_raw=0 WHERE user_id=$1",
      [c.id],
    );
    await assert.rejects(tokens.fulfill(c.id, p.id));
    await tokens.cancel(c.id, p.id);
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM token_payment_intents WHERE id=$1",
          [p.id],
        )
      ).rows[0].status,
      "failed",
    );
  },
);
check(
  "only marketplace fees, not gross P2P volume, allocate qualifying treasury revenue",
  async () => {
    const feeService = new TokenService(world, {
      config: { ...tokens.config, fee: 1000 },
      now: () => now,
    });
    await pool.query(
      "UPDATE mock_token_balances SET amount_raw=1000000000 WHERE user_id=$1",
      [a.id],
    );
    await world.createListing(b.id, {
      itemId: "plain",
      quantity: 1,
      price: 30,
    });
    const listing = (
      await pool.query(
        "SELECT id FROM player_shop_listings WHERE seller_id=$1",
        [b.id],
      )
    ).rows[0];
    const p = await feeService.intent(a.id, { listingId: listing.id });
    await feeService.fulfill(a.id, p.id);
    const r = (await tokens.treasury()).records.find(
      (r) => r.source === "marketplace_fee",
    );
    assert.equal(r.amount_raw, "3000000");
    assert.equal(r.allocation_raw, "375000");
  },
);
check(
  "simultaneous verified purchases grant stock and item only once",
  async () => {
    await pool.query(
      "UPDATE mock_token_balances SET amount_raw=1000000000 WHERE user_id=$1",
      [a.id],
    );
    const p = await tokens.intent(a.id, { shopId: "foods", itemId: "sushi" });
    const results = await Promise.allSettled([
      tokens.fulfill(a.id, p.id),
      tokens.fulfill(a.id, p.id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (
        await pool.query("SELECT * FROM mock_token_ledger WHERE intent_id=$1", [
          p.id,
        ])
      ).rowCount,
      1,
    );
  },
);
check(
  "startup refuses guessed token configuration, wrong network and accidental mainnet",
  () => {
    assert.throws(() => tokenConfig({ SOLANA_NETWORK: "testnet" }));
    const key = bs58.encode(nacl.sign.keyPair().publicKey);
    assert.throws(() =>
      tokenConfig({
        SOLANA_NETWORK: "mainnet-beta",
        SOLANA_RPC_URL: "https://example.test",
        MOCHI_TOKEN_MINT: key,
        MOCHI_TREASURY_WALLET: key,
      }),
    );
    assert.throws(() =>
      tokenConfig({
        SOLANA_NETWORK: "devnet",
        SOLANA_RPC_URL: "https://example.test",
        MOCHI_TOKEN_MINT: "not a key",
        MOCHI_TREASURY_WALLET: key,
      }),
    );
  },
);

test("startup verifier checks full cluster genesis hash and configured SPL mint decimals", async () => {
  for (const [network, genesis] of [
    ["devnet", "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"],
    ["mainnet-beta", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"],
  ]) {
    const v = new SolanaVerifier({ network, mint: "configured", decimals: 6 });
    v.rpc = async (method) =>
      method === "getGenesisHash"
        ? genesis
        : {
            value: {
              owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              data: { parsed: { type: "mint", info: { decimals: 6 } } },
            },
          };
    await v.validateMint();
    v.config.decimals = 9;
    await assert.rejects(v.validateMint());
    v.config.decimals = 6;
    v.config.network = network === "devnet" ? "mainnet-beta" : "devnet";
    await assert.rejects(v.validateMint());
  }
});
check(
  "home snap placement requires owned equipped furniture and refuses occupied points",
  async () => {
    await assert.rejects(
      avatars.placeFurniture(b.id, { mochiId: "pet_a", slot: "bed", snap: 0 }),
    );
    await assert.rejects(
      avatars.placeFurniture(a.id, {
        mochiId: "pet_a",
        slot: "bed",
        snap: 999,
      }),
    );
    await world.transaction([a.id], (tx) =>
      world.inventory(tx, a.id, "bed", 1),
    );
    await world.equip(a.id, { mochiId: "pet_a", itemId: "bed" });
    await avatars.placeFurniture(a.id, {
      mochiId: "pet_a",
      slot: "bed",
      snap: 2,
    });
    const row = (
      await pool.query("SELECT profile FROM mochis WHERE id=$1", ["pet_a"])
    ).rows[0];
    assert.equal(row.profile.homePositions.bed, 2);
    await world.transaction([a.id], (tx) =>
      world.inventory(tx, a.id, "rug", 1),
    );
    await world.equip(a.id, { mochiId: "pet_a", itemId: "rug" });
    await assert.rejects(
      avatars.placeFurniture(a.id, { mochiId: "pet_a", slot: "rug", snap: 2 }),
    );
  },
);
check(
  "Town resident dialogue is proximity checked, personal context is grounded, and browsing grants nothing",
  async () => {
    const m = new Multiplayer({ avatars, dialogue, world, now: () => now });
    const socket = new Socket();
    try {
      await avatars.select(a.id, "pet_a");
      await m.connect(socket, a.id);
      const p = m.store.players.get(a.id);
      await m.join(p, "town");
      await assert.rejects(m.handle(p, { type: "npc", data: { id: "mina" } }));
      p.x = 100;
      p.y = 300;
      const balance = (await tokens.balance(a.id)).amountRaw;
      now += 2000;
      await m.handle(p, { type: "npc", data: { id: "mina" } });
      const response = socket.messages.findLast(
        (v) => v.type === "npcDialogue",
      ).data;
      assert.equal(response.shop, "foods");
      assert.equal(response.name, "Mina");
      assert.ok(response.line.includes("Warm bowls"));
      assert.equal((await tokens.balance(a.id)).amountRaw, balance);
      await assert.rejects(m.handle(p, { type: "npc", data: { id: "mina" } }));
      now += 2000;
      await assert.rejects(
        m.handle(p, { type: "npc", data: { id: "forged" } }),
      );
      p.x = 350;
      p.y = 415;
      await m.handle(p, { type: "interact", data: { propId: "sit:west" } });
      assert.equal(socket.messages.at(-1).data.propId, "sit:west");
      assert.equal(p.seated.id, "sit:west");
      assert.equal(p.y, 375);
      now += 200;
      m.tick();
      assert.equal(
        socket.messages.findLast((v) => v.type === "playerMoved").data.seated
          .id,
        "sit:west",
      );
      now += 200;
      await m.handle(p, { type: "move", data: { x: 350, y: 500 } });
      assert.equal(p.seated, null);
      assert.ok(p.target);
      p.x = 1000;
      p.y = 850;
      await assert.rejects(
        m.handle(p, { type: "interact", data: { propId: "sit:west" } }),
      );
    } finally {
      m.close();
    }
  },
);

check(
  "human appearance is additive, validated and preserves owned equipment",
  async () => {
    const old = await avatars.get(a.id);
    const changed = await avatars.update(a.id, {
      style: "curly",
      bodyColor: "#8a6c99",
    });
    assert.equal(changed.appearance.style, "curly");
    assert.equal(changed.body_color, "#8a6c99");
    assert.deepEqual(changed.equipment, old.equipment);
    await assert.rejects(avatars.update(a.id, { style: "forged" }));
    assert.equal((await avatars.get(a.id)).appearance.style, "curly");
  },
);
