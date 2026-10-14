# Autonomous release status

Updated 2026-10-13. PRODUCT COMPLETE: NO. Ready for production launch: NO. Ready for full staging acceptance: NO (local/test validation permitted).

Validated base/main/origin/main: 99f31e15ab10a23e1985280d3508af3063f96b1a. Current integration branch: codex/autonomous-release. Release candidate: not designated. Current main already includes Wave 4; nothing was discarded. Main remains unchanged pending independent milestone review and exact-SHA gates.

| Subsystem | Status | Evidence / next action |
| --- | --- | --- |
| Account/session | IN_PROGRESS | Salted scrypt, hashed sessions and revocation implemented; retained-room recovery passed 21 focused checks, independent source review and supervisor real-brain expiry/export/sign-in/save drill. Full returning/failure and production HTTPS acceptance open |
| Player combat/mobs/spells/equipment/inventory | FUNCTIONAL | Equipment rollback/slots and all consumables repaired; handler checks pass; complete live journeys open |
| Fishing/woodcutting/vendors/progression | FUNCTIONAL | Stale gather controls repaired; ordered server-backed guide and Coins vendors implemented; native commerce and live progression gates pending |
| Movement/presence/reconnect | FUNCTIONAL | 42 movement tests historically; sustained capacity/WAN open |
| Mochi persistence/personality/follow | FUNCTIONAL | Pack and checkpoint controls; full candidate playtest open |
| Cadence battle | IN_PROGRESS | NO PROMOTION; measured context discrimination weak |
| Cadence trading | FUNCTIONAL | PAPER only, separate persistent domain |
| Adventure performance | IN_PROGRESS | Room lanes integrated; matched 25-actor motor p95 272–364ms versus 741–752ms baseline; 50/100/150 and sustained gates pending |
| Wallet/economy | FUNCTIONAL | Test verification/ledger; real production reconciliation and review open |
| Art/animation/world/UI | IN_PROGRESS | Shared texture teardown and remount verified; foliage and new 40-cell Thornling action atlas provisional. Thornling loaded in Forest; continuous motion/directions/mobs/cosmetics acceptance open |
| Audio/accessibility/responsive | IN_PROGRESS | Reduced decorative motion and named map/zoom controls implemented; complete persistent settings/audio/accessibility open |
| 150 CCU/storage capacity | BLOCKED | Local full gate interrupted at ~1GiB free with swap pressure; ≥3GiB floor; NOT CERTIFIED |
| Security/CI/observability/backup/deployment | IN_PROGRESS | Hosted workflow66 passed:402 JavaScript,49 Python,zero skips plus7 functional Chromium tests/build/audit/diff. Private backup and owned local restore/restart passed; staging, offsite recovery, alerts and deployment smoke remain |

Supervisor maintains PRODUCT_DONE, QUALITY_GATES, ROADMAP and KNOWN_DEBT. Specialists use isolated branches/worktrees at the exact validated base. On return inspect patches/tests/methodology, then independent review before integration. Existing failed evidence and pack bytes remain protected. No public deployment or real-money action authorized.

## Current continuation

Hosted workflow 40 passed at `af27dea13d5cde6b4fcef1ceb56705aa27ccf96b`.
Adoption handoff fix `8b22753` passed independent source review, four actual
handler tests and browser verification on a synthetic local account; build passed.
The full new-player journey remains open: Training Yard combat exposed a spawn
identity ownership mismatch, fixed in `6a6e269`; four actual-spawn and nine
room-lane tests pass, and browser practice completion is verified. The supervisor
then completed all seven guided steps and verified persistence after reload;
independent BK acceptance remains open. Live progress publication fix `536fcfb`
passes a same-tick Trading Hall regression. Backup hardening `eebb0ee` passes
seven fixture tests; its first actual attempt failed because pg_dump interpreted
the URI in PGDATABASE as a literal database name. The incomplete private copy is
retained. Correction `917ad1b` passes nine tests, and the quiescent actual retry
verified seven checkpoint files and a 257097-byte PostgreSQL custom dump.
Guarded restore `de69d4e` passed 20 focused backup/restore tests. Actual owned
local restore, migration, one-worker login/brain load-save, offline Coins replay
and graceful restart passed at `7fd4838`; source backup re-verification passed.
Initial retained-room reauthentication fix `7fd4838` passed five handler checks;
the deeper paused-room save/lease repair `654aeee` passed independent source
review and 21 focused checks, including a newer heartbeat pause during save.
The supervisor's actual initialized-room expiry, retained export, original-account
sign-in, confirmed version-13 save and lease release passed. Guide hydration
regression `abda789` passed 15 focused checks and actual reload/room-close acceptance.
Thornling candidate `de54734` passed registration/Pixi ownership checks and build;
its live Forest body loaded and combat completed, with motion/direction acceptance
still open. Hosted workflow 42 passed for exact code SHA
`de5473441128e18327976994fcebd74c8f5011ee`: 377 JavaScript tests, 49 Python tests,
zero skips, build, dependency audit (zero reported vulnerabilities) and diff checks.
Independent first-account and moving-art browser review agents stopped at an
account usage limit before completing acceptance; neither is counted as passed.
Production operations gates remain open.
Main has not advanced.

