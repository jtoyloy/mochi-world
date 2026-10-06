# Cadence checkpoint lifecycle and retention

## Model inspected before implementation

Inspected fetched `origin/main` at `ad7d959` and the real soak branch at `7e70662`.
`docs/INTEGRATION_VALIDATION.md` does not exist in either tree. The lifecycle tests
are `tests/world/economy.test.mjs`, `tests/adventure/gameplay.test.mjs`, and the
Python trader/battle tests.

Browser PUT `/api/mochis/:id` saves under a two-minute owner lease, with a matching
version and pack. Each accepted save previously wrote a new opaque `.life` file,
even for identical bytes, and atomically updated body/personality and brain metadata
in a PostgreSQL transaction. Invalid/expired leases cannot write. Browser autosave (`web/js/game.js`) is dirty+calm after eight seconds, calm
periodic after one minute, or forced after three minutes; it also saves on hidden/
pagehide after enough ticks, plus explicit saves around care/room transitions.
Browser autosave is a full Cadence ZIP/NPZ life, not a delta. JSON body and metadata remain in the DB.

The native trader scans registered pets every ten seconds, but only saves after an
eligible decision (normally five minutes, one minute in competitions). Sleeping,
leased and interval-ineligible pets skip the host/save entirely. Decisions include
learning/pending reward continuation; they must remain durable. A native save updates
brain version, world, trading portfolio and pending action in one DB transaction.
Battle uses a different `battle-v1` domain/pack and overwrites its PostgreSQL `bytea`
checkpoint in `mochi_battle_brains`; trading filesystem GC must never touch it.

`mochi_brains.checkpoint_key` was the only file reference; no historical file catalog
existed. Loads selected that exact pointer, or legacy inline bytes, or the published
initial pack only for a brain with no saved checkpoint. Missing/corrupt referenced
files were not recoverable via historical metadata. Writes used temp+rename but
no fsync. A failure before DB commit left an unreferenced full file; pointer/state
rollback preserved the prior reference. No version retention or deduplication
existed. The soak measured median 6.23 MiB and roughly 10.9 GiB/hour for 150 pets.

## Implementation policy

Implementation, configuration, measurements and validation are recorded below.

Each new trading file is cataloged in `brain_checkpoints` with its identity,
physical creation version, SHA-256, byte size, creation time, native-load verification and pin flag. The
existing world migration adds that catalog, a database/schema scope UUID, and
`mochi_brains.lease_checkpoint_key`/`lease_checkpoint_known`. No battle table or published pack changes.
New files live under `CHECKPOINT_DIRECTORY/managed-<scope UUID>/`. An atomically
published, fsynced `.owner.json` binds that namespace to the database/schema/server
endpoint. A conflicting or unreadable owner marker fails closed. Two schemas,
or two databases cloned with the same scope UUID, cannot simply claim the same
folder. Use a separate volume/directory for restored/cloned databases; do not
reuse production storage for a clone. Consistent database endpoints are required
for application replicas sharing this filesystem. Endpoint/schema changes require
an operator-controlled ownership migration; the strict marker otherwise refuses
new physical writes/GC while leaving existing referenced reads available.

The collector runs on a background timer, not the decision or gameplay tick:

1. Take a nonblocking collector advisory lock for this namespace. List only its
   managed files; legacy root files are inventoried but never automatically deleted.
2. For each registered trading identity, try its existing `brain:<id>` advisory
   transaction lock. Skip busy identities, including an in-flight save or read.
3. Read and verify the current referenced file. New files must match their stored
   SHA-256/size; legacy files must pass ZIP container integrity. Before deletion,
   an unverified current must also cold-load successfully through the existing
   native Cadence host. Native-generated saves already carry that proof; browser/
   imported files receive it after a read-only boot/report (no tick, reward, action,
   learning or save). The verifier closes after the pass. Unsupported packs or an
   unavailable verifier retain all files and record a validation failure. If there is no
   current file, it is missing/corrupt/unloadable, or an upgraded active lease has no known
   load-time reference, retain **all** files for that identity.
4. Preserve the current reference, the live lease's acquisition-time reference,
   the N most recent present cataloged files, pinned files, every file inside the
   age window, and every file/temp file inside the orphan grace period.
