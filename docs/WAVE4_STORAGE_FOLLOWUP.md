# Wave 4 checkpoint storage follow-up

Result: the existing collector physically deletes obsolete files and reaches a plateau over repeated write/GC cycles. The host cannot safely support a full 150-pet trading soak at measured current checkpoint sizes. Keep CCU certification false. No production retention, brain format, pack, or save cadence was changed.

## Predeclared recovery policy

Retain three recent checkpoints: current recovery state plus two previous rollback states. Keep the current pointer, active lease acquisition checkpoint, explicit pins, and all files belonging to an unverified/corrupt current brain. Preserve a ten-minute grace and run GC every sixty seconds, with zero additional age retention. Production must explicitly configure all four policy settings; development defaults are not a production configuration. This exercise uses those defaults without lowering `keepRecent`.

Two versions would leave only one rollback state, reducing recovery depth by one save interval. There is no measured recovery requirement authorizing that loss here. Longer save cadence also increases progress lost on a crash and cannot skip authoritative owed outcomes. Neither shortcut is taken. Pins, lease anchors, failed GC and crash orphans require additional capacity; they are intentionally outside the ordinary steady-state bound.

## Real life payload measurements

Read-only samples and every inner array size/digest are in `assays/wave4-checkpoint-payload.json`. The warm sample is the largest of 196 surviving life files in the earlier multiplayer worktree, not a new 150-pet measurement. It has seven aroused ticks and a pending native outcome. Its SHA-256 identifies the sample without recording the unrelated worktree path or shipping another life blob.

| Sample | Total bytes | Outer ZIP DEFLATE candidate bytes |
| --- | ---: | ---: |
| Published cold trader | 6,487,877 | 6,385,122 |
| Warm trader, seven ticks | 9,161,225 | 9,058,557 |

The 2,673,348-byte growth is dominated by `actor/trace.npy`: 2,597,047 compressed bytes. Free-phase and pending plus/minus settlement arrays account for most remaining growth. These are the eligibility and owed-outcome state needed to resume learning, not an append-only episode history. Parameters `efficacy.npy` and `sign.npy` each occupy about 3.18 MB compressed in both samples.

Cadence already compresses the inner brain NPZ. Mochi stores that NPZ and an uncompressed shown-store NPZ in an outer stored ZIP. The shown arrays contain the separate demonstration store, not a duplicate outcome store; its 47,570-byte NPZ is small. Removing traces, pending phases, random generator state or the demonstrated memory would change recovery semantics. No such state was removed.

Outer DEFLATE preserves every inner payload byte in the audit, but saves only 102,668 bytes (1.12%) on the warm sample. Audit runtime is recorded with the artifact (about 150–170 ms on this host); it is not a concurrency benchmark. That tradeoff cannot repair the gigabytes of missing headroom, so compression was not enabled in production. No published pack was edited.

Memory/tensor shapes for this fixed connectome and one stream are bounded; counter text grows slowly and compressed size changes as zero traces become populated. The observed warm schema contains 34,014,761 raw NPY bytes before ZIP/NPZ headers. Thus 9.16 MB is a measured size, not a guaranteed upper limit: learned dense floats can compress much less well, and additional streams/optional state need separate sizing. A conservative deployment allowance of **40 MiB per one-stream trader life** accommodates these observed raw arrays and container overhead; validate it against the actual deployed pack/stream count and watch `largestCheckpointBytes`. It is a capacity allowance, not a proven maximum over every possible Cadence configuration.

Exact-byte dedup already reuses an unchanged preceding checkpoint. Native saves at different ZIP timestamps differ even with unchanged inner state (the historical `assays/checkpoint-storage.json`, preserved unchanged). Canonical timestamps could improve unchanged-save dedup in a future new pack, but content-addressing cannot dedup genuinely different learned traces. Cross-life sharing would require an immutable blob reference catalog and reference-safe GC; introducing it here would broaden the recovery risk without evidence of a useful win.

## Bounded sizing and physical multi-cycle evidence

`tools/checkpoints/storage-benchmark.mjs` now sizes the timestamp simulation with the measured **9,161,225-byte warm life**, replacing the stale 6.49 MB cold representative. `CHECKPOINT_SIZING_BYTES` can raise the planning bound. `assays/wave4-checkpoint-storage.json` enumerates 1/10/40/150 pets for 1/4/24 hours. At 150 pets it retains 450 versions, deletes 1,500 / 6,900 / 42,900 versions respectively, and reaches the same 600-version peak in all three durations. These are simulated counts, with no dedup credit, pins, leases or crash orphans.

