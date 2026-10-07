# Checkpoint backup and recovery

The release backup is a directory containing a PostgreSQL custom-format dump, a
copy of the owned checkpoint directory, and a mode-0600 JSON manifest with a
SHA-256 and byte count for every artifact. The command refuses a non-empty
destination and refuses non-regular checkpoint entries. It never deletes or
overwrites an existing backup.

Create one from a quiesced staging instance with:

```sh
DATABASE_URL=... CHECKPOINT_DIRECTORY=/srv/mochi/checkpoints \
  npm run checkpoints:backup -- /srv/mochi/backups/2026-10-06
npm run checkpoints:verify -- /srv/mochi/backups/2026-10-06
```

Verification checks every dump and checkpoint checksum before a restore is
attempted. Restore must target a separately provisioned database and checkpoint
volume, run the normal migration/reconciliation checks, then start one staging
worker and exercise account login, Mochi load/save, ordinary Coins receipt replay,
and a graceful restart. Do not use a production database or checkpoint volume as
the restore target. The restore drill remains an open release gate until it is
performed on owned staging infrastructure and its exact candidate SHA is recorded.
