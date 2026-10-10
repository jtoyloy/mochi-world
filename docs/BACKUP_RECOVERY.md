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
deletes potentially useful evidence. The database URL is passed to `pg_dump`
through its environment rather than its command-line arguments. Protect the
host and process environment, and encrypt backups at rest/offsite according to
the deployment's policy; filesystem modes do not provide encryption.

Restore must target a separately provisioned database and checkpoint
volume, run the normal migration/reconciliation checks, then start one staging
worker and exercise account login, Mochi load/save, ordinary Coins receipt replay,
and a graceful restart. Do not use a production database or checkpoint volume as
the restore target. The restore drill remains an open release gate until it is
performed on owned staging infrastructure and its exact candidate SHA is recorded.
