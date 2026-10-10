import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

function privateMode(info, path) {
  if (info.mode & 0o077) throw new Error("Backup entry permissions must be private: " + path);
}
async function inventory(root, { privateEntries = false } = {}, prefix = "") {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Refusing non-directory backup root: " + root);
  if (privateEntries) privateMode(info, prefix || ".");
  const files = [], directories = [];
  for (const name of await readdir(root)) {
    const path = prefix ? prefix + "/" + name : name;
    const absolute = join(root, name), entry = await lstat(absolute);
    if (!entry.isDirectory() && !entry.isFile()) throw new Error("Refusing non-regular backup entry: " + path);
    if (privateEntries) privateMode(entry, path);
    if (entry.isDirectory()) {
      directories.push(path);
      const nested = await inventory(absolute, { privateEntries }, path);
      files.push(...nested.files); directories.push(...nested.directories);
    } else if (entry.isFile()) files.push(path);
    else throw new Error("Refusing non-regular backup entry: " + path);
  }
  return { files: files.sort(), directories: directories.sort() };
}
async function regularFile(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Refusing non-regular backup file: " + path);
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
// Hash artifacts in bounded memory, including large PostgreSQL dumps.
async function fingerprint(path) {
  const handle = await regularFile(path);
  try {
    const before = await handle.stat(), hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length; hash.update(chunk);
    }
    const after = await handle.stat();
    if (before.size !== bytes || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
      throw new Error("Backup file changed while reading: " + path);
    return { bytes, sha256: hash.digest("hex") };
  } finally { await handle.close(); }
}
const command = (file, args, env) => new Promise((resolveCommand, reject) => {
  const child = spawn(file, args, { env, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-8192); });
  child.on("error", reject);
  child.on("close", code => code === 0 ? resolveCommand() : reject(new Error(file + " exited " + code + ": " + stderr.trim())));
});
// PGDATABASE is a database name, not a connection URI. Explicit libpq settings
// keep credentials out of argv and prevent inherited service/host configuration
// from silently routing a backup to another server.
export function postgresConnectionEnvironment(databaseUrl, baseEnv = process.env) {
  const parameters = {
    host: "PGHOST", hostaddr: "PGHOSTADDR", port: "PGPORT", dbname: "PGDATABASE",
    user: "PGUSER", password: "PGPASSWORD", options: "PGOPTIONS",
    application_name: "PGAPPNAME", connect_timeout: "PGCONNECT_TIMEOUT",
    sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY",
  };
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash) throw new Error();
    const env = Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !key.startsWith("PG")));
    env.PGHOST = decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ""));
    env.PGPORT = url.port || "5432";
    env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
    if (url.username) env.PGUSER = decodeURIComponent(url.username);
    if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
    const seen = new Set();
    for (const [key, value] of url.searchParams) {
      if (!Object.hasOwn(parameters, key) || seen.has(key)) throw new Error();
      seen.add(key); env[parameters[key]] = value;
    }
    if (!env.PGHOST || !env.PGDATABASE || !/^\d+$/.test(env.PGPORT)
      || Number(env.PGPORT) < 1 || Number(env.PGPORT) > 65535
      || Object.entries(env).some(([key, value]) => key.startsWith("PG") && String(value).includes("\0"))) throw new Error();
    return env;
  } catch {
    // URL parser errors can contain the original credential-bearing input.
    throw new Error("Invalid PostgreSQL connection URI or unsupported connection parameter");
  }
}
export async function createBackup({ destination, databaseUrl = process.env.DATABASE_URL,
  checkpointDirectory = process.env.CHECKPOINT_DIRECTORY ?? resolve("data/checkpoints"), quiesced = false,
  pgDumpCommand = "pg_dump" }) {
  if (quiesced !== true) throw new Error("Backup requires explicit quiesced acknowledgement; stop application writers and checkpoint GC first");
  if (!destination || !databaseUrl) throw new Error("destination and DATABASE_URL are required");
  const connectionEnv = postgresConnectionEnvironment(databaseUrl);
  const configuredSource = resolve(checkpointDirectory);
  // Reject every non-regular source entry before copying any data.
  const sourceInventory = await inventory(configuredSource);
  for (const path of [...sourceInventory.files, ...sourceInventory.directories])
    validEntry({ path: "checkpoints/" + path, bytes: 0, sha256: "0".repeat(64) });
  const source = await realpath(configuredSource), target = resolve(destination);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const targetInfo = await lstat(target);
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) throw new Error("Backup destination must be a real directory");
  if ((await readdir(target)).length) throw new Error("Backup destination must be empty");
  const canonicalTarget = await realpath(target), fromSource = relative(source, canonicalTarget);
  if (fromSource === "" || (!isAbsolute(fromSource) && fromSource !== ".." && !fromSource.startsWith(".." + sep)))
    throw new Error("Backup destination cannot be inside the checkpoint directory");
  await chmod(target, 0o700);
  const checkpointTarget = join(target, "checkpoints");
  await mkdir(checkpointTarget, { mode: 0o700 });
  for (const directory of sourceInventory.directories) await mkdir(join(checkpointTarget, directory), { mode: 0o700 });
  for (const path of sourceInventory.files) {
    const handle = await regularFile(join(source, path));
    try {
      await pipeline(handle.createReadStream({ autoClose: false }), createWriteStream(join(checkpointTarget, path), { flags: "wx", mode: 0o600 }));
    } finally { await handle.close(); }
  }
  const dump = join(target, "database.dump");
  // Private from its first byte; pg_dump truncates this existing private file.
  await (await open(dump, "wx", 0o600)).close();
  await command(pgDumpCommand, ["--format=custom", "--no-owner", "--file", dump], connectionEnv);
  const checkpointFiles = [];
  for (const path of sourceInventory.files) checkpointFiles.push({ path: "checkpoints/" + path, ...await fingerprint(join(checkpointTarget, path)) });
  const manifest = { format: 1, createdAt: new Date().toISOString(), consistency: "operator-confirmed-quiescent",
    sourceDatabase: connectionEnv.PGDATABASE,
    databaseDump: { path: "database.dump", ...await fingerprint(dump) }, checkpointFiles,
    checkpointDirectories: sourceInventory.directories.map(path => "checkpoints/" + path) };
  await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return manifest;
}
function validEntry(entry, dump = false) {
  if (!entry || typeof entry.path !== "string" || entry.path.includes("\\") || entry.path.includes(":") || entry.path.includes("\0")
    || isAbsolute(entry.path) || entry.path.split("/").some(part => !part || part === "." || part === "..")
    || (dump ? entry.path !== "database.dump" : !entry.path.startsWith("checkpoints/"))
    || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256))
    throw new Error("Invalid backup manifest entry");
}
export async function verifyBackup(directory) {
  const root = resolve(directory);
  const actual = await inventory(root, { privateEntries: true });
  const handle = await regularFile(join(root, "manifest.json"));
  let manifest;
  try {
    if ((await handle.stat()).size > 16 * 1024 * 1024) throw new Error("Backup manifest is too large");
    manifest = JSON.parse(await handle.readFile("utf8"));
  } finally { await handle.close(); }
  if (!manifest || typeof manifest !== "object" || manifest.format !== 1 || !manifest.databaseDump || !Array.isArray(manifest.checkpointFiles)) throw new Error("Unsupported backup manifest");
  validEntry(manifest.databaseDump, true);
  const expected = new Set(["manifest.json", "database.dump"]), expectedDirectories = new Set(["checkpoints"]);
  for (const entry of manifest.checkpointFiles) {
    validEntry(entry);
    if (expected.has(entry.path)) throw new Error("Duplicate backup manifest entry");
    expected.add(entry.path);
    const parts = entry.path.split("/");
    for (let n = 1; n < parts.length; n++) expectedDirectories.add(parts.slice(0, n).join("/"));
  }
  if (manifest.checkpointDirectories !== undefined && !Array.isArray(manifest.checkpointDirectories))
    throw new Error("Invalid backup directory inventory");
  const listedDirectories = new Set();
  for (const path of manifest.checkpointDirectories ?? []) {
    validEntry({ path, bytes: 0, sha256: "0".repeat(64) });
    if (listedDirectories.has(path)) throw new Error("Duplicate backup directory entry");
    listedDirectories.add(path);
    const parts = path.split("/");
    for (let n = 1; n <= parts.length; n++) expectedDirectories.add(parts.slice(0, n).join("/"));
  }
  if (actual.files.length !== expected.size || actual.files.some(path => !expected.has(path))
    || actual.directories.length !== expectedDirectories.size || actual.directories.some(path => !expectedDirectories.has(path)))
    throw new Error("Backup inventory does not match manifest");
  const dump = await fingerprint(join(root, "database.dump"));
  if (dump.bytes !== manifest.databaseDump.bytes || dump.sha256 !== manifest.databaseDump.sha256) throw new Error("Database dump checksum mismatch");
  for (const entry of manifest.checkpointFiles) {
    const found = await fingerprint(join(root, entry.path));
    if (found.bytes !== entry.bytes || found.sha256 !== entry.sha256) throw new Error("Checkpoint checksum mismatch: " + entry.path);
  }
  return { format: manifest.format, checkpoints: manifest.checkpointFiles.length, databaseBytes: dump.bytes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "--verify" && process.argv[3]) console.log(JSON.stringify(await verifyBackup(process.argv[3])));
  else console.log(JSON.stringify(await createBackup({ destination: process.argv[2] === "--quiesced" ? process.argv[3] : process.argv[2], quiesced: process.argv[2] === "--quiesced" }), null, 2));
}