Subsequent code gate: workflow 46 passed exact
`4eb699fa9911a9cbcaed5239c8db3aa60be9f769` (377 JavaScript, 49 Python, zero skips,
build/audit/diff). That fix makes offline visual/benchmark fixtures use the shipped
renderer bundle. Actual viewer opening and remount passed; direction reuse remains
provisional. Supervisor fishing extended the local journey through Silver Carp
reward and Neri's wallet-free sale (510 → 535 Coins). See PLAYTEST_LOG for scope;
none of these samples closes independent full-player or production acceptance.

Latest gameplay fix `6039947`: confirmed spell learning now refreshes consumed
scroll inventory and learned controls. Seventeen focused UI/guide/progress checks
pass. Original learned Ice Shard and single-slot ring state persisted on actual
reload. Live learning found a disable-before-handler wrapper conflict in
`6039947` despite green workflow 48 (379 JavaScript, 49 Python). The corrected
pending-state guard passed 17 focused checks and actual purchased Shield
learning/pack refresh; the correction's hosted gate and independent review remain
pending. World label hit testing also found the companion name intercepting Mage
Atelier mouse clicks; R12 records the focused pointer-priority repair and broader
layout gap.

Corrected wrapped learning/pointer priority code `9230403` passed hosted workflow
50; previous faulty learning attempt remains documented. Subsequent local phone
audit found the emote panel covering guide controls at 375×812. Measured overlay
height stacking passed 14 focused geometry/UI checks, build, actual clear guide
hit targets at 375×812 and 320×740, and narrow-phone guide activation. Phone
viewport override was reset. Hosted workflow 52 passed exact
`4565e40837a2f416b97dc21fc5212bcfa04adda1`: 381 JavaScript, 49 Python, zero skips,
build, audit (zero reported vulnerabilities) and diff checks. Independent source
review passed the learning guard, pointer priority and observer lifecycle with 19
focused checks. It found remaining camera/minimap overlap at 320px and the
width-only layout skipping short landscape screens; those repairs are in progress.
The restarted independent new-player browser review completed all seven guide
steps on that source and is extending purchase, fishing and persistence checks.
Physical-device/full responsive and final release acceptance remain open.

Independent Chrome acceptance completed the focused seven-step new-player loop,
Coins sale/potion purchase, learned Ice Shard, staff/ring equip, minnow fishing,
reload and actual logout/sign-in persistence on `4565e40`; see
GAMEPLAY_RELEASE_AUDIT.md. Compact repair `1bae014` passed independent source
review and 19 focused checks. Root actual 320px camera/emote dialogs retained their
actions, Escape returned focus to Camera/Settings, 768px tablet and 844×390
landscape bands separated, and resizing an open camera dialog to desktop restored
the original nodes. An old forced canvas display rule initially defeated minimap
hiding; narrowed selector passed independent review and actual hidden/visible
dialog map checks. General legacy-modal focus and physical-device acceptance remain.

During the coordinated owned-server reconnect extension, free disk fell to 2.8GiB,
below the 3GiB floor. Owned 8788 server and root test browser were stopped; no
unrelated files or system swap were deleted. The independent browser observed
Online/Town and its existing 490 Coins panel after restart without reload, but
fresh catalog/gear verification was incomplete when safety stopped the drill.
This is partial BM evidence, not full reconnect acceptance. Heavy local runs stay
paused pending safe headroom; source review and hosted gates may continue.

Thornling presentation repair `d97ebe9` passed independent source review, 25
focused animation/Pixi checks and build before the safety stop. Another 900
playback comparisons preserved Slime/Boar/Guardian controls. Independent loaded
viewer checks confirmed the defeat ground anchor, contact-slot annotation and
brief blink timing. The PNG is unchanged; walking drift and missing authored
directions still block art approval. These repairs do not change server combat.