5. Under the same brain lock, recheck every current/active-lease reference and pin
   across the catalog/brain tables. Refuse identity mismatches. Only then unlink
   an obsolete managed file; remove its catalog row afterwards. Missing already
   deleted files are harmless. Reconcile obsolete missing catalog entries on retry.
6. Unknown identities, foreign namespaces and unbound nonempty folders remain
   untouched. DB verification or filesystem failures abort work and retain the
   remaining candidates, with a recorded error. Earlier safe deletions in a failed
   batch may already have occurred; GC does not promise batch atomicity.

All writers, reads, pin changes and lease acquisition/release use the same brain
lock. The short load transaction completes reading bytes before GC can unlink;
lease protection then retains the acquisition file while a browser is active.
A long-running browser can continue saving: only current/recent and its single
load-time reference need protection, not every version ever written in that lease.
A new bootstrap/inline lease explicitly records that no old file was loaded;
it can collect obsolete files normally rather than act like an unknown upgraded
lease. The two-minute heartbeat/version conflict contracts remain unchanged. Do not
update checkpoint pointers/pins through concurrent raw SQL; use the repository
operations. Multiple collectors coordinate through PostgreSQL; independent app
replicas must use the same DB, namespace and shared persistent filesystem.

## Configuration and operations

Development (`DEV_MODE=true`) defaults are:

| Setting | Development value | Meaning |
|---|---:|---|
| `CHECKPOINT_KEEP_RECENT` | 3 | Recent distinct files per identity, including the normal current file |
| `CHECKPOINT_RETENTION_HOURS` | 0 | Retain every file newer than this rolling horizon |
| `CHECKPOINT_GC_INTERVAL_MS` | 60000 | Background collection cadence |
| `CHECKPOINT_GC_GRACE_MS` | 600000 | Minimum age for deleting retired/orphan/temp files |
| `CHECKPOINT_DIRECTORY` | `data/checkpoints` | Persistent filesystem root |

Production must explicitly supply all four retention settings. The server refuses
startup with an incomplete policy rather than silently enable append-only operation
or invent a production retention duration. N must be >=1; interval/grace must be
>=1 second. Select production values from your recovery objectives, write rate,
GC throughput and disk budget. Grace must exceed expected write/clock/storage
uncertainty. Longer age retention or many pins require more disk.

Apply `npm run db:migrate` before starting the revised server. Migration is additive
and leaves legacy pointers/inline lives intact. Old clients keep their lease/version
protocol; an existing lease with no acquisition pointer conservatively blocks GC
until expiry/release. Retire old server binaries before enabling GC: they do not
participate in the new managed-file catalog/protection protocol.

With the same DB/volume/config as the application:

```
npm run checkpoints:gc -- --dry-run
npm run checkpoints:gc
npm run checkpoints:gc -- --pet=MOCHI_ID --pin=MANAGED_CHECKPOINT_KEY
npm run checkpoints:gc -- --pet=MOCHI_ID --pin=MANAGED_CHECKPOINT_KEY --unpin
npm run bench:checkpoints
```

An unconfigured production CLI can inventory but cannot delete. Pins are explicit
operator references, not automatic gameplay awards; they remain until unpinned.
Legacy files are preserved by default, so existing disk usage will not magically
shrink. Inventory their bytes and reconcile against **all** databases/backups
before any separate, authorized legacy migration/cleanup.

## Writes, deduplication and crash recovery

Validate the request and ZIP container before allocating a file. Create an exclusive
0600 temp file, write the full bytes, fsync, rename to an immutable final key, and
fsync its directory before PostgreSQL can commit the pointer. Catalog insertion and
all authoritative body/trading state updates use the existing single transaction.
Failed writes or commits never replace the old committed pointer.

If bytes equal the current catalog digest, verify the existing file before reusing
its key. Metadata, body and logical brain version still commit normally. An inline legacy brain is first archived as a pinned managed file before its only
DB bytes can be replaced. This adds at most one automatic legacy pin per migrated
identity; unpin only after its recovery/backup requirement expires. Native paths
may also retain the old inline JSON until a browser metadata save replaces it.
No learning update is skipped, throttled or coalesced. Native sleeping/leased/interval skips
already avoided writes; those controls remain unchanged. Immediate unchanged
serialization can be identical, but the measured native serializers differed across
2.2 seconds despite no decision in between. Exact-byte dedup intentionally does
not normalize ZIP metadata or infer equality of learned state. The growth model
below assumes **no dedup savings**.

