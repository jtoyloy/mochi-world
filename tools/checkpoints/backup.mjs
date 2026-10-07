import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function filesUnder(root, prefix = "") {
  const out = [];
  for (const name of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${name.name}` : name.name;
    const path = join(root, name.name);
    if (name.isDirectory()) out.push(...await filesUnder(path, relative));
    else if (name.isFile()) {
      const bytes = await readFile(path);
      out.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`Refusing non-regular backup entry: ${relative}`);
  }
  return out;
}

const command = (file, args) => new Promise((resolveCommand, reject) => {
  const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolveCommand() : reject(new Error(`${file} exited ${code}: ${stderr.trim()}`)));
});

export async function createBackup({ destination, databaseUrl = process.env.DATABASE_URL, checkpointDirectory = process.env.CHECKPOINT_DIRECTORY ?? resolve("data/checkpoints") }) {
  if (!destination || !databaseUrl) throw new Error("destination and DATABASE_URL are required");
  const target = resolve(destination);
  await mkdir(target, { recursive: true });
  if ((await readdir(target)).length) throw new Error("Backup destination must be empty");
  const source = await realpath(resolve(checkpointDirectory));
  const targetFromSource = relative(source, target);
  if (!isAbsolute(targetFromSource) && !targetFromSource.startsWith(".."))
    throw new Error("Backup destination cannot be inside the checkpoint directory");
  const checkpointTarget = join(target, "checkpoints");
  await cp(source, checkpointTarget, { recursive: true, errorOnExist: true, force: false });
  const dump = join(target, "database.dump");
  await command("pg_dump", ["--format=custom", "--no-owner", "--file", dump, databaseUrl]);
  const checkpointFiles = await filesUnder(checkpointTarget, "checkpoints");
  const dumpBytes = await readFile(dump);
  const manifest = {
    format: 1,
    createdAt: new Date().toISOString(),
    databaseDump: { path: "database.dump", bytes: dumpBytes.length, sha256: sha256(dumpBytes) },
    checkpointFiles,
  };
  await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return manifest;
}

export async function verifyBackup(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.format !== 1 || !manifest.databaseDump || !Array.isArray(manifest.checkpointFiles)) throw new Error("Unsupported backup manifest");
  const dump = await readFile(join(root, manifest.databaseDump.path));
  if (dump.length !== manifest.databaseDump.bytes || sha256(dump) !== manifest.databaseDump.sha256) throw new Error("Database dump checksum mismatch");
  for (const entry of manifest.checkpointFiles) {
    const bytes = await readFile(join(root, entry.path));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Checkpoint checksum mismatch: ${entry.path}`);
  }
  return { format: manifest.format, checkpoints: manifest.checkpointFiles.length, databaseBytes: dump.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verifyAt = process.argv[2] === "--verify" ? process.argv[3] : null;
  if (verifyAt) {
    console.log(JSON.stringify(await verifyBackup(verifyAt)));
  } else {
    const destination = process.argv[2];
    console.log(JSON.stringify(await createBackup({ destination }), null, 2));
  }
}
