# Decision log

## 2026-10-06 — Autonomous program base

Git fetch confirms main/origin/main and Wave 4 integration at 99f31e1. Start integration from that clean tree; preserve all completed work. Use isolated specialist branches and coordinator ownership of shared entrypoints/schema/governance. Keep main stable until reviewed exact-SHA gates pass.

## 2026-10-06 — Finite release contract and honest status

Adopt all 68 owner-required PRODUCT_DONE sections and objective QUALITY_GATES. Current mechanisms are functional, not production ready. Preserve NO PROMOTION and 150 CCU NOT CERTIFIED. No candidate designated until evidence supports it. Do not silently lower targets or reclassify provisional art.

## 2026-10-06 — Priorities

Correct authoritative Adventure scheduling first, while independent gameplay UI and accessibility/visual audit proceed. Account authentication is a launch blocker the supervisor can solve locally. Per-room concurrency retains in-room motor order and global operation/shutdown/enemy barriers, pending tests/review.

## 2026-10-06 — Audio and deferred content

Release requires bounded UI/combat/gather/spell/ambient/companion feedback with mute/volume; music and voiced dialogue are post-release. Additional professions/guilds/auctions/free public text/3D prototypes remain deferred. This defines finite scope without excusing broken visible release affordances.

## 2026-10-06 — Capacity safety

Host has ~4GiB free versus documented ≥8.12GiB measured warm-run need and >26GiB conservative production checkpoint allowance. Keep ≥3GiB floor; small controlled tests can proceed, full certification requires suitable storage/hardware. Do not delete unrelated data or purchase resources autonomously.

## 2026-10-06 — Account access and session ownership

Use native salted scrypt password authentication independent of wallet linking; no external identity credential needed for the ordinary account loop. Never claim existing development usernames. Production Secure cookies require HTTPS. Hash stored bearer tokens; revalidate late socket admission and enforce expiry. Review found and fixed malformed-JSON password logging and pending-connect/logout races. Recovery/legacy migration remain explicit debt. Soft gameplay commerce will explicitly bypass mock token mirroring; it never grants SPL balances.

## 2026-10-06 — Resource interruption and review branch

The integrated JavaScript gate was interrupted when host free space fell to ~1GiB and swap usage reached ~7.9GiB. Stop owned heavy test/game/preview processes; keep the 3GiB floor and prior results. Use a draft integration PR for hosted exact-SHA validation, with main unchanged until its milestone gates and reviews pass. Do not mislabel the interrupted run or corrected-but-unrun commerce cases as passing.

## 2026-10-06 — Ordinary Coins and durable trade identity

Add separate ordinary Coins vendors/buyers so combat/gathering progression works without a wallet or funded token rewards. Atomic immutable receipts own each transaction. Persist ambiguous requests under their original account; bind every POST to expectedOwner at the authenticated HTTP boundary before replay or mutation. Freeze the legacy mock SPL baseline before soft Coins change. These changes require PostgreSQL and full browser acceptance before promotion.
