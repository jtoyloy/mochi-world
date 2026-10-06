// Real PostgreSQL transactions and fsynced files; only collector age is accelerated.
// Own isolated schema/directory; never reads or deletes another run's storage.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { WorldService } from '../../server/world/service.mjs';
import { BrainRepository, FileCheckpointStorage } from '../../server/world/checkpoints.mjs';
import { CheckpointCollector, retentionPolicy } from '../../server/world/checkpoint-retention.mjs';
import { ITEMS } from '../../web/js/world/catalog.js';
if (!process.env.TEST_DATABASE_URL) throw Error('TEST_DATABASE_URL required; no skip');
const sample = process.env.CHECKPOINT_SAMPLE ?? 'web/brains/traders-0.74.0-v1/basic.life';
const life = await readFile(sample);
const disk = await statfs(tmpdir());
const floor = 3 * 1024 ** 3;
if (disk.bavail * disk.bsize - 6 * life.length < floor) throw Error('3 GiB safety floor would be breached');
const policy = retentionPolicy({ DEV_MODE: 'true' }); // Preserve 3 versions, 10m grace, 60s GC.
const schema = 'storage_cycles_' + Math.random().toString(36).slice(2, 12);
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let pool, dir;
const cycles = [];
try {
  await admin.query('CREATE SCHEMA ' + schema);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: '-c search_path=' + schema });
  for (const path of ['server/schema.sql', 'server/world/schema.sql', 'server/adventure/schema.sql'])
    await pool.query(await readFile(path, 'utf8'));
  for (const item of ITEMS) await pool.query('INSERT INTO items VALUES($1,$2)', [item.id, item]);
  const service = new WorldService(pool);
  dir = await mkdtemp(join(tmpdir(), 'mochi-storage-cycles-'));
  const storage = new FileCheckpointStorage(dir);
  const repo = new BrainRepository(service, storage);
  const collector = new CheckpointCollector(repo, policy);
  const user = await service.ensureUser('storage_cycles');
  const id = 'storage_cycles_pet';
  await service.adopt(user.id, id, 'Storage cycles');
  let scope;
  for (let version = 1; version <= 9; version++) {
    const currentDisk = await statfs(dir);
    if (currentDisk.bavail * currentDisk.bsize - life.length < floor)
      throw Error("3 GiB safety floor would be breached before next write");
    // ZIP comment differs; every brain, trace, RNG and owed outcome payload remains exact.
    const end = Buffer.from(life.subarray(-22));
    assert.equal(end.readUInt32LE(0), 0x06054b50);
    const comment = Buffer.from('storage version ' + version);
    end.writeUInt16LE(comment.length, 20);
    const bytes = Buffer.concat([life.subarray(0, -22), end, comment]);
    let key;
    await service.transaction([user.id], async tx => {
      await repo.lock(tx, id);
      const brain = await repo.ensure(tx, id);
      key = await repo.writeCheckpoint(tx, id, brain.version + 1, bytes, brain.checkpoint_key);
      await tx.query('UPDATE mochi_brains SET checkpoint_key=$2,version=version+1 WHERE mochi_id=$1', [id, key]);
      scope = await repo.bindStorage(tx);
    });
    const before = await storage.list(scope);
    const first = await collector.run({ now: Date.now() + policy.graceMs + policy.intervalMs });
    const after = await storage.list(scope);
    const second = await collector.run({ now: Date.now() + policy.graceMs + policy.intervalMs });
    assert.equal(first.blockedBrains, 0);
    assert.equal(after.length, Math.min(version, policy.keepRecent));
    assert.equal(first.deleted, version > policy.keepRecent ? 1 : 0);
    assert.equal(second.deleted, 0);
    assert.ok(after.some(x => x.key === key));
    assert.equal((await repo.load(id, user.id)).life.brain, bytes.toString('base64'));
    cycles.push({ version, beforeCount: before.length, beforeBytes: before.reduce((n,x)=>n+x.bytes,0),
      deleted: first.deleted, afterCount: after.length, afterBytes: after.reduce((n,x)=>n+x.bytes,0),
      catalogCount: Number((await pool.query('SELECT count(*) FROM brain_checkpoints')).rows[0].count),
      idempotentDeleted: second.deleted });
  }
  const result = { kind: 'real PostgreSQL/fsync/native-load/physical deletion cycles; collector age accelerated, not a CCU soak',
    sampleBytes: life.length, policy, cycles, deletedFiles: cycles.reduce((n,x)=>n+x.deleted,0),
    peakBytes: Math.max(...cycles.map(x=>x.beforeBytes)), plateauBytes: cycles.at(-1).afterBytes,
    safetyFloorBytes: floor, freeDiskBeforeBytes: disk.bavail * disk.bsize };
  const output = process.env.STORAGE_CYCLES_OUTPUT ?? 'assays/wave4-storage-cycles.json';
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool?.end();
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await admin.end();
  if (dir) await rm(dir, { recursive: true, force: true });
}