Hosted workflow 56 passed exact `419f12199c12758950e9b436c288ae7697cdd128`:
388 JavaScript, 49 Python, zero skips, build, audit (zero vulnerabilities) and diff
checks. Subsequent focus propagation `342133c` passed independent source review
and 31 focused DOM checks. It retains outer launchers across async pack/shop/adoption
replacement and genuine parent controls for nested React/domain panels. Refused
save still retains its modal/runtime. Its hosted gate and actual React/browser
acceptance remain pending; no local heavy build was run below the safety floor.

Hosted workflow 58 subsequently passed exact
`342133c5a1f081a4d431bef64f8e611260db8bce`: 391 JavaScript, 49 Python, zero skips,
build, dependency audit (zero vulnerabilities) and diff checks. Thus the React
bundle builds; actual focus verification for those broader paths still awaits
safe headroom. The next source-only AQ audit found active Pixi quality choices
missing (legacy 3D settings do not count), no explicit mute restoration, and
unguarded preference storage reads/writes. Small guarded preference controls are
being implemented with the existing Standard renderer as their control.

2026-10-13 resume: no prior specialist handles remained live. Disk was 767MiB free
on inspection (later 1.5GiB), still below the unchanged 3GiB safety floor; owned
8788 listener is absent. No local browser/server/native/build run was restarted.
Source-only settings continuation retains Standard DPR≤2/display refresh and adds
Low power DPR1/30FPS, guarded motion/quality storage, explicit mute with retained
volume, and readable persistence failures. Existing volume range remains 0–0.5.
Fourteen tiny preference/audio/overlay checks pass. Independent source/API review
approved the patch and separately passed the ten audio/preference checks.
Build, actual control visibility/interaction, live resizing, reload and wider
responsive acceptance of these new controls remain pending. Low power is a user
choice, not a relaxation of the Standard performance or capacity gates.

Settings also exposes a named Sound, motion & graphics shortcut to the existing
live control nodes. Desktop modal widths are excluded from the world's cached
edge-control measurements, preventing a false compact-layout transition. Eight
overlay/focus checks pass, including a wider-modal/narrower-world regression;
independent source review approved the shortcut, nested focus target and layout
cache guard. Actual nested-modal and WebGL browser verification remains pending.

Hosted workflow 60 passed settings source
`f2a3e847badcf85e4b07c1244a05a7577adb91ea`: 401 JavaScript, 49 Python, zero skips,
build, audit (zero vulnerabilities), diff. Workflow 62 passed Settings shortcut
source `ba791e423a47ef842b6cb1c8c19c713de474f05e`: 402 JavaScript, 49 Python,
zero skips, build, audit (zero vulnerabilities), diff. A hosted browser smoke is being
prepared to verify functional controls without restarting unsafe local work.
It will not replace physical-device, sustained performance, WAN or final staging
acceptance. Playwright is pinned as a development dependency; browser downloads
and execution are confined to the hosted runner during this safety interruption.

Hosted workflow64 at `7e7eb2466396c1d220341749b287043c1c081af4` passed build,
402 JavaScript/49 Python tests with zero skips, audit and diff checks, then failed
the new browser gate: one preferences test passed, four viewport tests failed,
and two did not run before the unchanged five-minute suite timeout. The passing
test verified real Standard2×→Low1×→reload→Standard2× canvas density, preserved
logical viewport, motion/mute retention, restored volume and nested Settings focus.
This is scoped hosted functional evidence, not full AQ/AR acceptance.

All four failed viewport cases reached the post-disclosure resize to1920×1080
before failing. Independent trace reviews found 3–4× slower trial clicks and
roughly1–4-second frame intervals at DPR2 software rendering, with no recorded
pointer interception. The768 overflow predicate recorded only false, so its
actual failing dimension is unknown. Artifact11859286017/digest
`a31b1846b055371b36e4e5ef86cd4e9208f77b282609a107ba5cb908d4ee204c`
and a private local ZIP preserve failure evidence. The next harness revision
keeps all seven cases, time limits, overflow/hit/actionability checks and the DPR2
preferences test; viewport cases use DPR1 and expose offending dimensions.
No application layout change is justified until those measurements resolve it.

