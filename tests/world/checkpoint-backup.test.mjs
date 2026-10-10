import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createBackup, verifyBackup } from "../../tools/checkpoints/backup.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mochi-backup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "checkpoints"), { mode: 0o700 });
  await writeFile(join(root, "database.dump"), "dump", { mode: 0o600 });
  await writeFile(join(root, "checkpoints", "one.life"), "life", { mode: 0o600 });
  const manifest = { format: 1,
    databaseDump: { path: "database.dump", bytes: 4, sha256: digest("dump") },
    checkpointFiles: [{ path: "checkpoints/one.life", bytes: 4, sha256: digest("life") }] };
  const save = () => writeFile(join(root, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
  await save();
  return { root, manifest, save };
}

test("backup verification rejects a changed dump or checkpoint", async (t) => {
  const { root } = await fixture(t);
  assert.deepEqual(await verifyBackup(root), { format: 1, checkpoints: 1, databaseBytes: 4 });
  await writeFile(join(root, "checkpoints", "one.life"), "tampered");
  await assert.rejects(verifyBackup(root), /Checkpoint checksum mismatch/);
  assert.equal((await readFile(join(root, "database.dump"), "utf8")), "dump");
  await writeFile(join(root, "checkpoints", "one.life"), "life");
  await writeFile(join(root, "database.dump"), "modified");
  await assert.rejects(verifyBackup(root), /Database dump checksum mismatch/);
});

test("untrusted manifest paths, duplicate records and invalid metadata are rejected", async (t) => {
  const { root, manifest, save } = await fixture(t);
  const good = structuredClone(manifest);
  for (const path of ["../outside", "/etc/passwd", "checkpoints/../database.dump", "checkpoints//one.life", "checkpoints/./one.life", "checkpoints\\one.life", "C:/outside", "checkpoints/one.life\0"]) {
    manifest.checkpointFiles = [{ ...good.checkpointFiles[0], path }];
    await save();
    await assert.rejects(verifyBackup(root), /Invalid backup manifest entry/);
  }
  manifest.checkpointFiles = [good.checkpointFiles[0], good.checkpointFiles[0]];
  await save();
  await assert.rejects(verifyBackup(root), /Duplicate/);
  manifest.checkpointFiles = good.checkpointFiles;
  manifest.databaseDump.path = "checkpoints/one.life";
  await save();
  await assert.rejects(verifyBackup(root), /Invalid backup manifest entry/);
  manifest.databaseDump = { ...good.databaseDump, bytes: -1 };
  await save();
  await assert.rejects(verifyBackup(root), /Invalid backup manifest entry/);
  manifest.databaseDump = { ...good.databaseDump, sha256: "not-a-hash" };
  await save();
  await assert.rejects(verifyBackup(root), /Invalid backup manifest entry/);
});

test("verification rejects extra files, omitted files and unlisted empty directories", async (t) => {
  const { root, manifest, save } = await fixture(t);
  await writeFile(join(root, "unlisted"), "extra", { mode: 0o600 });
  await assert.rejects(verifyBackup(root), /inventory/);
  await rm(join(root, "unlisted"));
  await mkdir(join(root, "checkpoints", "empty"), { mode: 0o700 });
  await assert.rejects(verifyBackup(root), /inventory/);
  manifest.checkpointDirectories = ["checkpoints/empty"];
  await save();
  await verifyBackup(root);
  await rm(join(root, "checkpoints", "one.life"));
  await assert.rejects(verifyBackup(root), /inventory/);
});

test("verification rejects file, directory and manifest symlinks", async (t) => {
  const { root } = await fixture(t);
  for (const path of ["extra-link", "checkpoints/link-dir", "checkpoints/link-file"]) {
    await symlink(path.includes("dir") ? root : join(root, "database.dump"), join(root, path));
    await assert.rejects(verifyBackup(root), /non-regular/);
    await rm(join(root, path));
  }
  await rm(join(root, "manifest.json"));
  await symlink(join(root, "database.dump"), join(root, "manifest.json"));
  await assert.rejects(verifyBackup(root), /non-regular/);
});

test("verification refuses sensitive files or directories with group/world access", async (t) => {
  const { root } = await fixture(t);
  for (const [path, exposed, privateMode] of [["database.dump", 0o644, 0o600], ["manifest.json", 0o644, 0o600], ["checkpoints/one.life", 0o640, 0o600], ["checkpoints", 0o755, 0o700], ["", 0o755, 0o700]]) {
    await chmod(join(root, path), exposed);
    await assert.rejects(verifyBackup(root), /permissions must be private/);
    await chmod(join(root, path), privateMode);
  }
});

test("multi-chunk dump hashes and byte counts are verified without changing content", async (t) => {
  const { root, manifest, save } = await fixture(t);
  const bytes = Buffer.alloc(256 * 1024 + 17, 0x6d);
  await writeFile(join(root, "database.dump"), bytes);
  manifest.databaseDump = { path: "database.dump", bytes: bytes.length, sha256: digest(bytes) };
  await save();
  assert.equal((await verifyBackup(root)).databaseBytes, bytes.length);
});

test("creation requires quiescence and rejects source links before copying or invoking pg_dump", async (t) => {
  const { root } = await fixture(t);
  const destination = join(root, "unused-target");
  await assert.rejects(createBackup({ destination, databaseUrl: "postgres://unused", checkpointDirectory: join(root, "checkpoints") }), /explicit quiesced/);
  await symlink(join(root, "database.dump"), join(root, "checkpoints", "source-link"));
  await assert.rejects(createBackup({ destination, databaseUrl: "postgres://unused", checkpointDirectory: join(root, "checkpoints"), quiesced: true }), /non-regular/);
  assert.ok(!(await readdir(root)).includes("unused-target"));
});
