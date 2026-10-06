import { randomUUID } from "node:crypto";
import { GameError, integer } from "../world/service.mjs";
import { BattleBrains } from "./battle.mjs";
import { ResourceRewards } from "./rewards.mjs";
import {
  WEAPONS,
  SPELLS,
  ACCESSORIES,
  ARMOR,
  MOCHI_ABILITIES,
  CONSUMABLES,
  MOB_DEFINITIONS,
  SPAWNS,
  RESOURCE_NODES,
  QUESTS,
  levelFor,
  combatStats,
  damage,
  clampHealth,
  battleReward,
  battleObservation,
  BATTLE_ACTIONS,
} from "../../web/js/game/adventure.js";
import {
  walkable as pointWalkable,
  validSegment as segment,
} from "../../web/js/game/model.js";
const walkable = (room, p) => pointWalkable(room, p.x, p.y);
const validSegment = (room, a, b) => segment(room, a.x, a.y, b.x, b.y);
const fresh = () => ({
  hp: 100,
  mp: 60,
  petHp: 80,
  equipment: { weapon: "basic-sword" },
  spells: ["fire-bolt", "heal"],
  xp: { combat: 0, fishing: 0, woodcutting: 0 },
  cooldowns: {},
  progress: {},
  quests: [],
  starter: true,
});
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function petBattleAbility(pet) {
  const variant = String(pet.profile?.variant ?? "").toLowerCase(),
      species =
        variant.includes("ember") || variant.includes("red")
          ? "ember"
          : variant.includes("mint") || variant.includes("green")
            ? "forest"
            : "moon",
      ability = MOCHI_ABILITIES[species];
  return ability;
}
export class AdventureService {
  constructor(
    service,
    { random = Math.random, brains = null, rewards = null, encounterTtlMs = 120000 } = {},
  ) {
    this.service = service;
    this.pool = service.pool;
    this.random = random;
    this.brains = brains ?? new BattleBrains(service);
    this.rewards = rewards ?? new ResourceRewards(service);
    this.nodeAvailability = new Map();
    this.states = new Map();
    this.instances = new Map();
    this.queue = Promise.resolve();
    this.tickAt = service.now();
    this.lastError = null;
    this.encounterTtlMs = encounterTtlMs;
    this.encounters = new Map();
    this.stopping = false;
  }
  // Invalidate synchronously at the body boundary; native work may still be running.
  departure(p, reason = "departure") {
    const encounter = this.encounters.get(p.userId);
    if (encounter && encounter.player === p) encounter.invalid = reason;
    const state = this.states.get(p.userId);
    if (state) state.target = null;
  }
  executionContext(p, s, m) {
    let encounter = this.encounters.get(p.userId);
    if (!encounter) {
      encounter = { id: randomUUID(), player: p, petId: p.companion.id,
        room: p.room, mob: m, state:s, startedAt: this.service.now(), sequence: 0 };
      this.encounters.set(p.userId, encounter);
    }
    return encounter;
  }
  executionLive(e) {
    return !this.stopping && !e.invalid &&
      this.service.now() - e.startedAt < this.encounterTtlMs &&
      this.encounters.get(e.player.userId) === e &&
      this.multiplayer.store.players.get(e.player.userId) === e.player &&
      e.player.room === e.room && e.player.companion?.id === e.petId &&
      e.state.target === e.mob.id && e.state.hp > 0 && e.state.petHp > 0 &&
      this.instances.get(e.room)?.mobs.get(e.mob.id) === e.mob && e.mob.hp > 0;
  }
  async completeExecution(userId, s) {
    if (!s.battleExecution) return true;
    const {petId, ...options} = s.battleExecution;
    const receipt = await this.battleDecision(petId, userId, [], 0, options);
    if (receipt.unavailable) return false;
    s.battleExecution = null;
    return true;
  }
  async recoverDecision(userId, s) {
    const pending = s.pendingBattleRequest;
    if (!pending) return true;
    // Retry only the identical receipt. An expired uncommitted request is safe
    // to clear; a committed one replays before the database deadline check.
    const answer = await this.battleDecision(pending.petId,userId,
      pending.observation,pending.reward,pending.options);
    if (answer.unavailable) {
      if (answer.error?.includes("deadline")) {
        const owed = pending.options.outcome ?? {};
        for (const [key,value] of Object.entries(owed)) {
          if (key === "battleRequestId") continue;
          s.outcome ??= {};
          s.outcome[key] = typeof value === "number" ? (s.outcome[key] ?? 0) + value : (s.outcome[key] ?? value);
        }
        s.pendingBattleRequest=null; return true;
      }
      return false;
    }
    s.pendingBattleRequest=null;
    s.battleExecution={petId:pending.petId,execution:"cancel",
      requestId:pending.options.requestId+":execution",expectedVersion:answer.version};
    return this.completeExecution(userId,s);
  }
  async closeEncounter(userId, s, reason) {
    if (!await this.recoverDecision(userId,s) || !await this.completeExecution(userId,s)) return false;
    const e = this.encounters.get(userId);
    if (e) e.invalid ??= reason;
    if (!s.inBattle) { this.encounters.delete(userId); return true; }
    const petId = e?.petId ?? s.activePet;
    if (!petId) return false;
    const outcome = s.outcome ?? {};
    const closed = await this.battleDecision(petId, userId,
      [s.hp/s.stats.maxHp,s.petHp/80,0,1,0,0,0,0,0,0,0,0,0,Number(s.petHp<=0),0,1],
      battleReward(outcome), {finish:true,outcome});
    if (closed.unavailable) return false;
    s.outcome = {}; s.inBattle = false; s.target = null;
    this.encounters.delete(userId);
    await this.save(userId, s);
    return true;
  }
  async init() {
    await this.rewards.init();
    for (const row of (
      await this.pool.query("SELECT id,available_at FROM resource_node_state")
    ).rows)
      this.nodeAvailability.set(row.id, Number(row.available_at));
  }
  serialize(fn) {
    if ((this.pendingOperations ?? 0) >= 128)
      return Promise.reject(
        new GameError("Adventure server is busy; try shortly", 429),
      );
    this.pendingOperations = (this.pendingOperations ?? 0) + 1;
    const result = this.queue.then(fn).finally(() => {
      this.pendingOperations--;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  attach(multiplayer) {
    this.multiplayer = multiplayer;
    this.timer = setInterval(() => {
      if (this.tickRunning) return;
      this.tickRunning = true;
      this.serialize(() => this.tick())
        .catch((e) => {
          this.lastError = e.message;
          console.error("Adventure tick:", e.message);
        })
        .finally(() => {
          this.tickRunning = false;
        });
    }, 400);
    this.timer.unref();
  }
  async state(userId) {
    if (this.states.has(userId)) return this.states.get(userId);
    const data = await this.service.transaction([userId], async (tx) => {
      let row = (
        await tx.query(
          "SELECT state FROM player_adventure WHERE user_id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      if (!row) {
        const state = fresh();
        await tx.query(
          "INSERT INTO player_adventure(user_id,state) VALUES($1,$2)",
          [userId, state],
        );
        for (const [id, q] of Object.entries({
          "basic-sword": 1,
          "small-potion": 3,
          "fishing-rod": 1,
          "basic-axe": 1,
        }))
          await this.service.inventory(tx, userId, id, q);
        row = { state };
      }
      return row.state;
    });
    data.stats = combatStats(data.equipment, levelFor(data.xp.combat));
    this.states.set(userId, data);
    return data;
  }
  persisted(s) {
    const clean = structuredClone(s);
    for (const key of [
      "stats",
      "enemyCount",
      "nearbyAllies",
      "now",
      "ownerDamage",
      "petDamage",
      "damageDealt",
      "target",
      "petDecisionAt",
      "savedAt",
    ])
      delete clean[key];
    return clean;
  }
  async save(userId, s) {
    await this.pool.query(
      "UPDATE player_adventure SET state=$2,updated_at=now() WHERE user_id=$1",
      [userId, this.persisted(s)],
    );
  }
  async status(userId) {
    const s = await this.state(userId);
    const inventory = (
      await this.pool.query(
        "SELECT item_id,quantity FROM player_inventory WHERE user_id=$1 AND location='bag' AND quantity>0",
        [userId],
      )
    ).rows;
    const pet = (
      await this.pool.query(
        "SELECT b.mochi_id,b.version,b.metrics FROM mochi_battle_brains b JOIN mochis m ON m.id=b.mochi_id WHERE m.user_id=$1",
        [userId],
      )
    ).rows;
    const harvest = (
      await this.pool.query(
        "SELECT id,node_id,ready_at FROM resource_harvests WHERE user_id=$1 AND status='pending'",
        [userId],
      )
    ).rows[0];
    return {
      player: {
        ...s,
        outcome: undefined,
        levels: Object.fromEntries(
          Object.entries(s.xp).map(([k, v]) => [k, levelFor(v)]),
        ),
      },
      inventory,
      battle: pet,
      harvest,
      rewards: await this.rewards.balance(userId),
      serverTime: this.service.now(),
    };
  }
  instance(p) {
    let room = this.instances.get(p.room);
    if (!room) {
      room = { mobs: new Map(), roomId: p.roomId };
      this.instances.set(p.room, room);
    }
    for (const zone of SPAWNS.filter((z) => z.room === p.roomId))
      for (let i = 0; i < zone.maxAlive; i++) {
        const key = zone.id + ":" + i;
        let m = room.mobs.get(key);
        if (m && !(m.hp <= 0 && this.service.now() >= m.respawnAt)) continue;
        const type = zone.mobTypes[i % zone.mobTypes.length],
          def = MOB_DEFINITIONS[type],
          [x, y] = zone.cells[i % zone.cells.length];
        room.mobs.set(key, {
          ...def,
          id: randomUUID(),
          spawnKey: key,
          type,
          x,
          y,
          home: { x, y },
          hp: def.health,
          maxHp: def.health,
          state: "IDLE",
          attackAt: 0,
          target: null,
          respawnAt: 0,
          zone,
          contributors: {},
        });
      }
    return room;
  }
  mob(p, id) {
    return [...this.instance(p).mobs.values()].find(
      (m) => m.id === id && m.hp > 0,
    );
  }
  publicRoom(p) {
    return {
      room: p.room,
      roomId: p.roomId,
      mobs: [...this.instance(p).mobs.values()].map(
        ({ zone, contributors, home, ...m }) => m,
      ),
      nodes: RESOURCE_NODES.filter((n) => n.room === p.roomId).map((n) => ({
        ...n,
        availableAt: this.nodeAvailability.get(n.id) ?? 0,
      })),
    };
  }
  async audit(userId, kind, data) {
    await this.pool.query(
      "INSERT INTO adventure_events(id,user_id,kind,data) VALUES($1,$2,$3,$4)",
      [randomUUID(), userId, kind, data],
    );
  }
  async action(p, input) {
    return this.serialize(async () => {
      try {
        return await this.perform(p, input);
      } catch (e) {
        await this.audit(p.userId, "refused-action", {
          type: String(input.action ?? "unknown").slice(0, 30),
          reason: e.message,
        });
        throw e;
      }
    });
  }
  async perform(
    p,
    { action, targetId, itemId, slot, spellId, nodeId, harvestId },
  ) {
    if (!p?.room) throw new GameError("Join the world first");
    const s = await this.state(p.userId),
      now = this.service.now();
    if (action === "target") {
      const m = this.mob(p, targetId);
      if (!m) throw new GameError("Choose a living mob in this room");
      if (dist(p, m) > 550) throw new GameError("Target too far away");
      s.target = m.id;
      return { target: m.id };
    }
    if (action === "stop") {
      s.target = null;
      return { stopped: true };
    }
    if (action === "cancelGather") {
      await this.pool.query(
        "UPDATE resource_harvests SET status='cancelled' WHERE user_id=$1 AND status='pending'",
        [p.userId],
      );
      this.effect(p, "gather_cancel");
      return { cancelled: true };
    }
    if (action === "gather") return this.startHarvest(p, nodeId);
    if (action === "finishGather") return this.finishHarvest(p, harvestId);
    if (action === "equip") {
      const next = structuredClone(s);
      const valid =
        slot === "weapon"
          ? WEAPONS[itemId]
          : ["accessory1", "accessory2"].includes(slot)
            ? ACCESSORIES[itemId]
            : ARMOR[itemId]?.slot === slot
              ? ARMOR[itemId]
              : null;
      if (
        !itemId &&
        ["accessory1", "accessory2", "head", "body"].includes(slot)
      )
        delete next.equipment[slot];
      else {
        if (!valid) throw new GameError("Invalid combat equipment slot");
        if ((valid.requiredLevel ?? 1) > levelFor(s.xp.combat))
          throw new GameError("Combat level too low");
        if (
          Object.entries(s.equipment).some(
            ([k, v]) => k !== slot && v === itemId,
          )
        )
          throw new GameError("Already equipped in another slot");
        next.equipment[slot] = itemId;
      }
      next.stats = combatStats(next.equipment, levelFor(next.xp.combat));
      await this.service.transaction([p.userId], async (tx) => {
        if (
          itemId &&
          !(
            await tx.query(
              "SELECT 1 FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag' AND quantity>0 FOR UPDATE",
              [p.userId, itemId],
            )
          ).rowCount
        )
          throw new GameError("Own this item in your bag first");
        await tx.query(
          "UPDATE player_adventure SET state=$2 WHERE user_id=$1",
          [p.userId, this.persisted(next)],
        );
      });
      Object.assign(s, next);
      return { equipment: s.equipment };
    }
    if (action === "learnSpell") {
      if (!SPELLS[spellId]) throw new GameError("Unknown spell");
      if (s.spells.includes(spellId))
        throw new GameError("Spell already learned");
      const next = structuredClone(s);
      next.spells.push(spellId);
      await this.service.transaction([p.userId], async (tx) => {
        await this.service.inventory(tx, p.userId, spellId, -1);
        await tx.query(
          "UPDATE player_adventure SET state=$2 WHERE user_id=$1",
          [p.userId, this.persisted(next)],
        );
      });
      Object.assign(s, next);
      return { spells: s.spells };
    }
    if (s.hp <= 0) throw new GameError("Recover before fighting");
    if (action === "item") {
      const effect = CONSUMABLES[itemId];
      if (!effect) throw new GameError("Not a combat consumable");
      this.cooldown(s, "item", now);
      const next = structuredClone(s);
      if (effect.type === "heal")
        next.hp = clampHealth(
          next.hp + effect.amount * next.stats.healingMultiplier,
          next.stats.maxHp,
        );
      if (effect.type === "mana")
        next.mp = clampHealth(next.mp + effect.amount, next.stats.maxMp);
      if (effect.type === "cleanse") next.poisonUntil = 0;
      if (effect.type === "buff") next.foodUntil = now + effect.durationMs;
      next.cooldowns.item = now + 2500;
      await this.service.transaction([p.userId], async (tx) => {
        await this.service.inventory(tx, p.userId, itemId, -1);
        await tx.query(
          "UPDATE player_adventure SET state=$2 WHERE user_id=$1",
          [p.userId, this.persisted(next)],
        );
      });
      Object.assign(s, next);
      this.effect(p, "item_use", { itemId });
      return { used: itemId };
    }
    if (action === "spell") {
      const spell = SPELLS[spellId];
      if (!spell || !s.spells.includes(spellId))
        throw new GameError("Learn this spell first");
      this.cooldown(s, spellId, now);
      if (s.mp < spell.manaCost) throw new GameError("Not enough mana");
      let m;
      if (["damage", "debuff"].includes(spell.type)) {
        m = this.mob(p, targetId ?? s.target);
        if (!m || dist(p, m) > spell.range || !validSegment(p.roomId, p, m))
          throw new GameError("Target outside spell range");
      }
      s.mp -= spell.manaCost;
      s.cooldowns[spellId] = now + spell.cooldownMs;
      if (spell.type === "heal")
        s.hp = clampHealth(s.hp + spell.power + s.stats.magic, s.stats.maxHp);
      if (spell.type === "buff") s.shieldUntil = now + spell.durationMs;
      if (m) {
        s.target = m.id;
        await this.hit(
          p,
          s,
          m,
          damage(
            spell.power + s.stats.magic,
            1,
            spell.element === "fire" ? s.stats.fireMultiplier : 1,
          ),
        );
        if (spell.type === "debuff") m.slowUntil = now + spell.durationMs;
      }
      this.effect(p, "spell", { spellId, targetId: m?.id });
      await this.save(p.userId, s);
      return { cast: spellId };
    }
    if (action === "skill") {
      const weapon = WEAPONS[s.equipment.weapon];
      this.cooldown(s, "skill", now);
      const m = this.mob(p, targetId ?? s.target);
      if (!m || dist(p, m) > weapon.range || !validSegment(p.roomId, p, m))
        throw new GameError("Target outside weapon range");
      s.cooldowns.skill = now + 6000;
      s.target = m.id;
      await this.hit(
        p,
        s,
        m,
        damage((weapon.attackPower + s.stats.attack) * 1.6, 1),
      );
      this.effect(p, "hit", {
        targetId: m.id,
        weaponType: WEAPONS[s.equipment.weapon]?.type ?? "sword",
      });
      await this.save(p.userId, s);
      return { ability: weapon.abilities[0] };
    }
    throw new GameError("Unsupported adventure action");
  }
  cooldown(s, id, now) {
    if ((s.cooldowns[id] ?? 0) > now)
      throw new GameError("Ability cooling down", 409);
  }
  async owns(userId, id) {
    return (
      (
        await this.pool.query(
          "SELECT 1 FROM player_inventory WHERE user_id=$1 AND item_id=$2 AND location='bag' AND quantity>0",
          [userId, id],
        )
      ).rowCount > 0
    );
  }
  effect(p, kind, data = {}) {
    this.multiplayer?.broadcast(p.room, "combatEffect", {
      kind,
      userId: p.userId,
      at: this.service.now(),
      seq: (this.effectSeq = (this.effectSeq ?? 0) + 1),
      ...data,
    });
  }
  async progress(userId, s, kind, n = 1) {
    s.progress[kind] = (s.progress[kind] ?? 0) + n;
    for (const quest of QUESTS)
      if (
        !s.quests.includes(quest.id) &&
        Object.entries(quest.goals).every(([k, v]) => (s.progress[k] ?? 0) >= v)
      ) {
        await this.service.transaction([userId], async (tx) => {
          const inserted = await tx.query(
            "INSERT INTO adventure_events(id,user_id,kind,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
            [
              "quest:" + userId + ":" + quest.id,
              userId,
              "quest-complete",
              { id: quest.id },
            ],
          );
          if (inserted.rowCount)
            for (const [id, q] of Object.entries(quest.reward))
              await this.service.inventory(tx, userId, id, q);
        });
        s.quests.push(quest.id);
      }
  }
  async startHarvest(p, nodeId) {
    const node = RESOURCE_NODES.find((n) => n.id === nodeId);
    if (!node || node.room !== p.roomId || dist(p, node) > 100)
      throw new GameError("Walk to an available resource node");
    const s = await this.state(p.userId);
    if (levelFor(s.xp[node.kind]) < node.level)
      throw new GameError("Gathering level too low");
    if (
      !(await this.owns(
        p.userId,
        node.kind === "fishing" ? "fishing-rod" : "basic-axe",
      ))
    )
      throw new GameError("A starter tool is needed");
    const now = this.service.now(),
      id = randomUUID();
    const result = await this.service.transaction([p.userId], async (tx) => {
      await tx.query(
        "INSERT INTO resource_node_state(id) VALUES($1) ON CONFLICT DO NOTHING",
        [node.id],
      );
      const state = (
        await tx.query(
          "SELECT * FROM resource_node_state WHERE id=$1 FOR UPDATE",
          [node.id],
        )
      ).rows[0];
      if (Number(state.available_at) > now)
        throw new GameError("This resource is recovering", 409);
      await tx.query(
        "UPDATE resource_harvests SET status='cancelled' WHERE user_id=$1 AND status='pending' AND ready_at<$2",
        [p.userId, now - 30000],
      );
      if (
        (
          await tx.query(
            "SELECT 1 FROM resource_harvests WHERE user_id=$1 AND status='pending'",
            [p.userId],
          )
        ).rowCount
      )
        throw new GameError("Finish your current gathering activity", 409);
      await tx.query(
        "INSERT INTO resource_harvests(id,user_id,node_id,status,starts_at,ready_at,result) VALUES($1,$2,$3,'pending',$4,$5,$6)",
        [
          id,
          p.userId,
          node.id,
          now,
          now + node.durationMs,
          { origin: { room: p.room, x: p.x, y: p.y } },
        ],
      );
      await tx.query(
        "UPDATE resource_node_state SET available_at=$2 WHERE id=$1",
        [node.id, now + node.durationMs + node.cooldownMs],
      );
      s.target = null;
      return {
        id,
        nodeId,
        readyAt: now + node.durationMs,
        durationMs: node.durationMs,
      };
    });
    p.rotation = Math.atan2(node.x - p.x, node.y - p.y);
    p.target = null;
    p.path = [];
    this.nodeAvailability.set(node.id, now + node.durationMs + node.cooldownMs);
    this.effect(p, node.kind === "fishing" ? "fish_start" : "woodcut_start", {
      nodeId,
      durationMs: node.durationMs,
    });
    return result;
  }
  async finishHarvest(p, id) {
    const s = await this.state(p.userId),
      now = this.service.now();
    const next = structuredClone(s);
    const result = await this.service.transaction([p.userId], async (tx) => {
      const h = (
        await tx.query(
          "SELECT * FROM resource_harvests WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, p.userId],
        )
      ).rows[0];
      if (!h || h.status !== "pending")
        throw new GameError(
          "Gathering result unavailable or already granted",
          409,
        );
      const node = RESOURCE_NODES.find((n) => n.id === h.node_id);
      if (now < Number(h.ready_at))
        throw new GameError("Gathering is not finished", 409);
      if (
        now > Number(h.ready_at) + 30000 ||
        p.roomId !== node.room ||
        dist(p, node) > 100 ||
        (p.lastMove ?? 0) > Number(h.starts_at) ||
        (h.result?.origin && p.room !== h.result.origin.room)
      )
        throw new GameError("Stay at the node to finish gathering", 409);
      let roll = this.random(),
        entry = node.table.at(-1);
      for (const e of node.table) {
        roll -= e[1];
        if (roll < 0) {
          entry = e;
          break;
        }
      }
      const result = {
        itemId: entry[0],
        quantity: 1,
        xp: entry[2],
        kind: node.kind,
      };
      await this.service.inventory(tx, p.userId, result.itemId, 1);
      // XP and result commit together; a duplicate completion can never credit either again.
      next.xp[node.kind] += result.xp;
      next.progress[node.kind] = (next.progress[node.kind] ?? 0) + 1;
      const clean = structuredClone(next);
      delete clean.target;
      await tx.query("UPDATE player_adventure SET state=$2 WHERE user_id=$1", [
        p.userId,
        clean,
      ]);
      await tx.query(
        "UPDATE resource_harvests SET status='complete',result=$2,completed_at=$3 WHERE id=$1",
        [id, result, new Date(now)],
      );
      return result;
    });
    Object.assign(s, next);
    await this.progress(p.userId, s, "gathering");
    await this.save(p.userId, s);
    this.effect(p, result.kind);
    return result;
  }
  async hit(p, s, m, amount, pet = false) {
    if (m.hp <= 0) return;
    const beforeHp = m.hp;
    m.hp = clampHealth(m.hp - amount, m.maxHp);
    amount = beforeHp - m.hp;
    m.target = p.userId;
    m.contributors[p.userId] = (m.contributors[p.userId] ?? 0) + amount;
    m.state = "CHASE";
    if (pet) {
      s.outcome ??= {};
      s.outcome.damageDealt = (s.outcome.damageDealt ?? 0) + amount;
      s.damageDealt = (s.damageDealt ?? 0) + amount;
    }
    if (m.hp > 0) return;
    m.state = "DEAD";
    m.respawnAt =
      this.service.now() +
      (m.zone.respawnMinSeconds +
        this.random() * (m.zone.respawnMaxSeconds - m.zone.respawnMinSeconds)) *
        1000;
    const loot = [];
    for (const [id, chance, min, max] of m.drops)
      if (this.random() < chance)
        loot.push([id, min + Math.floor(this.random() * (max - min + 1))]);
    const next = structuredClone(s);
    let inserted = false;
    try {
      await this.service.transaction([p.userId], async (tx) => {
        const record = await tx.query(
          "INSERT INTO combat_encounters(id,user_id,mob_id,result) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
          [m.id, p.userId, m.id, { type: m.type, xp: m.xp, loot }],
        );
        inserted = !!record.rowCount;
        if (!inserted) return;
        for (const [id, q] of loot)
          await this.service.inventory(tx, p.userId, id, q);
        next.xp.combat += m.xp;
        next.stats = combatStats(next.equipment, levelFor(next.xp.combat));
        next.outcome ??= {};
        next.outcome.victory = m.type !== "dummy";
        next.target = null;
        await tx.query(
          "UPDATE player_adventure SET state=$2 WHERE user_id=$1",
          [p.userId, this.persisted(next)],
        );
      });
    } catch (error) {
      m.hp = 1;
      m.state = "CHASE";
      m.respawnAt = 0;
      throw error;
    }
    if (!inserted) return;
    Object.assign(s, next);
    await this.progress(p.userId, s, "kills", m.type === "dummy" ? 0 : 1);
    await this.save(p.userId, s);
    this.effect(p, "victory", { targetId: m.id, loot, xp: m.xp });
  }
  async petAction(p, s, m, action) {
    if (!BATTLE_ACTIONS.includes(action) || !p.companion || s.petHp <= 0)
      return;
    const now = this.service.now(),
      pet = p.companion,
      ability = petBattleAbility(pet);
    s.outcome ??= {};
    if (action === "DEFEND_OWNER") {
      s.ownerGuardUntil = now + 1800;
      pet.state = "DEFENDING";
      this.effect(p, "defend", { pet: true, owner: action === "DEFEND_OWNER" });
    } else if (action === "DEFEND_SELF") {
      s.petGuardUntil = now + 1800;
      pet.state = "DEFENDING";
      this.effect(p, "defend", { pet: true, owner: action === "DEFEND_OWNER" });
    } else if (action === "MOVE_CLOSER" || action === "MOVE_AWAY") {
      const direction = action === "MOVE_CLOSER" ? 1 : -1,
        d = dist(pet, m) || 1,
        q = {
          x: pet.x + ((m.x - pet.x) / d) * 65 * direction,
          y: pet.y + ((m.y - pet.y) / d) * 65 * direction,
        };
      if (
        walkable(p.roomId, q) &&
        validSegment(p.roomId, pet, q) &&
        dist(q, p) < 350
      ) {
        pet.motorPath = [q];
        pet.state = action;
      } else s.outcome.wasted = true;
    } else if (action === "ATTACK" || action === "USE_SPECIAL") {
      if (
        dist(pet, m) > (action === "ATTACK" ? 100 : ability.range) ||
        !validSegment(p.roomId, pet, m)
      ) {
        s.outcome.wasted = true;
        return;
      }
      if (action === "USE_SPECIAL" && (s.petSpecialAt ?? 0) > now) {
        s.outcome.wasted = true;
        return;
      }
      if (action === "USE_SPECIAL") {
        s.petSpecialAt = now + 8000;
        if (ability.guardMs) s.ownerGuardUntil = now + ability.guardMs;
        s.favoriteAbility = ability.name;
      }
      await this.hit(
        p,
        s,
        m,
        damage(
          action === "ATTACK" ? 8 : ability.power,
          1,
          s.stats.petMultiplier,
        ),
        true,
      );
      pet.state = action;
      this.effect(p, action === "ATTACK" ? "pet-hit" : "pet-special", {
        targetId: m.id,
      });
    }
  }
  async battleDecision(id, userId, obs, reward, options = {}) {
    const settlement = options.outcome;
    if (settlement && !options.requestId) {
      settlement.battleRequestId ??= randomUUID();
      options = {...options, requestId: settlement.battleRequestId + (options.finish ? ":finish" : ":tick")};
    }
    try {
      return await this.brains.decide(id, userId, obs, reward, options);
    } catch (error) {
      this.lastError = error.message;
      await this.pool.query(
        "UPDATE mochi_battle_brains b SET metrics=jsonb_set(metrics,'{runtimeRefused}',to_jsonb(coalesce((metrics->>'runtimeRefused')::int,0)+1)) WHERE mochi_id=$1 AND EXISTS(SELECT 1 FROM mochis m WHERE m.id=b.mochi_id AND m.user_id=$2)",
        [id, userId],
      );
      await this.audit(userId, "battle-host-refused", {
        mochiId: id,
        reason: error.message,
      });
      return { action: null, refused: true, unavailable: true, error:error.message };
    }
  }
  async defeat(p, s) {
    s.outcome ??= {};
    s.outcome.ownerDefeated = true;
    s.target = null;
    s.poisonUntil = 0;
    p.target = null;
    p.path = [];
    s.hp = s.stats.maxHp;
    s.mp = s.stats.maxMp;
    await this.multiplayer.join(p, "town");
    this.multiplayer.send(p, "adventureNotice", {
      message:
        "You recovered in Town. Your items are safe; your Mochi can rest here.",
    });
  }
  async tick() {
    if (!this.multiplayer) return;
    const now = this.service.now(),
      dt = Math.min(0.6, Math.max(0, (now - this.tickAt) / 1000));
    this.tickAt = now;
    const decisions = [], settlements = [], presentations = [], decisionRooms = new Set();
    for (const [key, room] of this.instances)
      if (!this.multiplayer.store.rooms.has(key)) this.instances.delete(key);
    // Persist idle cached state before eviction. Combat settlement retains its owner
    // until its existing finish path has run; never discard pending brain feedback.
    for (const [userId, state] of this.states) {
      const e = this.encounters.get(userId);
      if (!await this.recoverDecision(userId,state) || !await this.completeExecution(userId,state)) continue;
      if (state.inBattle && (!this.multiplayer.store.players.has(userId) ||
          (e && !this.executionLive(e))))
        await this.closeEncounter(userId, state, e?.invalid ?? "expired-or-target-removed");
      if (!this.multiplayer.store.players.has(userId) && !state.inBattle) {
        await this.save(userId, state);
        if (!this.multiplayer.store.players.has(userId)) this.states.delete(userId);
      }
    }
    for (const p of this.multiplayer.store.players.values()) {
      if (!p.room) continue;
      // Shared room combat keeps its previous ordering; independent rooms can batch.
      if (decisionRooms.has(p.room)) {
        for (const apply of decisions.splice(0)) await apply();
        decisionRooms.clear();
      }
      decisionRooms.add(p.room);
      const s = await this.state(p.userId);
      if (s.pendingBattleRequest || s.battleExecution) continue;
      await this.advancePoison(p, s, now);
      if (s.activePet !== (p.companion?.id ?? null)) {
        s.petVitals ??= {};
        if (s.activePet) {
          if (s.inBattle)
            await this.battleDecision(
              s.activePet,
              p.userId,
              [
                s.hp / s.stats.maxHp,
                s.petHp / 80,
                0,
                1,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                Number(s.petHp <= 0),
                0,
                1,
              ],
              battleReward(s.outcome ?? {}),
              { finish: true, outcome: s.outcome ?? {} },
            );
          s.petVitals[s.activePet] = {
            hp: s.petHp,
            specialAt: s.petSpecialAt ?? 0,
          };
        }
        s.activePet = p.companion?.id ?? null;
        s.petHp = s.petVitals[s.activePet]?.hp ?? 80;
        s.petSpecialAt = s.petVitals[s.activePet]?.specialAt ?? 0;
        s.outcome = {};
        s.petDecisionAt = 0;
        s.inBattle = false;
        this.encounters.delete(p.userId);
        await this.save(p.userId, s);
      }
      if (p.roomId === "exchange" && !s.progress.tradingHall) {
        await this.progress(p.userId, s, "tradingHall");
        await this.save(p.userId, s);
      }
      const room = this.instance(p);
      let m = this.mob(p, s.target);
      if (!m) {
        s.target = null;
        if (s.inBattle && p.companion) {
          const obs = [
            s.hp / s.stats.maxHp,
            s.petHp / 80,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            Number(s.petHp <= 0),
            0,
            1,
          ];
          const closed = await this.battleDecision(
            p.companion.id,
            p.userId,
            obs,
            battleReward(s.outcome),
            { finish: true, outcome: s.outcome },
          );
          if (!closed.unavailable) {
            s.outcome = {};
            s.inBattle = false;
            this.encounters.delete(p.userId);
          }
          await this.save(p.userId, s);
        }
        if (p.roomId === "town" || p.roomId === "yard") {
          s.hp = clampHealth(s.hp + dt * 4, s.stats.maxHp);
          s.mp = clampHealth(s.mp + dt * 3, s.stats.maxMp);
          s.petHp = clampHealth(s.petHp + dt * 6, 80);
        }
      }
      if (m && s.hp > 0) {
        await this.ownerAttack(p, s, m, now);
        if (
          m.hp > 0 &&
          p.companion &&
          s.petHp > 0 &&
          (s.petDecisionAt ?? 0) <= now
        ) {
          s.petDecisionAt = now + 1400;
          s.inBattle = true;
          s.now = now;
          s.nearbyAllies = [
            ...(this.multiplayer.store.rooms.get(p.room)?.players.values() ??
              []),
          ].filter((other) => other !== p && dist(p, other) < 300).length;
          s.enemyCount = [...room.mobs.values()].filter(
            (x) => x.hp > 0 && dist(p, x) < 350,
          ).length;
          const encounter = this.executionContext(p, s, m);
          const requestId = encounter.id + ":" + (++encounter.sequence);
          const outcome = structuredClone(s.outcome ?? {});
          s.outcome = {};
          const observation = battleObservation(s, p, m, p.companion);
          const options = {outcome, requestId, executionRequired:true,
            ability:s.favoriteAbility ?? null, deadlineAt:Date.now()+1400};
          s.pendingBattleRequest = {petId:encounter.petId, observation,
            reward:battleReward(outcome), options};
          await this.save(p.userId,s);
          const pending = this.battleDecision(encounter.petId, p.userId,
            observation, battleReward(outcome), options);
          pending.catch(() => {}); // Awaited during application; attach rejection handling now.
          decisions.push(async () => {
            const answer = await pending;
            s.ownerDamage = 0;
            s.petDamage = 0;
            s.damageDealt = 0;
            if (!answer.unavailable) {
              s.pendingBattleRequest = null;
              const live = this.executionLive(encounter);
              // The body executes synchronously up to its first await. Its resulting
              // feedback belongs to this motor even if departure occurs during a hit save.
              if (live) await this.petAction(p, s, m, answer.action);
              s.battleExecution = {petId:encounter.petId, execution:live ? "ack" : "cancel",
                requestId:requestId + ":execution", expectedVersion:answer.version};
              const acknowledged = this.completeExecution(p.userId, s);
              acknowledged.catch(() => {});
              settlements.push(async () => {
                await acknowledged;
                if (!this.executionLive(encounter))
                  await this.closeEncounter(p.userId, s, encounter.invalid ?? "stale-response");
                await this.save(p.userId, s);
              });
            } else await this.save(p.userId,s);
            this.multiplayer.send(p, "battleDecision", {
              mochiId: encounter.petId,
              ...answer,
            });
          });
        }
      }
      presentations.push(async () => {
        this.multiplayer.send(p, "adventureState", {
          player: {
            hp: s.hp,
            mp: s.mp,
            petHp: s.petHp,
            stats: s.stats,
            target: s.target,
            levels: Object.fromEntries(
              Object.entries(s.xp).map(([k, v]) => [k, levelFor(v)]),
            ),
            cooldowns: s.cooldowns,
          },
          serverTime: now,
        });
        if (now - (s.savedAt ?? 0) > 10000) {
          s.savedAt = now;
          await this.save(p.userId, s);
        }
      });
    }
    // Submit independent brains together; apply authoritative motors in player order.
    // Enemies remain paused through the batch, as in the previous awaited tick.
    for (const apply of decisions) await apply();
    for (const settle of settlements) await settle();
    for (const present of presentations) await present();
    await this.advanceEnemies(now, dt);
  }
  async advancePoison(p, s, now) {
      if (s.poisonUntil > now && (s.nextPoisonAt ?? 0) <= now) {
        s.hp = clampHealth(s.hp - 2, s.stats.maxHp);
        s.nextPoisonAt = now + 2000;
        s.outcome ??= {};
        s.outcome.ownerDamage = (s.outcome.ownerDamage ?? 0) + 2;
        s.ownerDamage = (s.ownerDamage ?? 0) + 2;
        this.effect(p, "mob-hit", { amount: 2, poison: true });
        if (s.hp <= 0) await this.defeat(p, s);
        await this.save(p.userId, s);
      }
  }
  async ownerAttack(p, s, m, now) {
        const w = WEAPONS[s.equipment.weapon];
        if (
          dist(p, m) <= w.range &&
          validSegment(p.roomId, p, m) &&
          (s.cooldowns.attack ?? 0) <= now
        ) {
          s.cooldowns.attack = now + 1000 / w.attackSpeed;
          await this.hit(
            p,
            s,
            m,
            damage(
              w.attackPower + s.stats.attack + (s.foodUntil > now ? 3 : 0),
              1,
            ),
          );
          this.effect(p, "hit", {
            targetId: m.id,
            weaponType: WEAPONS[s.equipment.weapon]?.type ?? "sword",
          });
        }
  }
  async advanceEnemies(now, dt) {
    for (const [key, room] of this.instances) {
      const players = [
        ...(this.multiplayer.store.rooms.get(key)?.players.values() ?? []),
      ];
      for (const m of room.mobs.values()) {
        if (m.hp <= 0) continue;
        let p = players.find((p) => p.userId === m.target);
        if (!p && m.behavior !== "passive") {
          p = players.find(
            (p) => dist(p, m) < (m.behavior === "aggressive" ? 240 : 135),
          );
          if (p) {
            m.target = p.userId;
            const s = await this.state(p.userId);
            if (!s.target) s.target = m.id;
          }
        }
        if (!p || dist(p, m.home) > 420 || dist(p, m) > 500) {
          m.target = null;
          m.state = dist(m, m.home) > 65 ? "RETURN" : "IDLE";
          if (m.state === "IDLE" && m.speed > 0) {
            const a = now / 5000 + m.home.x / 100,
              q = {
                x: m.home.x + Math.cos(a) * 42,
                y: m.home.y + Math.sin(a) * 30,
              };
            const d = dist(m, q) || 1,
              next = {
                x: m.x + ((q.x - m.x) / d) * Math.min(d, m.speed * dt * 0.3),
                y: m.y + ((q.y - m.y) / d) * Math.min(d, m.speed * dt * 0.3),
              };
            if (
              walkable(room.roomId, next) &&
              validSegment(room.roomId, m, next)
            ) {
              Object.assign(m, next);
              m.state = "WANDER";
            }
          }
          if (m.state === "RETURN") {
            const d = dist(m, m.home),
              q = {
                x: m.x + ((m.home.x - m.x) / d) * Math.min(d, m.speed * dt),
                y: m.y + ((m.home.y - m.y) / d) * Math.min(d, m.speed * dt),
              };
            if (walkable(room.roomId, q)) Object.assign(m, q);
          }
          continue;
        }
        const s = await this.state(p.userId);
        if (s.hp <= 0) continue;
        if (dist(p, m) > m.range) {
          m.state = "CHASE";
          const d = dist(m, p),
            q = {
              x:
                m.x +
                ((p.x - m.x) / d) *
                  Math.min(d, m.speed * dt * (m.slowUntil > now ? 0.5 : 1)),
              y:
                m.y +
                ((p.y - m.y) / d) *
                  Math.min(d, m.speed * dt * (m.slowUntil > now ? 0.5 : 1)),
            };
          if (
            walkable(room.roomId, q) &&
            validSegment(room.roomId, m, q)
          )
            Object.assign(m, q);
        } else if (m.damage > 0 && m.attackAt <= now) {
          m.state = "ATTACK";
          m.attackAt = now + 1600;
          const petTarget =
            p.companion &&
            s.petHp > 0 &&
            dist(m, p.companion) < m.range &&
            this.random() < 0.3;
          const defended = petTarget
            ? s.petGuardUntil > now
            : s.ownerGuardUntil > now;
          const hit = damage(
            m.damage,
            petTarget ? 2 : s.stats.defense + (s.shieldUntil > now ? 8 : 0),
            defended ? 0.4 : 1,
          );
          s.outcome ??= {};
          if (petTarget) {
            s.petHp = clampHealth(s.petHp - hit, 80);
            s.outcome.petDamage = (s.outcome.petDamage ?? 0) + hit;
            s.petDamage = (s.petDamage ?? 0) + hit;
            if (!s.petHp) {
              p.companion.state = "EXHAUSTED";
              s.outcome.petExhausted = true;
            }
          } else {
            s.hp = clampHealth(s.hp - hit, s.stats.maxHp);
            if (m.type === "thornling") {
              s.poisonUntil = now + 6000;
              s.nextPoisonAt = now + 2000;
            }
            s.outcome.ownerDamage = (s.outcome.ownerDamage ?? 0) + hit;
            s.ownerDamage = (s.ownerDamage ?? 0) + hit;
          }
          if (defended)
            s.outcome.protection =
              (s.outcome.protection ?? 0) + Math.max(0, m.damage - hit);
          this.effect(p, "mob-hit", {
            targetId: m.id,
            pet: !!petTarget,
            amount: hit,
            defended,
            defeated: petTarget ? s.petHp <= 0 : s.hp <= 0,
          });
          if (s.hp <= 0) {
            m.target = null;
            await this.defeat(p, s);
          }
          await this.save(p.userId, s);
        }
      }
      if (players[0])
        this.multiplayer.broadcast(
          key,
          "adventureRoom",
          this.publicRoom(players[0]),
        );
    }
  }
  async close() {
    this.stopping = true;
    clearInterval(this.timer);
    for (const e of this.encounters.values()) e.invalid = "shutdown";
    await this.queue;
    const unsettled = [];
    for (const [userId, s] of this.states) {
      if (!await this.closeEncounter(userId, s, "shutdown")) unsettled.push(userId);
      await this.save(userId,s);
    }
    await this.brains.close();
    if (unsettled.length) throw Error("Shutdown retained owed battle feedback for " + unsettled.length + " players");
  }
}
