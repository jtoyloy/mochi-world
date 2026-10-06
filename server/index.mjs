import { RuntimeMetrics } from "./world/runtime-metrics.mjs";
import { AccountAuth } from "./world/auth.mjs";
import { AdventureService } from "./adventure/service.mjs";
import { AvatarService } from "./social/avatar.mjs";
import { DialogueService } from "./social/dialogue.mjs";
import { Multiplayer } from "./social/multiplayer.mjs";
import { TokenService } from "./social/tokens.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ASSETS, MockMarketDataProvider } from "../web/js/traders/market.js";
import {
  ITEMS,
  SHOPS,
  LOCATIONS,
  DAILY_ACTIVITIES,
  TROPHIES,
} from "../web/js/world/catalog.js";
import { WorldService, GameError } from "./world/service.mjs";
import { CheckpointCollector } from "./world/checkpoint-retention.mjs";
import { BrainRepository } from "./world/checkpoints.mjs";
import { Competitions } from "./world/competitions.mjs";
import { BrainService } from "./world/brain-service.mjs";
import { portfolioValue } from "../web/js/traders/trading.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. See README for migration and development setup.",
  );
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  service = new WorldService(pool),
  store = new BrainRepository(service),
  competitions = new Competitions(service),
  root = resolve("web");
const runtimeMetrics = process.env.MULTIPLAYER_METRICS === "true" ? new RuntimeMetrics(pool) : null;
const checkpointCollector = new CheckpointCollector(store);
if (!checkpointCollector.policy.enabled) throw new Error(checkpointCollector.policy.reason);
checkpointCollector.start();
const dev = process.env.DEV_MODE === "true";
const authRequired = !dev || process.env.AUTH_REQUIRED === "true";
const auth = new AccountAuth(service, { development: dev });
const avatars = new AvatarService(service),
  dialogue = new DialogueService(service),
  tokens = new TokenService(service);
await tokens.init();
if (process.env.MOCK_MARKET_DATA === "true") process.env.MARKET_MODE = "mock";
service.tokenConfig = tokens.config;
const adventure = new AdventureService(service);
await adventure.init();
let multiplayer;
const history = new Map();
let liveCache = null,
  liveAt = 0;
async function live(symbol) {
  const asset = ASSETS.find((a) => a.symbol === symbol);
  if (!asset) throw new Error("Unknown asset");
  const now = Date.now();
  if (!liveCache || now - liveAt > 60000) {
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", ASSETS.map((a) => a.coinId).join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_vol", "true");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: process.env.COINGECKO_API_KEY
        ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
        : {},
    });
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    liveCache = await response.json();
    liveAt = now;
  }
  const quote = liveCache[asset.coinId];
  if (!quote || !Number.isFinite(quote.usd) || quote.usd <= 0)
    throw new Error("Missing live price");
  const h = history.get(symbol) ?? [];
  if (!h.length || now - h.at(-1).at >= 60000)
    h.push({ at: now, price: quote.usd });
  while (h.length && h[0].at < now - 7200000) h.shift();
  history.set(symbol, h);
  const ret = (minutes) => {
    const old = h.findLast((x) => x.at <= now - minutes * 60000);
    return old ? quote.usd / old.price - 1 : null;
  };
  const returns = h.slice(1).map((x, i) => x.price / h[i].price - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  const snapshot = {
    symbol,
    price: quote.usd,
    return1m: ret(1),
    return5m: ret(5),
    return15m: ret(15),
    return1h: ret(60),
    volume1m: null,
    volume5m: null,
    volumeChange: null,
    volatility:
      returns.length > 1
        ? Math.sqrt(
            returns.reduce((sum, x) => sum + (x - mean) ** 2, 0) /
              returns.length,
          )
        : null,
    volume24h: quote.usd_24h_vol,
    timestamp: now,
    source: "live",
  };
  return snapshot;
}

