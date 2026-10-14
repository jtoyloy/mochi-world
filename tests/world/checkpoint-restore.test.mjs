import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { restoreBackup } from "../../tools/checkpoints/restore.mjs";

const scope = "11111111-1111-1111-1111-111111111111", folder = "managed-" + scope;
const owner = { database: "source_game", schema: "public", server: "127.0.0.1", port: "55439" };
const targetOwner = { ...owner, database: "restored_game" };
const hash = value => createHash("sha256").update(value).digest("hex");
async function fixture(t, { fresh = false, legacy = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "mochi-restore-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backup = join(root, "backup"), target = join(root, "target");
  for (const path of [backup, target, join(backup, "checkpoints")]) await mkdir(path, { mode: 0o700 });
  const files = [], dirs = [], key = folder + "/" + hash("trading:pet-1") + "-2-22222222-2222-2222-2222-222222222222.life";
  const add = async (path, value) => { await writeFile(join(backup, path), value, { mode: 0o600 }); files.push({ path, bytes: Buffer.byteLength(value), sha256: hash(value) }); };
  await writeFile(join(backup, "database.dump"), "dump", { mode: 0o600 });
  if (!fresh) {
    await mkdir(join(backup, "checkpoints", folder), { mode: 0o700 }); dirs.push("checkpoints/" + folder);
    await add("checkpoints/" + folder + "/.owner.json", JSON.stringify(owner));
    await add("checkpoints/" + key, "checkpoint bytes");
  }
  const manifest = { format: 1, ...(legacy ? {} : { sourceDatabase: "source_game" }), databaseDump: { path: "database.dump", bytes: 4, sha256: hash("dump") }, checkpointFiles: files, checkpointDirectories: dirs };
  await writeFile(join(backup, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
  const catalog = fresh ? [] : [{ key, mochi_id: "pet-1", domain: "trading", version: 2, bytes: 16, sha256: hash("checkpoint bytes") }];
  const brains = fresh ? [] : [{ mochi_id: "pet-1", version: 3, checkpoint_key: key, lease_checkpoint_key: key }];
  const state = { connects: 0, commands: [], objects: 0, locked: true, catalog, brains, scope, identity: targetOwner };
  const client = { async connect() { state.connects++; }, async end() { state.ended = true; }, async query(sql) {
    if (sql.includes("current_database()")) return { rows: [state.identity] };
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: state.locked }] };
    if (sql.includes("AS objects")) return { rows: [{ objects: state.objects }] };
    if (sql.includes("checkpoint_storage_scope")) return { rows: [{ id: state.scope }] };
    if (sql.includes("FROM brain_checkpoints")) return { rows: state.catalog };
    if (sql.includes("FROM mochi_brains")) return { rows: state.brains };
    throw Error("Unexpected query: " + sql);
  } };
  const options = { backupDirectory: backup, databaseUrl: "postgresql://test:secret@127.0.0.1:55439/restored_game", checkpointDirectory: target, trusted: true, quiesced: true };
  const dependencies = { clientFactory: async () => client, runCommand: async (command, args, env) => { state.commands.push({ command, args, env }); } };
  return { root, backup, target, manifest, key, state, options, dependencies };
}

