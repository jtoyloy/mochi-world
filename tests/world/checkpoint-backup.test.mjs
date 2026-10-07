import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifyBackup } from "../../tools/checkpoints/backup.mjs";

test("backup verification rejects a changed dump or checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "mochi-backup-"));
  await mkdir(join(root, "checkpoints"));
  await writeFile(join(root, "database.dump"), "dump");
  await writeFile(join(root, "checkpoints", "one.life"), "life");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  await writeFile(join(root, "manifest.json"), JSON.stringify({
    format: 1,
    databaseDump: { path: "database.dump", bytes: 4, sha256: digest("dump") },
    checkpointFiles: [{ path: "checkpoints/one.life", bytes: 4, sha256: digest("life") }],
  }));
  assert.deepEqual(await verifyBackup(root), { format: 1, checkpoints: 1, databaseBytes: 4 });
  await writeFile(join(root, "checkpoints", "one.life"), "tampered");
  await assert.rejects(verifyBackup(root), /Checkpoint checksum mismatch/);
  assert.equal((await readFile(join(root, "database.dump"), "utf8")), "dump");
});
