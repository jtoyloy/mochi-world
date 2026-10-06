import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Multiplayer,
  MemoryRoomStore,
} from "../../server/social/multiplayer.mjs";
function fixture() {
  let now = 10000;
  const messages = [],
    store = new MemoryRoomStore();
  const m = new Multiplayer({
    store,
    world: { pool: { query: async () => ({}) } },
    now: () => now,
  });
  const p = {
    userId: "a",
    username: "a",
    room: "town-1",
    roomId: "town",
    x: 550,
    y: 840,
    speed: 180,
    lastSeen: now,
    lastMove: 0,
    windowAt: 0,
    eventCount: 0,
    path: [],
    ws: {
      readyState: 1,
      bufferedAmount: 0,
      send: (s) => messages.push(JSON.parse(s)),
      close() {},
    },
  };
  store.players.set("a", p);
  store.rooms.set(p.room, { id: p.room, players: new Map([["a", p]]) });
  return {
    m,
    p,
    messages,
    step(ms) {
      now += ms;
      m.tick();
    },
    time(ms) {
      now += ms;
    },
  };
}
test("authoritative tick carries distance past a path corner and exposes timestamp/sequence", () => {
  const f = fixture();
  try {
    f.p.target = { x: 555, y: 840 };
    f.p.path = [{ x: 555, y: 860 }];
    f.step(100);
    assert.equal(f.p.x, 555);
    assert.equal(f.p.y, 853);
    const packet = f.messages.at(-1).data;
    const s = { ...packet.players.find(p=>p.userId===f.p.userId), serverTime: packet.serverTime };
    assert.equal(s.serverTime, 10100);
    assert.equal(s.path.length, 1);
    assert.equal(s.speed, 180);
  } finally {
    f.m.close();
  }
});
test("movement intent ignores client position/speed and rejects reused sequences and blocked goals", async () => {
  const f = fixture();
  try {
    await f.m.handle(f.p, {
      type: "move",
      data: {
        x: 600,
        y: 840,
        seq: 1,
        position: { x: 999, y: 999 },
        speed: 99999,
        clientTime: 0,
      },
    });
    assert.equal(f.p.x, 550);
    assert.equal(f.p.speed, 180);
    assert.equal(f.messages.at(-1).type, "moveAccepted");
    f.time(200);
    await assert.rejects(
      f.m.handle(f.p, { type: "move", data: { x: 620, y: 840, seq: 1 } }),
      /sequence/,
    );
    assert.equal(f.messages.at(-1).type, "moveRejected");
    f.time(200);
    await assert.rejects(
      f.m.handle(f.p, { type: "move", data: { x: NaN, y: 840, seq: 2 } }),
      /blocked/,
    );
  } finally {
    f.m.close();
  }
});
test("combat motor executes a brain-requested step continuously and clears it when combat ends", () => {
  const f = fixture();
  try {
    f.p.companion = {
      id: "pet",
      x: 500,
      y: 850,
      motorPath: [{ x: 565, y: 850 }],
    };
    f.m.adventure = { states: new Map([["a", { target: "mob", petHp: 80 }]]) };
    f.step(100);
    assert.ok(Math.abs(f.p.companion.x - 516.5) < 1e-9);
    f.m.adventure.states.get("a").target = null;
    f.step(100);
    assert.equal(f.p.companion.motorPath.length, 0);
  } finally {
    f.m.close();
  }
});

test("authoritative tick retains ordinary timer jitter while bounding suspension gaps", () => {
  const f = fixture();
  try {
    f.p.target = { x: 650, y: 840 };
    f.step(120);
    assert.ok(Math.abs(f.p.x - 571.6) < 1e-9);
    f.step(1000);
    assert.ok(Math.abs(f.p.x - 616.6) < 1e-9);
  } finally {
    f.m.close();
  }
});
