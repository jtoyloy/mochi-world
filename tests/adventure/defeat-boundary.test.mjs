import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerArena, scenario } from '../../sim/server_battle.mjs';

function fixture() {
  const arena = new ServerArena({
    ...scenario(1000, 0), type: 'boar', geometry: 'open', distance: 40,
    pressure: 'owner', cooldown: 0,
  });
  const { game, p, s, m } = arena;
  game.random = () => .9;
  m.x = p.x + 1;
  const room = game.instances.get(p.room);
  const oldRoom = p.room;
  const second = structuredClone(m);
  Object.assign(second, {
    id: 'second-enemy', x: 550, y: 840, home: { x: 550, y: 840 },
    target: p.userId,
  });
  room.mobs.set(second.id, second);
  const frames = [], notices = [];
  game.multiplayer.broadcast = (key, type, data) => frames.push({ key, type, data });
  game.multiplayer.send = (_p, type, data) => notices.push({ type, data });
  game.multiplayer.join = async (player, roomId) => {
    game.multiplayer.store.rooms.get(oldRoom).players.delete(player.userId);
    player.room = 'town-instance';
    player.roomId = roomId;
    player.x = 550;
    player.y = 840;
    game.multiplayer.store.rooms.set(player.room, { players: new Map([[player.userId, player]]) });
  };
  s.hp = 1;
  return { arena, game, p, s, m, second, frames, notices };
}

test('defeat removes the restored body from later enemy attacks in the old room', async () => {
  const { arena, game, p, s, second, notices } = fixture();
  await game.advanceEnemies(arena.now, .4);
  assert.equal(p.roomId, 'town');
  assert.equal(s.hp, s.stats.maxHp, 'old-room mobs cannot damage the restored Town body');
  assert.equal(s.target, null, 'old-room mobs cannot reacquire the restored body');
  assert.equal(second.target, null);
  assert.equal(notices.filter(n => n.type === 'adventureNotice').length, 1);
});

test('an emptied old room does not broadcast a frame built from the recovered player', async () => {
  const { arena, game, frames } = fixture();
  await game.advanceEnemies(arena.now, .4);
  assert.deepEqual(frames, []);
});

test('remaining old-room players still receive their own room frame after another player recovers', async () => {
  const { arena, game, p, frames } = fixture();
  const bystander = { userId: 'bystander', room: p.room, roomId: p.roomId, x: 100, y: 100 };
  game.multiplayer.store.players.set(bystander.userId, bystander);
  game.multiplayer.store.rooms.get(p.room).players.set(bystander.userId, bystander);
  game.publicRoom = viewer => ({ room: viewer.room, roomId: viewer.roomId });
  await game.advanceEnemies(arena.now, .4);
  assert.deepEqual(frames, [{
    key: 'arena', type: 'adventureRoom', data: { room: 'arena', roomId: 'yard' },
  }]);
});

test('another live player can still be attacked after the first player recovers', async () => {
  const { arena, game, p, s, second } = fixture();
  const bystander = { userId: 'bystander', room: p.room, roomId: p.roomId, x: 550, y: 839 };
  const state = structuredClone(s);
  state.hp = state.stats.maxHp;
  state.target = null;
  game.states.set(bystander.userId, state);
  game.multiplayer.store.players.set(bystander.userId, bystander);
  game.multiplayer.store.rooms.get(p.room).players.set(bystander.userId, bystander);
  await game.advanceEnemies(arena.now, .4);
  assert.equal(p.roomId, 'town');
  assert.equal(s.hp, s.stats.maxHp);
  assert.ok(state.hp < state.stats.maxHp, 'the remaining live body receives normal enemy damage');
  assert.equal(second.target, bystander.userId);
  assert.equal(state.target, second.id);
});

for (const aggro of [false, true]) {
  test(`a body replaced during ${aggro ? 'aggro' : 'selected-target'} state lookup cannot receive an old-room attack`, async () => {
    const { arena, game, p, s, m } = fixture();
    if (aggro) {
      m.target = null;
      s.target = null;
    }
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    game.state = async () => pending;
    const advancing = game.advanceEnemies(arena.now, .4);
    // The enemy has reached its awaited state read; a reconnect replaces the body.
    const replacement = { ...p };
    game.multiplayer.store.players.set(p.userId, replacement);
    game.multiplayer.store.rooms.get(p.room).players.set(p.userId, replacement);
    release(s);
    await advancing;
    assert.equal(s.hp, 1);
    assert.equal(s.outcome.ownerDefeated, undefined);
    if (aggro) assert.equal(s.target, null);
  });
}