`tools/checkpoints/live-cycles.mjs` separately uses a real isolated PostgreSQL schema, scoped storage, fsynced writes, native cold-load verification, authoritative pointer transactions and physical unlink. Its collector clock is advanced beyond the unchanged ten-minute grace; it does not pretend to wait thirty minutes or reproduce CCU. Nine sequential full-size warm-life writes vary only a ZIP comment, preserving every brain/state payload. Every cycle verifies byte-exact latest recovery, disk inventory, catalog count, deletion count and an idempotent second GC.

`assays/wave4-storage-cycles.json` records:

- Versions one/two/three retain one/two/three files.
- Fourth write grows to four files; GC physically deletes one.
- Each of the next five writes repeats four → delete one → three.
- Six physical deletions total; all second collections delete zero.
- Peak: 36,644,968 bytes. Plateau: 27,483,726 bytes. Catalog stays at three.
- Native validation succeeds; no blocked brains. Only this fixture's schema and temporary directory are removed afterward.

Reproduce with `TEST_DATABASE_URL=... CHECKPOINT_SAMPLE=/path/to/warm.life node tools/checkpoints/live-cycles.mjs`. Omitting the sample uses the published cold life. The script refuses a missing database URL and checks the three-GiB safety floor before allocating and before each subsequent write. This is an executable assertion fixture, not a skipped test or synthetic unlink counter.

## Capacity and external constraint

For N pets, maximum checkpoint size S, interval between writes Δ, grace G, GC period I, additional age retention H, and recent count K, a conservative normal version-count allowance is `max(K, ceil(max(G,H)/Δ)+1) + ceil(I/Δ)` per pet. Under the measured five-minute cadence, ten-minute grace and one-minute GC, this is four. Ordinary synchronized peak is therefore **N × 4 × S**, before active temporary writes, pinned/leased older states, crash orphans and database/build/log growth. GC failures invalidate a finite steady-state disk assumption and must alert before the safety floor.

At N=150 and S=9,161,225 bytes:

- Steady three-version storage: 3.839 GiB.
- Fourth-version/GC peak: 5.119 GiB.
- One extra per-pet pinned or lease anchor: add 1.280 GiB each; overlap must not be double counted.
- At least 8.119 GiB free is necessary even with no additional anchors, before temporary writes and other growth, to preserve the three-GiB floor.

Atomic write uses a temporary file then rename, so each concurrent in-flight write requires up to S additional bytes until rename; it does not copy the completed file a second time. Allow `concurrentWriters × S` beyond the checkpoint count bound. PostgreSQL WAL, database growth, benchmark outputs and builds also consume the same physical volume. Their concurrent growth prevented attributing the host's free-space decrease to this fixture: owned checkpoint peak was only 35 MiB and was removed on completion. No unrelated files were deleted.

The physical fixture began with 3.786 GiB free. The host was approximately 3.1 GiB free after concurrent work, so allocating 150 lives is unsafe. Even the three retained warm versions exceed the available headroom above the floor. For deployment using the 40-MiB planning allowance, normal four-version checkpoint peak is 23.438 GiB, plus the floor is **26.438 GiB**, before pins, lease anchors, concurrent writes, WAL and operational reserve. Provision extra headroom for those terms and verify the real pack. A full requested 150/30-minute certification remains external-disk-blocked; the accelerated cycle evidence does not certify it.


Stage preflight using warm S and an inclusive initial save, with isolated checkpoint storage per stage:

| Stage | Duration | Versions present by end per pet | Bytes | Minimum free GiB including floor |
| --- | ---: | ---: | ---: | ---: |
| 10 pets | 5 minutes | 2 | 183,224,500 | 3.171 |
| 40 pets | 5 minutes | 2 | 732,898,000 | 3.683 |
| 75 pets | 10 minutes | 3 | 2,061,275,625 | 4.920 |
| 150 pets | 30 minutes | peak 4 | 5,496,735,000 | 8.119 |

Add concurrent temporary files, optional legacy pins/lease anchors and other-volume growth to every row; these are lower-bound preflights, not permission to spend down to exactly the floor. At 4.7 GiB free, ten and forty may fit with a runtime floor monitor and owned stage cleanup; seventy-five and one hundred fifty already fail the measured-byte preflight. A simultaneous extra anchor across every pet adds `N × S`. Do not run stages cumulatively without accounting for retained prior-stage storage. A disk-limited early termination cannot certify a requested duration.