test("restore copies private artifacts, validates current and lease pointers, and rebinds only the target namespace", async t => {
  const f = await fixture(t, { legacy: true });
  const result = await restoreBackup(f.options, f.dependencies);
  assert.deepEqual(result, { sourceDatabase: "source_game", targetDatabase: "restored_game", scope, checkpoints: 1, ownerRebound: true });
  assert.deepEqual(JSON.parse(await readFile(join(f.target, folder, ".owner.json"))), targetOwner);
  assert.deepEqual(JSON.parse(await readFile(join(f.backup, "checkpoints", folder, ".owner.json"))), owner);
  assert.equal(await readFile(join(f.target, f.key), "utf8"), "checkpoint bytes");
  assert.equal((await stat(join(f.target, f.key))).mode & 0o777, 0o600);
  assert.equal((await stat(join(f.target, folder))).mode & 0o777, 0o700);
  assert.ok((await readdir(f.target)).includes(".restore-complete.json"));
  assert.ok(!(await readdir(f.target)).includes(".restore-in-progress.json"));
  const command = f.state.commands[0];
  assert.deepEqual(command.args, ["--format=custom", "--no-owner", "--no-privileges", "--single-transaction", "--exit-on-error", "--dbname", "restored_game", join(await realpath(f.backup), "database.dump")]);
  assert.equal(command.env.PGPASSWORD, "secret");
  assert.ok(!command.args.join(" ").includes("secret"));
  assert.equal(f.state.ended, true);
});
test("fresh backup with sourceDatabase restores without checkpoints or an ownership marker", async t => {
  const f = await fixture(t, { fresh: true });
  const result = await restoreBackup(f.options, f.dependencies);
  assert.equal(result.checkpoints, 0); assert.equal(result.ownerRebound, false);
  assert.deepEqual(await readdir(f.target), [".restore-complete.json"]);
});
test("an unrelated copied namespace retains its original database owner", async t => {
  const f = await fixture(t), other = "managed-33333333-3333-3333-3333-333333333333";
  const value = JSON.stringify({ ...owner, database: "unrelated_game" }), path = "checkpoints/" + other + "/.owner.json";
  await mkdir(join(f.backup, "checkpoints", other), { mode: 0o700 });
  await writeFile(join(f.backup, path), value, { mode: 0o600 });
  f.manifest.checkpointFiles.push({ path, bytes: Buffer.byteLength(value), sha256: hash(value) });
  f.manifest.checkpointDirectories.push("checkpoints/" + other);
  await writeFile(join(f.backup, "manifest.json"), JSON.stringify(f.manifest));
  await restoreBackup(f.options, f.dependencies);
  assert.equal(await readFile(join(f.target, other, ".owner.json"), "utf8"), value);
  assert.equal(JSON.parse(await readFile(join(f.target, folder, ".owner.json"))).database, "restored_game");
});
test("legacy fresh backup without source identity fails closed", async t => {
  const f = await fixture(t, { fresh: true, legacy: true });
  await assert.rejects(restoreBackup(f.options, f.dependencies), /safe plain source/);
  assert.equal(f.state.connects, 0); assert.deepEqual(await readdir(f.target), []);
});
test("acknowledgements and integrity checks run before target connection or writes", async t => {
  const f = await fixture(t);
  for (const flag of ["trusted", "quiesced"]) await assert.rejects(restoreBackup({ ...f.options, [flag]: false }, f.dependencies), /acknowledgements/);
  await writeFile(join(f.backup, "database.dump"), "tamper");
  await assert.rejects(restoreBackup(f.options, f.dependencies), /checksum/);
  assert.equal(f.state.connects, 0); assert.deepEqual(await readdir(f.target), []);
});
test("existing database objects and concurrent restore lock refuse mutation", async t => {
  for (const field of ["objects", "locked"]) {
    const f = await fixture(t); f.state[field] = field === "objects" ? 1 : false;
    await assert.rejects(restoreBackup(f.options, f.dependencies), field === "objects" ? /database must be empty/ : /Another restore/);
    assert.equal(f.state.commands.length, 0); assert.deepEqual(await readdir(f.target), []);
  }
});
test("source database, unexpected connected identity, and unsafe name cannot restore", async t => {
  for (const mode of ["same", "connected", "unsafe"]) {
    const f = await fixture(t);
    if (mode === "same") f.options.databaseUrl = "postgresql://localhost/source_game";
    if (mode === "connected") f.state.identity = owner;
    if (mode === "unsafe") f.options.databaseUrl = "postgresql://localhost/db%3Dother";
    await assert.rejects(restoreBackup(f.options, f.dependencies), /database|identity/);
    assert.equal(f.state.commands.length, 0); assert.deepEqual(await readdir(f.target), []);
  }
});
test("existing and symlink checkpoint destinations are preserved", async t => {
  const f = await fixture(t);
  await writeFile(join(f.target, "existing"), "retained");
  await assert.rejects(restoreBackup(f.options, f.dependencies), /must be empty/);
  const link = join(f.root, "link"); await symlink(f.target, link);
  await assert.rejects(restoreBackup({ ...f.options, checkpointDirectory: link }, f.dependencies), /private real directory/);
  assert.equal(await readFile(join(f.target, "existing"), "utf8"), "retained"); assert.equal(f.state.connects, 0);
});
test("catalog bytes/hash, foreign namespace and current or lease ownership mismatches retain failure evidence", async t => {
  for (const mode of ["bytes", "hash", "scope", "current", "lease"]) {
    const f = await fixture(t);
    if (mode === "bytes") f.state.catalog[0].bytes++;
    if (mode === "hash") f.state.catalog[0].sha256 = "a".repeat(64);
    if (mode === "scope") f.state.scope = "33333333-3333-3333-3333-333333333333";
    if (mode === "current") f.state.brains[0].mochi_id = "other-pet";
    if (mode === "lease") f.state.brains[0].lease_checkpoint_key = "missing";
    await assert.rejects(restoreBackup(f.options, f.dependencies), /catalog|pointer/);
    assert.deepEqual(JSON.parse(await readFile(join(f.target, folder, ".owner.json"))), owner);
    assert.ok((await readdir(f.target)).includes(".restore-in-progress.json"));
    assert.ok(!(await readdir(f.target)).includes(".restore-complete.json"));
  }
});
test("pg_restore failure preserves source and copied target ownership without claiming success", async t => {
  const f = await fixture(t);
  f.dependencies.runCommand = async () => { throw Error("simulated restore failure"); };
  await assert.rejects(restoreBackup(f.options, f.dependencies), /simulated/);
  assert.deepEqual(JSON.parse(await readFile(join(f.target, folder, ".owner.json"))), owner);
  assert.deepEqual(JSON.parse(await readFile(join(f.backup, "checkpoints", folder, ".owner.json"))), owner);
  assert.ok(!(await readdir(f.target)).includes(".restore-complete.json"));
  await assert.rejects(restoreBackup(f.options, f.dependencies), /must be empty/);
});
test("a restored scope with unbound orphan files cannot claim completion", async t => {
  const f = await fixture(t);
  await rm(join(f.backup, "checkpoints", folder, ".owner.json"));
  f.manifest.checkpointFiles = f.manifest.checkpointFiles.filter(entry => !entry.path.endsWith("/.owner.json"));
  await writeFile(join(f.backup, "manifest.json"), JSON.stringify(f.manifest));
  f.state.catalog = []; f.state.brains = [];
  await assert.rejects(restoreBackup(f.options, f.dependencies), /lack copied ownership/);
  assert.ok(!(await readdir(f.target)).includes(".restore-complete.json"));
});