- Crash before completing a write: prior current remains; an old partial temp file
  can be collected after grace if a valid current exists.
- Crash after rename but before pointer commit: the prior pointer/state remain;
  the new orphan is eligible later, under the same reference/valid-current checks.
- Crash after commit: the new durable file is the authoritative checkpoint.
- Crash after unlink but before catalog commit: only an already-obsolete unreferenced
  file is gone. Retry safely reconciles its missing catalog entry.
- First save crashes with no valid current: keep the orphan as the only potential
  recovery evidence. Do not sweep it merely because its transaction rolled back.

Recovery loads the newest **committed reference**, not the highest filename or an
uncommitted orphan. A missing/corrupt current raises an error and blocks GC for that
brain; it never silently falls back to the initial pack or credits a reward again.
Restore the verified referenced object from backup to preserve exact body/brain
state. If that object is unrecoverable, restore a consistent DB+checkpoint backup
under operator control. An older NPZ alone cannot safely roll back world, portfolio,
pending feedback, inventory or rewards; automatic historical rollback is deliberately
absent. Pin checkpoints needed by release/version-bound backups and back up their
corresponding DB snapshots. ZIP integrity validates the container; GC additionally requires native loadability
of the recovery anchor. This is not proof that every future decision can settle.

## Telemetry

`runtimeMetrics` IPC now includes `checkpoints`; the GC CLI emits the same diagnostics.
No public unauthenticated admin endpoint was added. Inventory fields update after a
collector pass and carry its timestamp. They include total file/temp count and bytes,
referenced/pinned count, managed unreferenced count, legacy count/bytes (and unverified
legacy count), largest file and oldest retained key/version/timestamp. Totals cover this managed
namespace plus the legacy root, not unrelated managed namespaces. Unknown legacy
files may belong to another database, so they are not falsely labeled unreferenced.

Process-local rolling counters report bytes physically written in the last hour,
files created/deleted in the last hour, exact-byte reuse, per-brain save attempts
in the last hour, per-brain physical creates since process start, GC duration,
GC failures/last error, native-load validation failures/last error, and blocked identities. They are not durable cross-replica
billing counters. File allocation counters can include writes whose DB transaction
later rolled back; these are real disk writes. Inventory counts do not include a
missing referenced file as an existing file. Runtime alerts should watch blocked
brains, GC failures, stale inventory timestamps, storage free space, and sustained
write demand exceeding collection/storage throughput.

## Disk bound and measured simulation

The deterministic timestamp simulator creates no bulk checkpoint files. It uses a
real published snapshot of **6,487,877 bytes (6.19 MiB)** and writes every five minutes,
including one initial snapshot, for 1/10/40/150 pets over 1/4/24 hours. Its policy is
the explicit development policy above, with no pins, active leases or crash orphans.
See `assays/checkpoint-storage.json`. This is a storage simulation, not live 150-CCU
capacity certification.

| Pets | Before 1h GiB | Before 4h GiB | Before 24h GiB | After each horizon GiB | Peak before GC GiB |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.0785 | 0.2961 | 1.7462 | 0.0181 | 0.0242 |
| 10 | 0.7855 | 2.9607 | 17.4623 | 0.1813 | 0.2417 |
| 40 | 3.1420 | 11.8429 | 69.8491 | 0.7251 | 0.9668 |
| 150 | 11.7825 | 44.4110 | 261.9340 | 2.7190 | 3.6254 |

Normal retained storage converges to three distinct files per identity (150 pets:
**2.72 GiB**) with a synchronized pre-GC peak of four (**3.63 GiB**). Without retention,
150 pets add approximately **10.88 GiB/hour** for this representative file, matching
the earlier ~10.9 GiB/hour measurement. Physical write bandwidth still exists:
retention bounds stored bytes, not learning-save I/O. Different pack sizes and
one-minute competition decisions must be budgeted separately. A visible browser
can save much faster (dirty+calm at eight seconds); its grace/age window therefore
retains more files than the five-minute native-trading model.

