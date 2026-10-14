import { constants, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, readFile, rename, unlink } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { userInfo } from "node:os";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { postgresConnectionEnvironment, verifyBackup } from "./backup.mjs";

const identitySQL = "SELECT current_database() AS database, current_schema() AS schema, inet_server_addr()::text AS server, current_setting('port') AS port";
// public and the built-in plpgsql extension are normal in a newly created DB.
const emptySQL = `SELECT (
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') +
  (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')) +
  (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql') +
  (SELECT count(*) FROM pg_event_trigger) +
  (SELECT count(*) FROM pg_largeobject_metadata) +
  (SELECT count(*) FROM pg_publication) +
  (SELECT count(*) FROM pg_subscription) +
  (SELECT count(*) FROM pg_foreign_server)
) AS objects`;
function databaseName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_ -]{0,62}$/.test(value))
    throw Error("Restore requires a safe plain source and target database name");
  return value;
}
async function readJSON(path, limit = 16 * 1024 * 1024) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw Error("Invalid restore metadata file");
    return JSON.parse(await handle.readFile("utf8"));
  } finally { await handle.close(); }
}
async function fingerprint(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat(), hash = createHash("sha256");
    if (!before.isFile()) throw Error("Checkpoint must be a regular file");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; hash.update(chunk); }
    const after = await handle.stat();
    if (before.size !== bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw Error("Checkpoint changed during validation");
    return { bytes, sha256: hash.digest("hex") };
  } finally { await handle.close(); }
}
async function privateWrite(path, data) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(data) + "\n"); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
async function clientFor(env) {
  // Explicit values prevent node-postgres from inheriting a different PG* route.
  if (env.PGHOSTADDR) throw Error("Restore inspection does not support hostaddr; use an explicit host");
  const mode = env.PGSSLMODE ?? "disable";
  if (!["disable", "require", "verify-ca", "verify-full"].includes(mode)) throw Error("Unsupported restore inspection sslmode");
  const ssl = mode === "disable" ? false : { rejectUnauthorized: mode !== "require" };
  if (ssl) {
    if (env.PGSSLROOTCERT) ssl.ca = await readFile(env.PGSSLROOTCERT, "utf8");
    if (env.PGSSLCERT) ssl.cert = await readFile(env.PGSSLCERT, "utf8");
    if (env.PGSSLKEY) ssl.key = await readFile(env.PGSSLKEY, "utf8");
  }
  return new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE,
    user: env.PGUSER || userInfo().username, password: () => env.PGPASSWORD ?? null,
    options: env.PGOPTIONS || " ", application_name: env.PGAPPNAME || "mochi_restore",
    connectionTimeoutMillis: 1000 * Number(env.PGCONNECT_TIMEOUT || 10), ssl });
}
const runCommand = (file, args, env) => new Promise((done, reject) => {
  const child = spawn(file, args, { env, stdio: ["ignore", "ignore", "ignore"] });
  child.on("error", () => reject(Error("Cannot start pg_restore")));
  child.on("close", code => code === 0 ? done() : reject(Error("pg_restore failed; target retained for inspection")));
});

