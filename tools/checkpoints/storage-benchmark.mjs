import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { retentionPolicy } from "../../server/world/checkpoint-retention.mjs";
import { BrainProcess } from "../../sim/brain_proc.mjs";
import { TRADER_SPEC } from "../../web/js/traders/brain.js";
const file = "web/brains/traders-0.74.0-v1/basic.life",
  bytes = (await stat(file)).size;
const policy = retentionPolicy({ ...process.env, DEV_MODE: "true" });
if (!policy.enabled) throw Error("Simulation needs an explicit policy");
const saveIntervalMs = 300000;
const rows = [];
// A conservative every-decision full write, no dedup credit, one initial checkpoint.
// Enumerate only timestamps, never allocate large checkpoint files.
for (const pets of [1, 10, 40, 150])
  for (const hours of [1, 4, 24]) {
    let versions = [],
      created = 0,
      deleted = 0,
      peak = 0,
      current = 0;
    let nextSave = 0,
      nextGc = 0;
    for (
      let now = 0;
      now <= hours * 3600000;
      now = Math.min(nextSave, nextGc)
    ) {
      if (now === nextSave) {
        nextSave += saveIntervalMs;
        current = ++created;
        versions.push({ version: current, at: now });
        peak = Math.max(peak, versions.length);
      }
      if (now === nextGc) {
        nextGc += policy.intervalMs;
        const recent = new Set(
          versions.slice(-policy.keepRecent).map((x) => x.version),
        );
        const keep = versions.filter(
          (x) =>
            x.version === current ||
            recent.has(x.version) ||
            now - x.at < policy.graceMs ||
            now - x.at < policy.retentionHours * 3600000,
        );
        deleted += versions.length - keep.length;
        versions = keep;
      }
    }
    rows.push({
      pets,
      hours,
      beforeVersions: pets * created,
      beforeBytes: pets * created * bytes,
      afterVersions: pets * versions.length,
      afterBytes: pets * versions.length * bytes,
      peakBeforeGcBytes: pets * peak * bytes,
      createdFiles: pets * created,
      deletedFiles: pets * deleted,
    });
  }
const host = new BrainProcess();
let duplicate;
try {
  const baseline = await readFile(file);
  await host.call({
    op: "boot",
    spec: TRADER_SPEC,
    npz: baseline.toString("base64"),
  });
  const a = Buffer.from((await host.call({ op: "save" })).npz, "base64");
  await new Promise((r) => setTimeout(r, 2200));
  const b = Buffer.from((await host.call({ op: "save" })).npz, "base64");
  duplicate = {
    unchangedNativeBytesA: a.length,
    unchangedNativeBytesB: b.length,
    identicalAcross2200ms: a.equals(b),
    sha256A: createHash("sha256").update(a).digest("hex"),
    sha256B: createHash("sha256").update(b).digest("hex"),
  };
} finally {
  host.close();
}
const result = {
  kind: "deterministic bounded timestamp simulation, not a live 150-pet soak",
  representativeFile: file,
  representativeBytes: bytes,
  policy,
  saveIntervalMs,
  initialCheckpoint: true,
  pins: 0,
  leases: 0,
  crashOrphans: 0,
  duplicateMeasurement: duplicate,
  rows,
};
await mkdir("assays", { recursive: true });
await writeFile(
  "assays/checkpoint-storage.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