const brains = new BrainService(service, store, competitions, live);
brains.start();
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(req, maximum = 30000000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > maximum) throw new GameError("Request is too large", 413);
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new GameError("Invalid JSON request.", 400); }
}
async function session(req, res) {
  const userId = await auth.identify(req);
  if (userId) return userId;
  if (authRequired) throw new GameError("Sign in to enter Mochi World.", 401);
  return login(res, "devuser");
}
async function login(res, username) {
  const user = await service.ensureUser(username);
  return auth.issue(res, user.id);
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname;
    let b = {};
    if (!["GET", "HEAD"].includes(req.method)) {
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        throw new GameError("Cross-origin action refused", 403);
      b = await body(req, path.startsWith("/api/auth/") ? 4096 : 30000000);
    }
    if (path.startsWith("/api/")) {
      if (path === "/api/auth/config" && req.method === "GET")
        return json(res, 200, { required: authRequired, development: dev });
      if (["/api/auth/register", "/api/auth/login", "/api/auth/logout"].includes(path)) {
        if (req.method !== "POST") throw new GameError("Use POST for account actions.", 405);
        if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`)
          throw new GameError("Account actions require the same origin.", 403);
        if (path.endsWith("/register")) return json(res, 201, await auth.register(req, res, b));
        if (path.endsWith("/login")) return json(res, 200, await auth.login(req, res, b));
        const revoked = await auth.logout(req, res);
        const actor = revoked && multiplayer.store.players.get(revoked);
        if (actor) {
          multiplayer.disconnect(actor);
          actor.ws.close(4003, "Signed out");
        }
        return json(res, 200, { message: "Signed out on all devices." });
      }
      const user = await session(req, res);
      if (path === "/api/adventure" && req.method === "GET")
        return json(res, 200, await adventure.status(user));
      if (path.startsWith("/api/adventure/") && req.method === "POST") {
        const actor = multiplayer.store.players.get(user);
        if (!actor?.room) throw new GameError("Join the world first", 409);
        const now = Date.now();
        if (now - (actor.lastAdventureRequest ?? 0) < 150)
          throw new GameError("Adventure actions are limited", 429);
        actor.lastAdventureRequest = now;
        if (path === "/api/adventure/action")
          return json(res, 200, await adventure.action(actor, b));
        if (path === "/api/adventure/sell")
          return json(
            res,
            200,
            await adventure.serialize(() =>
              adventure.rewards.sell(user, b, actor),
            ),
          );
        if (path === "/api/adventure/claim")
          return json(
            res,
            200,
            await adventure.serialize(() => adventure.rewards.claim(user, b)),
          );
        throw new GameError("Unknown adventure endpoint", 404);
      }
      if (path === "/api/config")
        return json(res, 200, {
          user: await service.account(user),
          storage: store.mode,
          tokenMode: tokens.config.mock ? "mock" : "spl",
          solanaNetwork: tokens.config.network,
          dialogueProvider: process.env.MOCHI_DIALOGUE_PROVIDER ?? "template",
          marketMode: process.env.MARKET_MODE ?? "mock",
          decisionIntervalMs: 300000,
          development: dev && !authRequired,
          authentication: authRequired,
        });
      if (path === "/api/dev/login" && req.method === "POST") {
        if (!dev || authRequired) throw new GameError("Development login is disabled", 403);
        await login(res, b.username);
        return json(res, 200, { message: "Development account changed" });
      }
      if (path === "/api/world" && req.method === "GET")
        return json(res, 200, {
          ...(await service.overview(user)),
          currency: await tokens.balance(user),
        });
      if (path === "/api/debug/social") {
        if (!dev)
          throw new GameError("Development diagnostics are disabled", 403);
        const p = multiplayer.store.players.get(user);
        const id = (await avatars.companion(user))?.id;
        const brain = id
          ? (
              await pool.query(
                "SELECT pack,version,lease_until FROM mochi_brains WHERE mochi_id=$1",
                [id],
              )
            ).rows[0]
          : null;
        return json(res, 200, {
          room: p?.roomId,
          instance: p?.room,
          status: p?.presence ?? "offline",
          coordinates: p ? { x: p.x, y: p.y } : null,
          activeMochi: p?.companion ?? null,
          brain,
          dialogueProvider: dialogue.provider.constructor.name,
          network: tokens.config.network,
          mint: tokens.config.mint,
        });
      }
      if (path === "/api/avatar" && req.method === "GET")
        return json(res, 200, await avatars.get(user));
      if (path === "/api/token/balance")
        return json(
          res,
          200,
          await tokens.balance(user, url.searchParams.has("refresh")),
        );
      if (path === "/api/treasury")
        return json(res, 200, await tokens.treasury());
      if (path.startsWith("/api/dialogue/") && req.method === "GET")
        return json(
          res,
          200,
          await dialogue.history(user, decodeURIComponent(path.slice(14))),
        );
      if (path === "/api/presence")
        return json(res, 200, {
          online: (await service.friends(user)).friends.map((f) => ({
            userId: f.id,
            status: multiplayer.store.players.get(f.id)?.presence ?? "offline",
          })),
        });
      if (path === "/api/catalog")
        return json(res, 200, {
          items: ITEMS,
          shops: SHOPS,
          locations: LOCATIONS,
          dailies: DAILY_ACTIVITIES,
          trophies: TROPHIES,
        });
      if (path.startsWith("/api/trading/") && req.method === "GET") {
        const id = path.slice(13);
        const pet = (
          await pool.query("SELECT state,user_id FROM mochis WHERE id=$1", [id])
        ).rows[0];
        if (!pet || pet.user_id !== user)
          throw new GameError("This is not your Mochi", 403);
        return json(res, 200, { state: pet.state });
      }
      if (path === "/api/park")
        return json(
          res,
          200,
          (
            await pool.query(
              "SELECT m.id,m.name,m.profile,u.username FROM mochis m JOIN users u ON u.id=m.user_id WHERE u.username IS NOT NULL ORDER BY m.updated_at DESC LIMIT 30",
            )
          ).rows,
        );
      if (path === "/api/shops")
        return json(
          res,
          200,
          (
            await pool.query(
              "SELECT u.username,s.title FROM player_shops s JOIN users u ON u.id=s.user_id ORDER BY s.user_id LIMIT 30",
            )
          ).rows,
        );
      if (path === "/api/competitions" && req.method === "GET")
        return json(res, 200, await competitions.view());
      if (path.startsWith("/api/pet/") && req.method === "GET") {
        const id = decodeURIComponent(path.slice(9)),
          pet = await service.pet(id);
        const relationships = (
          await pool.query(
            "SELECT m.id,m.name,r.familiarity,r.affection,r.trust,r.rivalry FROM mochi_relationships r JOIN mochis m ON m.id=CASE WHEN r.mochi_a_id=$1 THEN r.mochi_b_id ELSE r.mochi_a_id END WHERE r.mochi_a_id=$1 OR r.mochi_b_id=$1 ORDER BY r.familiarity DESC LIMIT 10",
            [id],
          )
        ).rows;
        const b = (
          await pool.query(
            "SELECT metrics FROM mochi_battle_brains WHERE mochi_id=$1",
            [id],
          )
        ).rows[0]?.metrics;
        const battle = b
          ? {
              decisions: b.decisions,
              wins: b.wins ?? 0,
              actions: b.actions ?? {},
              damage: b.damageDealt ?? 0,
              protection: b.protection ?? 0,
              abilities: b.abilities ?? {},
              recent: b.recent ?? [],
            }
          : null;
        return json(res, 200, { ...pet, relationships, battle });
      }
      if (path.startsWith("/api/user/") && req.method === "GET") {
        const name = decodeURIComponent(path.slice(10)),
          u = await service.publicUser(name);
        const avatar =
          (
            await pool.query(
              "SELECT a.display_name,a.body_color,a.equipment FROM player_avatars a JOIN users u ON u.id=a.user_id WHERE u.username=$1",
              [name],
            )
          ).rows[0] ?? null;
        return json(res, 200, { ...u, avatar });
      }
      if (path.startsWith("/api/shop/") && req.method === "GET")
        return json(
          res,
          200,
          await service.playerShop(decodeURIComponent(path.slice(10))),
        );
      if (path.startsWith("/api/npc/") && req.method === "GET")
        return json(
          res,
          200,
          await service.shop(decodeURIComponent(path.slice(9))),
        );
      if (path.startsWith("/api/world-market/") && req.method === "GET") {
        const symbol = path.split("/").at(-1);
        if (!ASSETS.some((a) => a.symbol === symbol))
          throw new GameError("Unknown asset");
        if ((process.env.MARKET_MODE ?? "mock") === "mock") {
          const provider = new MockMarketDataProvider(
            Math.floor(Date.now() / 60000) % 1440,
            { drift: false },
          );
          const snapshot = await provider.getSnapshot(symbol);
          snapshot.timestamp = Date.now();
          return json(res, 200, snapshot);
        }
        try {
          return json(res, 200, await live(symbol));
        } catch (error) {
          return json(res, 503, { error: error.message });
        }
      }
      if (path.startsWith("/api/market/") && req.method === "GET") {
        try {
          return json(res, 200, await live(path.split("/").at(-1)));
        } catch (error) {
          return json(res, 503, { error: error.message });
        }
      }
      if (path === "/api/leaderboard") {
        const rows = (
          await pool.query(
            "SELECT m.id,m.name,m.state,u.username FROM mochis m JOIN users u ON u.id=m.user_id WHERE u.username IS NOT NULL",
          )
        ).rows;
        return json(
          res,
          200,
          rows
            .map((r) => ({
              id: r.id,
              name: r.name,
              username: r.username,
              value: portfolioValue(r.state.portfolio),
              returnPct:
                100 *
                (portfolioValue(r.state.portfolio) /
                  r.state.portfolio.startingBalance -
                  1),
              trades: r.state.trades.length,
            }))
            .sort((a, b) => b.returnPct - a.returnPct),
        );
      }
      if (path.startsWith("/api/mochis/")) {
        const id = path.split("/").at(-1);
        if (req.method === "GET")
          return json(res, 200, await store.load(id, user));
        if (req.method === "PUT") {
          try {
            const saved = await store.save(
              user,
              id,
              b,
              b.leaseToken,
              b.version,
            );
            console.info(
              JSON.stringify({
                event: "brain_checkpoint_saved",
                mochiId: id,
                version: saved.version,
              }),
            );
            return json(res, 200, saved);
          } catch (error) {
            console.info(
              JSON.stringify({
                event: "brain_checkpoint_error",
                mochiId: id,
                reason: error.message,
              }),
            );
            throw error;
          }
        }
      }
      if (req.method === "POST") {
        let answer;
        switch (path) {
          case "/api/avatar":
            answer = await avatars.update(user, b);
            await multiplayer.refresh(user);
            break;
          case "/api/dialogue": {
            const p = multiplayer.store.players.get(user);
            answer = await dialogue.talk(user, b, p?.roomId);
            if (p) multiplayer.speak(p, answer);
            break;
          }
          case "/api/token/intent":
            answer = await tokens.intent(user, b);
            break;
          case "/api/token/verify":
            answer = await tokens.fulfill(user, b.intentId, b.signature);
            break;
          case "/api/token/cancel":
            answer = await tokens.cancel(user, b.intentId);
            break;
          case "/api/wallet/challenge":
            answer = await tokens.challenge(
              user,
              b.publicKey,
              `${dev ? "http" : "https"}://${req.headers.host}`,
            );
            break;
          case "/api/wallet/link":
            answer = await tokens.link(user, b);
            break;

          case "/api/active":
            answer = await avatars.select(user, b.mochiId);
            await multiplayer.refresh(user);
            break;
          case "/api/adopt":
            answer = await service.adopt(
              user,
              "mochi-" + randomUUID(),
              String(b.name ?? "Mochi").slice(0, 24),
            );
            break;
          case "/api/visit":
            answer = await service.visit(user, b.location);
            break;
          case "/api/daily":
            answer = await service.daily(user, b.activity);
            break;
          case "/api/buy":
            if (!dev || process.env.LEGACY_ECONOMY_TESTS !== "true")
              throw new GameError("Use token checkout", 409);
            answer = await service.buyNpc(user, b);
            break;
          case "/api/inventory/move":
            answer = await service.moveItem(user, b);
            break;
          case "/api/equip":
            answer = await service.equip(user, b);
            await multiplayer.refresh(user);
            break;
          case "/api/home/place":
            answer = await avatars.placeFurniture(user, b);
            await multiplayer.refresh(user);
            break;
          case "/api/care":
            answer = await service.care(user, b);
            {
              const actor = multiplayer.store.players.get(user);
              if (actor?.room && actor.companion?.id === b.mochiId) {
                const item = ITEMS.find((i) => i.id === b.itemId);
                multiplayer.broadcast(actor.room, "companionReact", {
                  userId: user,
                  mochiId: b.mochiId,
                  kind: b.kind,
                  at: Date.now(),
                });
                multiplayer.speak(actor, {
                  mochiId: b.mochiId,
                  text:
                    b.kind === "feed"
                      ? `Thank you for the ${item?.name ?? "snack"}!`
                      : b.kind === "play"
                        ? "Playtime!"
                        : b.kind === "sleep"
                          ? "A cozy little rest…"
                          : "Hehe!",
                  visibility: "room",
                });
              }
            }
            break;
          case "/api/listings/create":
            answer = await service.createListing(user, b);
            break;
          case "/api/listings/buy":
            if (!dev || process.env.LEGACY_ECONOMY_TESTS !== "true")
              throw new GameError("Use token checkout", 409);
            answer = await service.buyListing(user, b);
            break;
          case "/api/listings/cancel":
            if (
              (
                await pool.query(
                  "SELECT 1 FROM listing_reservations r JOIN player_shop_listings l ON l.id=r.listing_id WHERE l.id=$1 AND l.seller_id=$2 AND r.expires_at>now()",
                  [b.listingId, user],
                )
              ).rowCount
            )
              throw new GameError(
                "An active checkout reserved this listing",
                409,
              );
            answer = await service.cancelListing(user, b.listingId);
            break;
          case "/api/friends/request":
            answer = await service.friendRequest(user, b.username);
            break;
          case "/api/friends/respond":
            answer = await service.respondFriend(user, b);
            break;
          case "/api/friends/remove":
            answer = await service.removeFriend(user, b.userId);
            break;
          case "/api/gift":
            answer = await service.gift(user, b);
            break;
          case "/api/arcade/start":
            answer = await service.startArcade(user);
            break;
          case "/api/arcade/hit":
            answer = await service.hitArcade(user, b);
            break;
          case "/api/arcade/finish":
            answer = await service.finishArcade(user, b.roundId);
            break;
          case "/api/competitions/enter":
            answer = await competitions.enter(user, b.mochiId);
            break;
          case "/api/brain/acquire":
            answer = await store.acquire(user, b.mochiId);
            break;
          case "/api/brain/heartbeat":
            answer = await store.heartbeat(user, b.mochiId, b.token);
            break;
          case "/api/brain/release":
            answer = await store.release(user, b.mochiId, b.token);
            break;
          case "/api/events/read":
            await pool.query(
              "UPDATE user_events SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
              [user],
            );
            answer = { message: "Caught up" };
            break;
          default:
            throw new GameError("Unknown action", 404);
        }
        if (answer?.message)
          answer.message = answer.message.replace(
            /\bCoins\b|\bMC\b/g,
            tokens.config.mock
              ? "TEST $MOCHI"
              : "reward points (no token transfer)",
          );
        return json(res, 200, answer);
      }
      throw new GameError("Unknown API route", 404);
    }
    if (req.method !== "GET") throw new GameError("Method not allowed", 405);
    const spa =
      path === "/" ||
      /^\/(pets|world|settings|wallet|treasury|dailies|home|explore|mochi|user|items|inventory|storage|closet|collection|shop|shops|trading|leaderboard|community|friends|guilds|room|trade|arena|debug|research)(\/.*)?$/.test(
        path,
      );
    const file = resolve(
      root,
      spa ? "index.html" : "." + decodeURIComponent(path),
    );
    if (!file.startsWith(root + sep)) throw new GameError("Forbidden", 403);
    if (!(await stat(file)).isFile()) throw new GameError("Not found", 404);
    const type =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".py": "text/plain",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(file)] ?? "application/octet-stream";
    let contentFile = file,
      encoding;
    if (path.startsWith("/build/") && path.endsWith(".js")) {
      const accept = req.headers["accept-encoding"] ?? "";
      encoding = accept.includes("br")
        ? "br"
        : accept.includes("gzip")
          ? "gzip"
          : undefined;
      if (encoding) {
        try {
          await stat(file + "." + (encoding === "gzip" ? "gz" : "br"));
          contentFile = file + "." + (encoding === "gzip" ? "gz" : "br");
        } catch {
          encoding = undefined;
        }
      }
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      ...(encoding
        ? { "Content-Encoding": encoding, Vary: "Accept-Encoding" }
        : {}),
    });
    res.end(await readFile(contentFile));
  } catch (error) {
    console.error(error.message);
    json(res, error.status ?? (error.code === "ENOENT" ? 404 : 400), {
      error: error.message,
    });
  }
});
multiplayer = new Multiplayer({
  server,
  metrics: runtimeMetrics,
  world: service,
  avatars,
  dialogue,
  authenticate: async (req) => {
    const authenticated = await auth.session(req);
    if (!authenticated) throw new GameError("Sign in before joining a room", 401);
    req.sessionExpiresAt = authenticated.expiresAt;
    return authenticated.userId;
  },
});
if (runtimeMetrics) process.on("message", message => {
  if (message === "runtimeMetrics") process.send?.({ runtimeMetrics: { ...runtimeMetrics.sample(multiplayer, adventure), checkpoints: store.diagnostics(), battleWorkers: adventure.brains.workers.diagnostics() } });
});
await adventure.brains.workers.ready();
multiplayer.adventure = adventure;
adventure.attach(multiplayer);
server.listen(
  Number(process.env.PORT ?? 8777),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Mochi World: http://127.0.0.1:${process.env.PORT ?? 8777} · PostgreSQL`,
    ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    runtimeMetrics?.close();
    await checkpointCollector.stop();
    await adventure.close();
    multiplayer.close();
    server.close();
    await brains.stop();
    await pool.end();
    process.exit(0);
  });
