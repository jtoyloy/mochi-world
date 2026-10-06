import WebSocket from "ws";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";
import {
  ITEMS,
  SHOPS,
  TROPHIES,
  ACHIEVEMENTS,
} from "../../web/js/world/catalog.js";
const enabled = !!process.env.TEST_DATABASE_URL;
let admin, pool, schema, child, pet, cookie, otherCookie;
const origin = "http://127.0.0.1:8896";
async function call(
  path,
  { data, method = data ? "POST" : "GET", session = cookie, headers = {} } = {},
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(session ? { Cookie: session } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  return {
    status: response.status,
    result,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  if (!enabled) return;
  schema = "http_test_" + Math.random().toString(36).slice(2, 10);
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query("CREATE SCHEMA " + schema);
  const db = new URL(process.env.TEST_DATABASE_URL);
  db.searchParams.set("options", "-c search_path=" + schema);
  pool = new pg.Pool({ connectionString: db.href });
  await pool.query(await readFile("server/schema.sql", "utf8"));
  await pool.query(await readFile("server/world/schema.sql", "utf8"));
  await pool.query(await readFile("server/social/schema.sql", "utf8"));
  await pool.query(await readFile("server/adventure/schema.sql", "utf8"));
  for (const item of ITEMS)
    await pool.query("INSERT INTO items(id,data) VALUES($1,$2)", [
      item.id,
      item,
    ]);
  for (const shop of SHOPS)
    await pool.query("INSERT INTO shops(id,slug,data) VALUES($1,$2,$3)", [
      shop.id,
      shop.slug,
      shop,
    ]);
  for (const trophy of TROPHIES)
    await pool.query("INSERT INTO trophies(id,data) VALUES($1,$2)", [
      trophy.id,
      trophy,
    ]);
  for (const d of ACHIEVEMENTS)
    await pool.query(
      "INSERT INTO achievement_definitions(id,data) VALUES($1,$2)",
      [d.id, d],
    );
  child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: db.href,
      PORT: "8896",
      DEV_MODE: "true",
      MOCK_TOKEN_MODE: "true",
      LEGACY_ECONOMY_TESTS: "true",
      MARKET_MODE: "mock",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("HTTP server did not start")),
      10000,
    );
    child.stdout.once("data", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Server exited " + code));
    });
  });
  const first = await call("/api/world");
  cookie = first.cookie;
  assert.equal(first.status, 200);
  pet = (await call("/api/adopt", { data: { name: "HTTP Mochi" } })).result.id;
});
after(async () => {
  if (child) {
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGTERM");
    });
  }
  if (pool) await pool.end();
  if (admin) {
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
});
const check = (name, fn) => test(name, { skip: !enabled }, fn);
check(
  "all specified browser-world routes serve the shell; Classic remains available",
  async () => {
    for (const path of [
      "/",
      "/home",
      "/dailies",
      "/explore",
      "/explore/market",
      "/explore/market/mochi-foods",
      "/explore/arcade",
      "/explore/park",
      "/explore/trading",
      "/explore/arena",
      "/explore/bank",
      "/explore/research",
      "/mochi/" + pet,
      "/mochi/" + pet + "/home",
      "/mochi/" + pet + "/brain",
      "/items/inventory",
      "/items/closet",
      "/items/collection",
      "/items/storage",
      "/shop/devuser",
      "/trading/lab",
      "/trading/portfolio",
      "/trading/competitions",
      "/trading/leaderboard",
      "/community/friends",
      "/community/guilds",
      "/user/devuser",
    ]) {
      const r = await fetch(origin + path);
      assert.equal(r.status, 200, path);
      assert.match(await r.text(), /Mochi World/);
    }
    assert.equal((await fetch(origin + "/classic.html")).status, 200);
  },
);
check(
  "HTTP dailies ignore forged rewards/balances and require persisted calendar claims",
  async () => {
    const before = (await call("/api/world")).result.user.coins;
    const claim = await call("/api/daily", {
      data: {
        activity: "gift",
        reward: 1000000,
        newCoinBalance: 1000000,
        inventory: { quant: 999 },
      },
    });
    assert.equal(claim.status, 200);
    const overview = (await call("/api/world")).result;
    assert.equal(overview.user.coins, before + claim.result.reward);
    assert.ok(claim.result.reward >= 50 && claim.result.reward <= 150);
    assert.ok(!overview.inventory.some((x) => x.item.id === "quant"));
    assert.equal(
      (await call("/api/daily", { data: { activity: "gift" } })).status,
      400,
    );
  },
);
check(
  "HTTP mutations reject a foreign Origin; purchases calculate their own prices",
  async () => {
    assert.equal(
      (
        await call("/api/buy", {
          data: { shopId: "foods", itemId: "plain" },
          headers: { Origin: "https://elsewhere.invalid" },
        })
      ).status,
      403,
    );
    const before = (await call("/api/world")).result.user.coins;
    assert.equal(
      (
        await call("/api/buy", {
          data: {
            shopId: "foods",
            itemId: "plain",
            price: 0,
            newCoinBalance: 999999,
          },
        })
      ).status,
      200,
    );
    assert.equal((await call("/api/world")).result.user.coins, before - 10);
  },
);
check(
  "session ownership blocks other players from reading, leasing or editing a brain",
  async () => {
    const login = await call("/api/dev/login", {
      data: { username: "http_other" },
    });
    otherCookie = login.cookie;
    assert.equal(
      (await call("/api/mochis/" + pet, { session: otherCookie })).status,
      403,
    );
    assert.equal(
      (
        await call("/api/brain/acquire", {
          session: otherCookie,
          data: { mochiId: pet },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/care", {
          session: otherCookie,
          data: { mochiId: pet, kind: "pet", owner: "user-devuser" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/mochis/" + pet, {
          session: otherCookie,
          method: "PUT",
          data: { state: { mochiId: pet }, life: {}, owner: "user-devuser" },
        })
      ).status,
      403,
    );
  },
);
check(
  "HTTP competition entry ignores submitted performance and keeps isolated starting balance",
  async () => {
    const response = await call("/api/competitions/enter", {
      data: { mochiId: pet, portfolio: { cash: 9999999 }, returnPct: 500 },
    });
    assert.equal(response.status, 200);
    const c = (await call("/api/competitions")).result;
    assert.equal(c.entries.length, 1);
    assert.equal(c.entries[0].value, 10000);
    assert.equal(c.entries[0].returnPct, 0);
  },
);
check(
  "HTTP arcade cannot claim a client-proposed score or payout before a round ends",
  async () => {
    const round = (await call("/api/arcade/start", { data: {} })).result;
    assert.equal(
      (
        await call("/api/arcade/hit", {
          data: { roundId: round.id, tick: 29, score: 9999 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/api/arcade/finish", {
          data: { roundId: round.id, score: 9999, reward: 999999 },
        })
      ).status,
      400,
    );
  },
);

check(
  "new token API reserves NPC stock and delivers a test purchase once",
  async () => {
    const login = await call("/api/dev/login", {
      data: { username: "token_http" },
    });
    const session = login.cookie;
    const intent = await call("/api/token/intent", {
      data: { shopId: "foods", itemId: "sushi", quantity: 1, amountRaw: "1" },
      session,
    });
    assert.equal(intent.status, 200);
    assert.equal(intent.result.amountRaw, "20000000");
    const paid = await call("/api/token/verify", {
      data: { intentId: intent.result.id },
      session,
    });
    assert.equal(paid.status, 200);
    assert.equal(
      (
        await call("/api/token/verify", {
          data: { intentId: intent.result.id },
          session,
        })
      ).status,
      409,
    );
    const currency = await call("/api/token/balance", { session });
    assert.equal(currency.result.mock, true);
    assert.equal(currency.result.network, "devnet");
  },
);
function socketClient(session) {
  const ws = new WebSocket("ws://127.0.0.1:8896/socket", {
    headers: { Cookie: session, Origin: origin },
  });
  const events = [],
    waiters = [];
  ws.on("message", (raw) => {
    const e = JSON.parse(raw);
    events.push(e);
    for (const w of [...waiters])
      if (w.type === e.type) {
        clearTimeout(w.timer);
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(e.data);
      }
  });
  return {
    ws,
    events,
    wait(type) {
      const found = events.find((e) => e.type === type);
      if (found) return Promise.resolve(found.data);
      return new Promise((resolve, reject) => {
        const w = {
          type,
          resolve,
          timer: setTimeout(
            () => reject(new Error("Missing socket event " + type)),
            3000,
          ),
        };
        waiters.push(w);
      });
    },
    send(type, data) {
      ws.send(JSON.stringify({ type, data }));
    },
  };
}
check(
  "two authenticated WebSocket users share Town, see companions and emotes, with no ghosts on transition",
  async () => {
    const la = await call("/api/dev/login", {
        data: { username: "socket_alice" },
      }),
      lb = await call("/api/dev/login", { data: { username: "socket_bao" } });
    const pa = await call("/api/adopt", {
        data: { name: "Alice Mochi" },
        session: la.cookie,
      }),
      pb = await call("/api/adopt", {
        data: { name: "Bao Mochi" },
        session: lb.cookie,
      });
    const a = socketClient(la.cookie),
      b = socketClient(lb.cookie);
    try {
      await a.wait("ready");
      await b.wait("ready");
      a.send("joinRoom", { roomId: "town" });
      const snapA = await a.wait("roomSnapshot");
      b.send("joinRoom", { roomId: "town" });
      const snapB = await b.wait("roomSnapshot");
      assert.equal(snapA.instanceId, snapB.instanceId);
      assert.equal(snapB.players.length, 2);
      assert(snapB.players.every((p) => p.companion));
      a.send("emote", { emote: "wave" });
      assert.equal((await b.wait("playerEmoted")).text, "👋");
      a.send("move", { x: 750, y: 590 });
      const moved = await b.wait("playerMoved");
      assert(Number.isFinite(moved.x));
      a.send("joinRoom", { roomId: "cafe" });
      const left = await b.wait("playerLeft");
      assert.equal(left.userId, snapA.selfId);
      b.send("move", { x: -999, y: 0 });
      assert.match((await b.wait("error")).message, /blocked/);
    } finally {
      a.ws.close();
      b.ws.close();
    }
  },
);
test(
  "3D market boards honor mock mode and never require a live price service",
  { skip: !enabled },
  async () => {
    const quote = await call("/api/world-market/SOL");
    assert.equal(quote.status, 200);
    assert.equal(quote.result.source, "mock");
    assert.ok(Number.isFinite(quote.result.price) && quote.result.price > 0);
    assert.equal((await call("/api/world-market/UNKNOWN")).status, 400);
  },
);
test('adventure HTTP grants starter gear once and refuses actions without a live world session',{skip:!enabled},async()=>{
 const first=await call('/api/adventure'),second=await call('/api/adventure');assert.equal(first.status,200);assert.equal(second.result.inventory.find(i=>i.item_id==='basic-sword').quantity,1);assert.equal(second.result.inventory.find(i=>i.item_id==='small-potion').quantity,3);
 const bad=await call('/api/adventure/action',{data:{action:'kill',damage:999999}});assert.equal(bad.status,409);
});
test('authenticated socket spawns authoritative mobs and rejects a forged kill or resource reward',{skip:!enabled},async()=>{
 const client=socketClient(cookie);try{await client.wait('ready');client.send('joinRoom',{roomId:'forest'});const snap=await client.wait('roomSnapshot');assert.equal(snap.roomId,'forest');const room=await client.wait('adventureRoom');assert.equal(room.mobs.length,4);const mob=room.mobs[0];assert.equal(mob.hp,mob.maxHp);client.send('adventure',{action:'kill',targetId:mob.id,damage:99999,xp:99999});assert.match((await client.wait('error')).message,/Unsupported/);const reward=await call('/api/adventure/sell',{data:{vendor:'wood',items:{softwood:999},id:crypto.randomUUID()}});assert([400,429].includes(reward.status));const status=await call('/api/adventure');assert.equal(status.result.rewards.amountRaw,'0');assert.equal(status.result.inventory.filter(i=>i.item_id==='softwood').length,0);}finally{client.ws.close();}
});