export async function restoreBackup({ backupDirectory, databaseUrl = process.env.RESTORE_DATABASE_URL,
  checkpointDirectory = process.env.RESTORE_CHECKPOINT_DIRECTORY, quiesced = false, trusted = false,
  pgRestoreCommand = "pg_restore" }, dependencies = {}) {
  if (quiesced !== true || trusted !== true) throw Error("Restore requires explicit quiesced and trusted-local-backup acknowledgements");
  if (!backupDirectory || !databaseUrl || !checkpointDirectory) throw Error("Backup, RESTORE_DATABASE_URL and RESTORE_CHECKPOINT_DIRECTORY are required");
  await verifyBackup(backupDirectory); // Before connecting or modifying a target.
  const backup = await realpath(resolve(backupDirectory)), manifest = await readJSON(join(backup, "manifest.json"));
  const env = postgresConnectionEnvironment(databaseUrl);
  databaseName(env.PGDATABASE);
  const owners = [];
  for (const entry of manifest.checkpointFiles.filter(entry => /^checkpoints\/managed-[a-f0-9-]{36}\/\.owner\.json$/.test(entry.path)))
    owners.push(await readJSON(join(backup, entry.path), 65536));
  const names = new Set(owners.map(owner => databaseName(owner.database)));
  const sourceDatabase = databaseName(manifest.sourceDatabase ?? (names.size === 1 ? [...names][0] : undefined));
  if (env.PGDATABASE === sourceDatabase) throw Error("Restore target database must differ from source database");
  const target = resolve(checkpointDirectory), info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error("Checkpoint target must be a private real directory");
  const canonicalTarget = await realpath(target);
  const overlaps = (a, b) => { const path = relative(a, b); return path === "" || (path !== ".." && !path.startsWith(".." + sep) && !path.startsWith(sep)); };
  if (overlaps(backup, canonicalTarget) || overlaps(canonicalTarget, backup)) throw Error("Checkpoint target must be distinct from backup");
  if ((await readdir(target)).length) throw Error("Checkpoint target must be empty");
  const client = await (dependencies.clientFactory ?? clientFor)(env);
  try {
    await client.connect();
    const identity = (await client.query(identitySQL)).rows[0];
    if (identity.database !== env.PGDATABASE || identity.database === sourceDatabase) throw Error("Connected target database identity differs or matches source");
    if (!(await client.query("SELECT pg_try_advisory_lock(hashtext('mochi-checkpoint-restore')) AS locked")).rows[0]?.locked) throw Error("Another restore owns the target database");
    if (Number((await client.query(emptySQL)).rows[0]?.objects) !== 0) throw Error("Restore target database must be empty");
    await privateWrite(join(target, ".restore-in-progress.json"), { sourceDatabase, targetDatabase: identity.database });
    await syncDirectory(target);
    const directories = new Set((manifest.checkpointDirectories ?? []).map(path => path.slice("checkpoints/".length)));
    for (const entry of manifest.checkpointFiles) {
      const parts = entry.path.slice("checkpoints/".length).split("/");
      for (let n = 1; n < parts.length; n++) directories.add(parts.slice(0, n).join("/"));
    }
    for (const directory of [...directories].sort((a, b) => a.split("/").length - b.split("/").length)) await mkdir(join(target, directory), { mode: 0o700 });
    for (const entry of manifest.checkpointFiles) {
      const source = await open(join(backup, entry.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { await pipeline(source.createReadStream({ autoClose: false }), createWriteStream(join(target, entry.path.slice(12)), { flags: "wx", mode: 0o600 })); }
      finally { await source.close(); }
      const copied = await fingerprint(join(target, entry.path.slice(12)));
      if (copied.bytes !== entry.bytes || copied.sha256 !== entry.sha256) throw Error("Copied checkpoint differs from verified backup");
      const copiedHandle = await open(join(target, entry.path.slice(12)), "r");
      try { await copiedHandle.sync(); } finally { await copiedHandle.close(); }
    }
    // No URI or password in argv; no create, clean, drop, or existing-data overwrite.
    await (dependencies.runCommand ?? runCommand)(pgRestoreCommand, ["--format=custom", "--no-owner", "--no-privileges",
      "--single-transaction", "--exit-on-error", "--dbname", env.PGDATABASE, join(backup, "database.dump")], env);
    const owner = (await client.query(identitySQL)).rows[0];
    const scopes = (await client.query("SELECT id FROM checkpoint_storage_scope WHERE singleton=true")).rows;
    if (scopes.length !== 1 || !/^[a-f0-9-]{36}$/.test(scopes[0].id)) throw Error("Invalid restored storage scope");
    const folder = "managed-" + scopes[0].id, markerEntry = manifest.checkpointFiles.find(entry => entry.path === "checkpoints/" + folder + "/.owner.json");
    const catalog = (await client.query("SELECT key,mochi_id,domain,version,sha256,bytes FROM brain_checkpoints")).rows;
    const brains = (await client.query("SELECT mochi_id,version,checkpoint_key,lease_checkpoint_key FROM mochi_brains")).rows;
    const records = new Map();
    for (const row of catalog) {
      const parts = String(row.key).split("/"), filename = parts.at(-1);
      const match = /^([a-f0-9]{64})-(\d+)-[a-f0-9-]+\.life$/.exec(filename);
      const expectedPrefix = createHash("sha256").update((parts.length === 2 ? "trading:" : "") + row.mochi_id).digest("hex");
      if (row.domain !== "trading" || !match || match[1] !== expectedPrefix || Number(match[2]) !== row.version
        || !Number.isSafeInteger(row.version) || row.version < 0 || (parts.length !== 1 && (parts.length !== 2 || parts[0] !== folder)))
        throw Error("Invalid restored checkpoint catalog ownership");
      const entry = manifest.checkpointFiles.find(entry => entry.path === "checkpoints/" + row.key), bytes = Number(row.bytes);
      if (!entry || !Number.isSafeInteger(bytes) || bytes <= 0 || entry.bytes !== bytes || entry.sha256 !== row.sha256) throw Error("Restored checkpoint catalog differs from backup artifacts");
      const found = await fingerprint(join(target, row.key));
      if (found.bytes !== bytes || found.sha256 !== row.sha256) throw Error("Restored checkpoint artifact checksum mismatch");
      records.set(row.key, row);
    }
    for (const brain of brains) for (const key of [brain.checkpoint_key, brain.lease_checkpoint_key]) {
      if (key == null) continue;
      const record = records.get(key);
      if (!record || record.mochi_id !== brain.mochi_id || !Number.isSafeInteger(brain.version) || record.version > brain.version)
        throw Error("Restored current or lease checkpoint pointer is invalid");
    }
    if (!markerEntry && (catalog.some(row => row.key.startsWith(folder + "/"))
      || manifest.checkpointFiles.some(entry => entry.path.startsWith("checkpoints/" + folder + "/"))))
      throw Error("Restored managed checkpoints lack copied ownership");
    if (markerEntry) {
      const marker = join(target, folder, ".owner.json"), copiedOwner = await readJSON(marker, 65536);
      if (copiedOwner.database !== sourceDatabase || copiedOwner.schema !== owner.schema || owner.database !== identity.database)
        throw Error("Copied checkpoint namespace ownership cannot be safely rebound");
      await privateWrite(marker + ".restore.tmp", owner);
      await rename(marker + ".restore.tmp", marker);
      await syncDirectory(join(target, folder));
    }
    for (const directory of [...directories].sort((a, b) => b.split("/").length - a.split("/").length)) await syncDirectory(join(target, directory));
    const result = { sourceDatabase, targetDatabase: owner.database, scope: scopes[0].id, checkpoints: catalog.length, ownerRebound: !!markerEntry };
    await privateWrite(join(target, ".restore-complete.json"), result);
    await unlink(join(target, ".restore-in-progress.json"));
    await syncDirectory(target);
    return result;
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !args.includes("--quiesced") || !args.includes("--trusted-local-backup")) throw Error("Usage: restore.mjs --quiesced --trusted-local-backup BACKUP_DIRECTORY");
  console.log(JSON.stringify(await restoreBackup({ backupDirectory: args.find(arg => !arg.startsWith("--")), quiesced: true, trusted: true })));
}
