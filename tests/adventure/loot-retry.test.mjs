import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../server/world/service.mjs';
import { ServerArena, scenario } from '../../sim/server_battle.mjs';

test('a failed lethal loot grant retains its rolled reward when the same spawn is defeated again', async () => {
  const arena = new ServerArena({
    ...scenario(1000, 0), type: 'thornling', geometry: 'open', distance: 40,
  });
  const { game, p, s, m } = arena;
  const grants = [];
  let draws = 0;
  game.random = () => draws++ < 3 ? .1 : .9;
  game.service.inventory = async (_tx, _user, itemId, quantity) => {
    grants.push([itemId, quantity]);
    if (grants.length === 1) throw new GameError('This item stack is full.', 409);
  };
  const hp = m.hp, xp = s.xp.combat;
  await assert.rejects(game.hit(p, s, m, 9999), /stack is full/);
  assert.equal(m.hp, 1);
  assert.equal(m.state, 'CHASE');
  assert.equal(m.respawnAt, 0);
  assert.equal(m.contributors[p.userId], hp, 'damage contribution remains attached to this spawn');
  assert.equal(s.xp.combat, xp, 'failed loot does not grant XP');
  await game.hit(p, s, m, 9999);
  assert.deepEqual(grants[1], grants[0], 'a failed grant cannot reroll the same defeated spawn');
  assert.equal(s.xp.combat, xp + m.xp);
  assert.equal(m.contributors[p.userId], hp + 1);
});

test('an empty drop roll survives a failed state write instead of rolling new loot', async () => {
  const { game, p, s, m } = new ServerArena({
    ...scenario(1000, 0), type: 'thornling', geometry: 'open', distance: 40,
  });
  m.drops = [['thorn-fiber', .5, 1, 3]];
  let draws = 0, failed = false;
  const grants = [];
  game.random = () => draws++ < 2 ? .9 : .1;
  game.service.inventory = async (_tx, _user, ...grant) => grants.push(grant);
  game.service.transaction = async (_users, operation) => operation({query: async sql => {
    if (sql.startsWith('UPDATE player_adventure') && !failed) {
      failed = true;
      throw new Error('state write failed');
    }
    return {rowCount: 1, rows: []};
  }});
  await assert.rejects(game.hit(p, s, m, 9999), /state write failed/);
  await game.hit(p, s, m, 9999);
  assert.deepEqual(grants, []);
  assert.equal(draws, 3, 'only the retry respawn timer draws again');
});

test('the retained roll follows the same spawn when a different owner retries the kill', async () => {
  const { game, p, s, m } = new ServerArena({
    ...scenario(1000, 0), type: 'thornling', geometry: 'open', distance: 40,
  });
  let draws = 0;
  const grants = [];
  game.random = () => draws++ < 3 ? .1 : .9;
  game.service.inventory = async (_tx, user, ...grant) => {
    grants.push({user, grant});
    if (grants.length === 1) throw new GameError('This item stack is full.', 409);
  };
  await assert.rejects(game.hit(p, s, m, 9999), /stack is full/);
  const other = {...p, userId: 'other-owner'}, otherState = structuredClone(s);
  await game.hit(other, otherState, m, 9999);
  assert.equal(grants[1].user, other.userId);
  assert.deepEqual(grants[1].grant, grants[0].grant);
  assert.equal(s.xp.combat, 0);
  assert.equal(otherState.xp.combat, m.xp);
});

test('actual respawn replacement gets a fresh private roll and dead repeats do not grant again', async () => {
  const { AdventureService } = await import('../../server/adventure/service.mjs');
  const arena = new ServerArena({
    ...scenario(1000, 0), type: 'slime', geometry: 'open', distance: 40,
  });
  const { game, p, s } = arena;
  p.roomId = 'forest';
  game.instances.delete(p.room);
  const room = game.instance(p), first = [...room.mobs.values()][0];
  let draws = 0;
  const grants = [];
  game.random = () => draws++ < 3 ? .1 : .9;
  game.service.inventory = async (_tx, _user, ...grant) => grants.push(grant);
  await game.hit(p, s, first, 9999);
  const frame = AdventureService.prototype.publicRoom.call(game, p);
  for (const mob of frame.mobs) {
    assert.equal('loot' in mob, false);
    assert.equal('lootRolls' in mob, false);
  }
  await game.hit(p, s, first, 9999);
  assert.equal(grants.length, 1);
  arena.now = first.respawnAt + 1;
  game.instance(p);
  const replacement = room.mobs.get(first.spawnKey);
  assert.notEqual(replacement, first);
  assert.notEqual(replacement.id, first.id);
  await game.hit(p, s, replacement, 9999);
  assert.deepEqual(grants, [['slime-resin', 1], ['slime-resin', 2]]);
});