Diagnostic workflow66 passed exact `7a88cdd7ebc88232903d77184de410ed8eb2f03c`:
402 JavaScript,49 Python,zero skips and all seven browser tests in2.4minutes,
with build/audit/diff checks. Its scope is DPR1 functional layouts at the six
declared viewports plus DPR2 settings/density/persistence/focus. Run64 remains a
failed DPR2 software-rendering sample, not a client performance pass. Physical
devices, sustained scenes, React panels and complete failure/social journeys remain.

Source review then found a separate notice-expiry defect: Game.showNotice removes
the toast class after5seconds but retains its text, unlike the page notice helper.
That can move expired text into normal document flow. A real Talk-without-companion
notice expiry regression is being verified before the app fix; no layout gate is
weakened to accept remaining text.

## Current integration evidence and limitations

Baseline `99f31e1`: JavaScript 262 passed, Python 49 passed, zero skips. Integrated authentication tests: 11 passed; Python 49 passed and build passed before the last commerce/foliage followups. Small actual-handler, animation ownership and crop tests passed on their reported sources. Independent specialists reviewed authentication, scheduling, gather controls, texture ownership and commerce retries; their scope does not constitute final product/security review.

The later full integrated JavaScript run was interrupted, not passed: free disk fell through the 3GiB safety floor to ~1GiB while concurrent tests, local game and browser increased swap pressure. Owned test/game/preview processes were stopped and an abandoned schema in the dedicated test database was cleaned up. No unrelated files or operating-system swap were deleted. Hosted workflow run 34 for exact SHA `68c3f83fc1c2614bba1209682aac960abb7b90b8` passed build, full JavaScript/PostgreSQL tests, all 49 brain tests, audit and diff hygiene after the checkout was changed to fetch full history for pack provenance. No 150-player certification, full browser journey, production art approval or Cadence promotion is claimed.

2026-10-13 notice regression: workflow68 failed at exact
`4d76a1dc88e84a370942cc73a6fff48885288407`, with six browser cases passing and
only the new1280×720 toast expiry assertion failing. Logs confirm class removal
while text remains. All402 JavaScript/49 Python tests, build, audit and diff checks
passed. The one-line text-clear correction has independent source approval;
exact-source hosted verification is pending. Failed run/artifact are retained in
BROWSER_SMOKE.md.

Local headroom subsequently recovered to3.8GiB (3.7GiB after one build and one
owned server/browser). The supervisor completed the interrupted graceful restart
subcase without page reload: fresh gear/spell/inventory/guide/315Coins requests
matched before/after, with the same companion. PLAYTEST_LOG records the scope.
The3GiB floor remains unchanged; no capacity certification or full BM closure.

Death/respawn audit measured a separate old-room race: with two enemies, defeat
restored the player in Town, then a later old-room enemy damaged that restored
body (100→93) and the emptied room attempted a frame from the departed viewer.
The correction checks live room/global body identity during enemy selection and
after awaited state reads, then broadcasts using a remaining live viewer.
Six regressions cover restored HP/target protection, empty/remaining room frames,
remaining-player valid damage and identity replacement across both await paths.
Two specialists reviewed the source and independently passed23 focused checks,
zero skips. Exact-source full hosted verification and actual corrected-runtime
defeat remain pending; no Cadence mechanism or published pack changes.

Workflow72 at `a42310cae99a38858485d26e2c078624f55fa518` passed build but failed
JavaScript407/408: the existing integrated chase/return fixture lacks body room
metadata and its global players map is empty, so the live-boundary guard refuses
it. This failed full gate is preserved; correction must establish realistic
membership while retaining the original CHASE/RETURN assertions. Later checks
were skipped and no full success is claimed. An actual corrected-runtime Forest
defeat separately recovered Town/full vitals with fresh unchanged pack/315Coins;
PLAYTEST_LOG records ordinary-path scope.

The chase fixture now registers the same body in global/room maps with room
metadata, supplies real owner-lane state, and removes membership on departure.
Original CHASE/x410 and RETURN/x490 assertions remain. Independent review approved
and30 focused tests pass with zero skips; the live boundary guard is unchanged.

Inventory boundary continuation: a real PostgreSQL max-stack purchase initially
failed the readable-error expectation. Guarded atomic UPSERT now returns409
“item stack is full” while preserving transaction rollback. The11-test commerce
suite passes independently in a disposable schema, including failed retry with
unchanged Coins/items/ledger/receipts/events, then same request success after
consuming one item and idempotent replay. No bag-slot limit was added. Full hosted
source verification and UI failure acceptance remain pending.
