# Checkpoint backup and recovery

The release backup is a directory containing a PostgreSQL custom-format dump, a
copy of the owned checkpoint directory, and a mode-0600 JSON manifest with a
SHA-256 and byte count for every artifact. Backup directories are mode 0700;
the dump and every copied checkpoint are private from their first byte. The
command refuses a non-empty or symlink destination and validates all source
entries before copying. It never deletes or overwrites an existing backup.

Before creating a backup, stop **all** application processes that can write to
the database or checkpoint volume, including battle/trading workers and
checkpoint GC. Keep them stopped until the command completes. Confirm there
are no external writers. A PostgreSQL dump alone does not make the separate
checkpoint copy consistent with its snapshot. The required `--quiesced` flag
records the operator's acknowledgement; the tool cannot prove that writers
have stopped and does not acquire distributed application locks.

Create one from that quiesced staging instance with:

```sh
DATABASE_URL=... CHECKPOINT_DIRECTORY=/srv/mochi/checkpoints \
  npm run checkpoints:backup -- --quiesced /srv/mochi/backups/2026-10-10
npm run checkpoints:verify -- /srv/mochi/backups/2026-10-10
```

Verification treats the manifest as untrusted: it rejects absolute/traversing
paths, duplicate or invalid records, symlinks and other non-regular entries,
unlisted/missing files and directories, and group/world-accessible artifacts.
It checks every dump and checkpoint checksum using bounded-memory streaming;
the manifest itself is limited to 16 MiB. Directory inventory includes empty
checkpoint directories. Older format-1 manifests remain verifiable when their
inventory is complete and permissions are private; tighten legacy artifact
permissions before verifying them. Verification establishes integrity of the
listed artifacts, not the authenticity of an unsigned manifest or proof of
cross-store consistency. Restrict backup ownership and concurrent filesystem
access; this tool is not a boundary against a malicious privileged host that
replaces parent directories during a run.

A failed creation leaves an incomplete private directory without a manifest;
inspect it and choose a new empty destination for a retry. No automatic cleanup
deletes potentially useful evidence. The PostgreSQL URI is parsed into explicit
libpq environment settings (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`), never placed in command-line arguments. Inherited `PG*` settings
are cleared to prevent another service or host from overriding the URI. The URI
must name a host and database (a socket path may be supplied with `host=`).
Supported query parameters are `host`, `hostaddr`, `port`, `dbname`, `user`,
`password`, `options`, `application_name`, `connect_timeout`, `sslmode`,
`sslrootcert`, `sslcert`, and `sslkey`; unsupported or duplicate parameters fail
before creating the destination. Protect the
host and process environment, and encrypt backups at rest/offsite according to
the deployment's policy; filesystem modes do not provide encryption.

Restore must target a separately provisioned database and checkpoint
volume, run the normal migration/reconciliation checks, then start one staging
worker and exercise account login, Mochi load/save, ordinary Coins receipt replay,
and a graceful restart. Do not use a production database or checkpoint volume as
the restore target. The restore drill remains an open release gate until it is
performed on owned staging infrastructure and its exact candidate SHA is recorded.

## Guarded local or staging restore

Provision a separate, empty database first and an empty checkpoint directory with
mode 0700. Stop all writers to both targets. Use an operator-owned, trusted local
backup: a SQL dump can execute arbitrary SQL even when every checksum passes.
The manifest is unsigned and verification does not authenticate it.

```sh
RESTORE_DATABASE_URL=... RESTORE_CHECKPOINT_DIRECTORY=/srv/mochi/restored-checkpoints \
  node tools/checkpoints/restore.mjs --quiesced --trusted-local-backup /srv/mochi/backups/2026-10-10
```

The tool verifies the backup before connecting, requires a different database
name, checks the connected identity and absence of user database objects, and
claims a per-database advisory lock. It refuses nonempty, symlink, nonprivate or
overlapping checkpoint destinations. It never creates a database or drops,
cleans or overwrites existing target data. `pg_restore` uses `--no-owner`,
`--no-privileges`, `--single-transaction` and `--exit-on-error`; credentials stay
in explicit connection environment settings. Inspection supports explicit host
connections and sslmode disable/require/verify-ca/verify-full; hostaddr is refused.
Database names must be 1–63 ASCII letters, digits, underscores, spaces or hyphens,
starting with a letter, digit or underscore. New backups record the non-secret
source database name, allowing fresh zero-checkpoint restores. Older backups
require a consistent copied ownership marker to establish their source identity.

After restoring, the tool checks every checkpoint catalog byte count, SHA-256,
filename identity/version and storage scope, plus each current and leased Mochi
checkpoint pointer. Deduplicated older checkpoint versions are allowed. Only the
copied namespace matching the restored database's `checkpoint_storage_scope` has
its `.owner.json` rebound to the connected target identity; the backup remains
unchanged. Fresh backups without files require no ownership rewrite. Completion
is recorded in the target directory only after validation and durable writes.
Failures retain the target and `.restore-in-progress.json` for inspection; do
not start a worker or retry there. Provision new empty targets for a retry.
These guards require exclusive operator control of targets and backup paths;
the advisory lock only coordinates this tool, not unrelated database writers.
Then perform the staging worker load/save, receipt replay and restart checks
above before recording the restore release gate as passed.

## Owned local restore drill — 2026-10-10

Restore tool `de69d4e`, server/API smoke at
`7fd483878ad89a68c7718730bea913483e113e27`. Source and targets were dedicated
local fixtures in mock token mode on a loopback PostgreSQL listener. All source
application writers were stopped, and database activity confirmed no other source
clients before backup. The first attempt failed because PGDATABASE did not parse
a URI; the incomplete private copy was retained. Correction `917ad1b` produced a
verified custom dump (257097 bytes) and seven checkpoint files including the
namespace owner marker. No backup manifest was hand-edited.

The guarded tool restored into a separately created empty database and a new
private checkpoint directory. Six catalog records and current/lease pointers
validated, and only the copied current scope's owner marker was rebound. Normal
migration passed. One-worker local server smoke then verified synthetic account
login, the same active companion, a brain load/save/reload (version 4 → 5 with
unchanged brain bytes), and an offline exact receipt replay. Coins stayed 510,
wood sales stayed one, and no duplicate resource sale occurred. A graceful stop
and restart preserved brain version 5, Coins, receipt count, dummy practice and
Trading Hall progress. The source backup verified again after the drill.

This is a passed owned local recovery drill, not production staging, offsite
restore, encryption, disaster timing or public deployment certification. Session
expiry with an unsaved live browser brain remains a separate acceptance gate.
