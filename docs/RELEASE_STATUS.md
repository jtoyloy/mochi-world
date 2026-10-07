# Autonomous release status

Updated 2026-10-06. PRODUCT COMPLETE: NO. Ready for production launch: NO. Ready for full staging acceptance: NO (local/test validation permitted).

Validated base/main/origin/main: 99f31e15ab10a23e1985280d3508af3063f96b1a. Current integration branch: codex/autonomous-release. Release candidate: not designated. Current main already includes Wave 4; nothing was discarded. Main remains unchanged pending independent milestone review and exact-SHA gates.

| Subsystem | Status | Evidence / next action |
| --- | --- | --- |
| Account/session | IN_PROGRESS | Salted scrypt, hashed sessions, revocation/expiry and account UI implemented; later 401s now reopen the account gate; 11 targeted tests passed; returning/expiry browser acceptance open |
| Player combat/mobs/spells/equipment/inventory | FUNCTIONAL | Equipment rollback/slots and all consumables repaired; handler checks pass; complete live journeys open |
| Fishing/woodcutting/vendors/progression | FUNCTIONAL | Stale gather controls repaired; ordered server-backed guide and Coins vendors implemented; native commerce and live progression gates pending |
| Movement/presence/reconnect | FUNCTIONAL | 42 movement tests historically; sustained capacity/WAN open |
| Mochi persistence/personality/follow | FUNCTIONAL | Pack and checkpoint controls; full candidate playtest open |
| Cadence battle | IN_PROGRESS | NO PROMOTION; measured context discrimination weak |
| Cadence trading | FUNCTIONAL | PAPER only, separate persistent domain |
| Adventure performance | IN_PROGRESS | Room lanes integrated; matched 25-actor motor p95 272–364ms versus 741–752ms baseline; 50/100/150 and sustained gates pending |
| Wallet/economy | FUNCTIONAL | Test verification/ledger; real production reconciliation and review open |
| Art/animation/world/UI | IN_PROGRESS | Shared texture teardown fixed and browser remount verified; foliage candidate remains provisional; directions/mobs/cosmetics open |
| Audio/accessibility/responsive | IN_PROGRESS | Reduced decorative motion and named map/zoom controls implemented; complete persistent settings/audio/accessibility open |
| 150 CCU/storage capacity | BLOCKED | Local full gate interrupted at ~1GiB free with swap pressure; ≥3GiB floor; NOT CERTIFIED |
| Security/CI/observability/backup/deployment | IN_PROGRESS | Hosted workflow 34 passes; checksum backup/verification tooling exists; owned staging restore, alerts and deployment smoke remain |

Supervisor maintains PRODUCT_DONE, QUALITY_GATES, ROADMAP and KNOWN_DEBT. Specialists use isolated branches/worktrees at the exact validated base. On return inspect patches/tests/methodology, then independent review before integration. Existing failed evidence and pack bytes remain protected. No public deployment or real-money action authorized.

## Current integration evidence and limitations

Baseline `99f31e1`: JavaScript 262 passed, Python 49 passed, zero skips. Integrated authentication tests: 11 passed; Python 49 passed and build passed before the last commerce/foliage followups. Small actual-handler, animation ownership and crop tests passed on their reported sources. Independent specialists reviewed authentication, scheduling, gather controls, texture ownership and commerce retries; their scope does not constitute final product/security review.

The later full integrated JavaScript run was interrupted, not passed: free disk fell through the 3GiB safety floor to ~1GiB while concurrent tests, local game and browser increased swap pressure. Owned test/game/preview processes were stopped and an abandoned schema in the dedicated test database was cleaned up. No unrelated files or operating-system swap were deleted. Hosted workflow run 34 for exact SHA `68c3f83fc1c2614bba1209682aac960abb7b90b8` passed build, full JavaScript/PostgreSQL tests, all 49 brain tests, audit and diff hygiene after the checkout was changed to fetch full history for pack provenance. No 150-player certification, full browser journey, production art approval or Cadence promotion is claimed.
