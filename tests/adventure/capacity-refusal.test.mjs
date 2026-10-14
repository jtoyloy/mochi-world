import test from 'node:test';
import assert from 'node:assert/strict';
import * as errors from '../../server/world/service.mjs';
import { ServerArena, scenario } from '../../sim/server_battle.mjs';

function fixture({pet = false} = {}) {
  const arena = new ServerArena({
    ...scenario(1000, 0), type: 'thornling', geometry: 'open', distance: 40,
  });
  const {game, p, s, m} = arena;
  p.x = m.x - 1;
  m.hp = 1;
  m.attackAt = Infinity;
  s.target = m.id;
  s.savedAt = arena.now;
  s.inBattle = false;
  if (!pet) {
    p.companion = null;
    s.activePet = null;
  }
  game.tickAt = arena.now - 100;
  const messages = [], events = [];
  game.multiplayer.send = (_p, type, data) => messages.push({type, data});
  game.advanceEnemies = async () => events.push('enemies');
  return {arena, game, p, s, m, messages, events};
}
const capacityError = () => new errors.InventoryCapacityError('This item stack is full.');

test('automatic capacity refusal stops that target, informs its owner and keeps other-room combat and enemy stage running', async () => {
  const {game, p, s, m, messages, events} = fixture({pet: true});
  let decisions = 0;
  game.brains.decide = async () => { decisions++; return {action: 'ATTACK', version: 1}; };
  const other = {...p, userId: 'other-owner', room: 'other-room', companion: null};
  const otherState = structuredClone(s);
  otherState.activePet = null;
  const enemy = structuredClone(m);
  enemy.id = 'other-enemy';
  enemy.hp = enemy.maxHp = 1000;
  enemy.target = other.userId;
  otherState.target = enemy.id;
  game.states.set(other.userId, otherState);
  game.multiplayer.store.players.set(other.userId, other);
  game.multiplayer.store.rooms.set(other.room, {players: new Map([[other.userId, other]])});
  game.instances.set(other.room, {roomId: other.roomId, mobs: new Map([[enemy.id, enemy]])});
  game.service.inventory = async () => { throw capacityError(); };
  await game.tick();
  assert.equal(s.target, null);
  assert.equal(m.hp, 1);
  assert.equal(decisions, 0, 'owner refusal cannot start a fresh pet decision for the cleared target');
  assert.ok(enemy.hp < 1000, 'the other room still executes its valid attack');
  assert.deepEqual(events, ['enemies']);
  assert.deepEqual(messages.filter(m => m.type === 'adventureNotice').map(m => m.data.message), ['This item stack is full.']);
});

test('a pet capacity refusal acknowledges and settles its executed action once before enemies advance', async () => {
  const {game, s, messages, events} = fixture({pet: true});
  s.cooldowns.attack = Infinity;
  game.brains.decide = async (_id, _user, _obs, _reward, options) => {
    if (options.execution) { events.push(options.execution); return {}; }
    if (options.finish) { events.push('finish'); return {}; }
    events.push('decision');
    return {action: 'ATTACK', version: 1};
  };
  game.service.inventory = async () => { throw capacityError(); };
  await game.tick();
  assert.deepEqual(events, ['decision', 'ack', 'finish', 'enemies']);
  assert.equal(s.target, null);
  assert.equal(s.battleExecution, null);
  assert.equal(s.pendingBattleRequest, null);
  assert.equal(s.inBattle, false);
  assert.equal(messages.filter(m => m.type === 'adventureNotice').length, 1);
});

for (const error of [new Error('database unavailable'), new errors.GameError('different refusal', 409)]) {
  test(`unexpected ${error.message} still rejects the tick and holds the enemy barrier`, async () => {
    const {game, s, m, events, messages} = fixture();
    game.service.inventory = async () => { throw error; };
    await assert.rejects(game.tick(), e => e === error);
    assert.deepEqual(events, []);
    assert.equal(s.target, m.id);
    assert.equal(messages.some(m => m.type === 'adventureNotice'), false);
  });
}