A conservative healthy-system provision formula is:

```
Smax * A * [1 + N + P + L + ceil(r * max(H,G)) + ceil(r * I)]
+ Smax * W + legacy_bytes + exceptional_orphan_bytes + DB/backup/headroom
```

A is registered saving brain identities (not CCU), N recent files, P maximum
operator pins per identity, L protected lease files per identity (<=1), r maximum
full-file save rate per identity per hour, H retention hours, G grace hours, I GC
interval hours, Smax largest provisioned checkpoint size, and W maximum concurrent
temporary payloads (writes or native loads) for headroom. The union overlaps, so this formula deliberately
exceeds the typical three-file footprint. For ordinary continuously saving brains,
current is normally included in N. A rolling age window, grace and interval add
only finite file counts for a bounded write rate. Dedup can only reduce storage.

No finite automatic bound is promised during indefinitely failing GC, invalid
current states, unlimited pins, repeated first-save failures, or infinite creation
of new pets. Those cases intentionally preserve recovery evidence. Alert and repair
rather than weaken fail-closed checks. Legacy retention and backups are additional
operator-managed storage; they are excluded from the normal converging footprint.

## Object storage and remaining risks

The adapter boundary is `bind`, immutable durable `write`, `read`, `list` and
`remove`; lifecycle/identity/reference decisions stay in PostgreSQL. Future S3/R2
must confirm durable upload and checksums before pointer commit, bind its namespace
to the DB, enforce object generation/version preconditions, retain deletion grace
beyond listing/replication uncertainty, and account for versioning/delete markers
and backup storage. An eventually consistent list cannot certify an absent backup;
do not port filesystem unlink semantics blindly. No object backend was implemented.

PostgreSQL fsync/synchronous commit must provide durable reference commits.
Fsync behavior depends on the filesystem/volume. A storage outage fails saves and
must not be swallowed. Multi-instance correctness requires all participants to use
these locks/protocols and one consistent database/storage scope. DB-clone and backup
operations require separate volumes and explicit reference management. Pinned files
must retain corresponding DB backup state. Full ZIP checks add CPU to new writes;
GC reads/hashes the current snapshot and cold-loads unverified snapshots; it can contend for disk/CPU even though it runs
outside the gameplay tick. Large histories/registered populations still need GC
throughput and latency measurement on launch hardware.

## Validation

`npm test`: **184 passed, zero skipped**, with the normal local PostgreSQL test
URL supplied. The 20 checkpoint-focused tests cover exact restart state, newest
committed reference, corruption/missing current, partial temp/orphan, save/GC race,
active and upgraded leases, pins/recent/age/dry-run, current/foreign references,
identity mismatches, failed writes/transactions, failed DB verification,
collector idempotency/coordination, clone namespace refusal, battle isolation,
ZIP-valid non-Cadence recovery refusal, and 24 concurrent guarded loads exceeding
the pool size, bounded fresh bootstrap leases, and pinned preservation of legacy
inline bytes. Guarded loads/native economy reads reuse their transaction client;
no nested pool acquisition can strand a fully occupied pool.
The existing real native trading/battle persistence tests also pass.
`npm run test:brain`: **21 Python tests passed**. The deterministic benchmark
completed without allocating large files; `git diff --check` passed.

`assays/checkpoint-runtime-query-warning.json` preserves the intermediate live
run that failed acceptance on a PostgreSQL concurrent-query deprecation warning.
Its storage/movement checks passed; the warning was fixed by issuing transaction
client reads sequentially instead of queueing concurrent queries on one client.

`assays/multiplayer-10-65s.json` is the short real authenticated runtime smoke with
the new namespace binding and background diagnostics. It passed with no server/
harness errors. Inventory recorded ten current referenced files, zero temp/
unreferenced managed files, **65,277,249 bytes (62.25 MiB)**, and zero GC failures.
The sampled collector pass took 118.65 ms across the ten identities; this is whole
background work, not movement tick duration. No obsolete files existed in this
65-second run, so it verifies integration/telemetry, while the database-backed
retention tests exercise actual deletion. This does not replace a sustained
150-user/storage soak on production hardware.

The short smoke preceded the final bootstrap-lease and inline-archive refinements;
those paths are covered by the final PostgreSQL regression suite.
