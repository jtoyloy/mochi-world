# Finite release-completion contract

Every section below is required. Each must reach PRODUCTION_READY with linked exact-candidate automated, integration and browser evidence where applicable. Required mechanics also meet all 17 mechanic dimensions in the owner brief; assets meet stylistic/crop/pivot/layer/timing/performance/browser dimensions. No section is passed on documentation alone. Deferred scope is explicit in PRODUCT_VISION.md.

## A. ACCOUNT / SESSION

Register/sign in without dev impersonation; persisted sessions expire/revoke; auth/CSRF/rate tests and returning-player browser journey pass.

Status: OPEN. Evidence: pending release verification.

## B. PLAYER MOVEMENT

Keyboard/pointer routes respect authority/collision; no hard snaps in recorded WAN movement; movement suite passes.

Status: OPEN. Evidence: pending release verification.

## C. CAMERA

Follow/zoom stay bounded through rooms; keyboard labels, resize and motion preferences pass browser checks.

Status: OPEN. Evidence: pending release verification.

## D. WORLD NAVIGATION

All required regions reachable with clear purposeful exits; room-change/reconnect race tests pass.

Status: OPEN. Evidence: pending release verification.

## E. MULTIPLAYER PRESENCE

150-player gate, correct identities/companions, departure cleanup and slow-client bounds pass.

Status: OPEN. Evidence: pending release verification.

## F. RECONNECT

State/identity restored without duplicate loot, claims or action credit after socket/server interruption.

Status: OPEN. Evidence: pending release verification.

## G. HUMAN AVATAR

Persistent appearance and coherent idle/move/action/death art with validated cosmetic alignment.

Status: OPEN. Evidence: pending release verification.

## H. MOCHI FOLLOWING

Both species follow/turn/catch up across obstacles, room transitions and reconnect; live browser evidence.

Status: OPEN. Evidence: pending release verification.

## I. MOCHI PERSISTENCE

Pack provenance, isolated checkpoints, GC and restart continuation verified without data loss.

Status: OPEN. Evidence: pending release verification.

## J. MOCHI PERSONALITY

Species/personality/relationships produce persistent readable differences; private speech boundaries tested.

Status: OPEN. Evidence: pending release verification.

## K. MOCHI COMBAT

Intent actually chosen by isolated brain; no fallback chooser; measured usefulness or honest documented product adjustment.

Status: OPEN. Evidence: pending release verification.

## L. PLAYER COMBAT

All four weapons auto-attack only valid targets/range; server damage/cooldowns; target/death/reconnect tests.

Status: OPEN. Evidence: pending release verification.

## M. MOB AI

All five core mobs deterministic IDLE/WANDER/CHASE/ATTACK/RETURN/DEAD with tested leash/drop/death transitions.

Status: OPEN. Evidence: pending release verification.

## N. SPELLS

Fire Bolt/Ice Shard/Heal/Shield/Lightning costs, range, cooldown, effect and readable feedback tested.

Status: OPEN. Evidence: pending release verification.

## O. EQUIPMENT

Weapon/head/body/two accessories persist; wrong slots/replayed equips rejected; cosmetics separated.

Status: OPEN. Evidence: pending release verification.

## P. INVENTORY

Accurate quantities/capacity/empty states and no negative/duplicated items under concurrent requests.

Status: OPEN. Evidence: pending release verification.

## Q. CONSUMABLES

Health/mana/antidote/food usable through UI with server effects/cooldowns; no consumption on invalid use.

Status: OPEN. Evidence: pending release verification.

## R. DEATH / RESPAWN

No actions/rewards from dead actors; clear recovery, tested penalty and consistent restored state.

Status: OPEN. Evidence: pending release verification.

## S. LOOT

One authoritative grant per kill with readable receipt and reconnect/race duplicate protection.

Status: OPEN. Evidence: pending release verification.

## T. XP / PROGRESSION

Measured first combat/upgrade pacing, difficulty tiers and useful resources/items; persistence tests.

Status: OPEN. Evidence: pending release verification.

## U. FISHING

Approach/start/animate/server completion/cancel/inventory/progression/sell/respawn/reconnect journey passes.

Status: OPEN. Evidence: pending release verification.

## V. WOODCUTTING

Approach/start/animate/server completion/cancel/inventory/progression/sell/respawn/reconnect journey passes.

Status: OPEN. Evidence: pending release verification.

## W. OTHER RELEASE GATHERING

No other profession promised; all visible additional resource affordances work or are removed.

Status: OPEN. Evidence: pending release verification.

## X. VENDORS

Each visible vendor has useful stock/service, proximity checks, prices and inventory error feedback.

Status: OPEN. Evidence: pending release verification.

## Y. SELLING

Authoritative quantities/prices, idempotent receipts and sell-gather upgrade journey pass.

Status: OPEN. Evidence: pending release verification.

## Z. TOWN

Recognizable social plaza/markets with accessible collision, readable NPCs and independent visual approval.

Status: OPEN. Evidence: pending release verification.

## AA. FOREST

Purposeful early combat/wood progression with complete mobs/nodes/art and no inaccessible bait.

Status: OPEN. Evidence: pending release verification.

## AB. LAKE/RIVERSIDE

Fishing progression/buyer/navigation/water boundaries and complete art approved.

Status: OPEN. Evidence: pending release verification.

## AC. RUINS

Meaningful harder encounter/reward milestone, accessible path and complete art approved.

Status: OPEN. Evidence: pending release verification.

## AD. TRAINING YARD

Safe dummy/tutorial steps give readable attack/Mochi practice and no farm exploit.

Status: OPEN. Evidence: pending release verification.

## AE. TRADING HALL

Clear social/player-market and paper-trading purposes; no ambiguous real-money AI claims.

Status: OPEN. Evidence: pending release verification.

## AF. SOCIAL / EMOTES

Preset phrases/emotes visible to intended room only, bounded/rate limited; reconnect/browser tests.

Status: OPEN. Evidence: pending release verification.

## AG. PROFILES

Correct public/private fields, owner/companion identity and accessible empty/loading/error states.

Status: OPEN. Evidence: pending release verification.

## AH. PLAYER TRADING

At least existing player-shop exchange works end-to-end atomically with stock/price/receipt concurrency tests.

Status: OPEN. Evidence: pending release verification.

## AI. MARKETPLACE

Listing/purchase/reservations/expiry and fees persist atomically; GMV distinguished from revenue.

Status: OPEN. Evidence: pending release verification.

## AJ. WALLET LINK

Separate optional signed nonce verifies ownership, wrong wallet/replay/expiry rejected; no private keys.

Status: OPEN. Evidence: pending release verification.

## AK. $MOCHI PURCHASE VALIDATION

Sender/mint/destination/base-unit amount/finality/signature uniqueness/expiry validated; grant once.

Status: OPEN. Evidence: pending release verification.

## AL. CLAIMABLE REWARD LEDGER

Backed liabilities/caps/eligibility/batches/replay tested; paused token rewards never block gameplay.

Status: OPEN. Evidence: pending release verification.

## AM. TREASURY ACCOUNTING

Revenue/GMV/liabilities reconciled; no application treasury signer; reviewed offline records only.

Status: OPEN. Evidence: pending release verification.

## AN. CADENCE TRADING ISOLATION

Paper only; separate state/rewards/checkpoints/settlement from battle; isolation tests pass.

Status: OPEN. Evidence: pending release verification.

## AO. CADENCE BATTLE EVIDENCE

Frozen controls/intervals/failed arms retained; no unsupported promotion; usefulness promise resolved.

Status: OPEN. Evidence: pending release verification.

## AP. UI / HUD

Readable health/mana/cooldowns/target/inventory/menu; no dead controls/placeholders/debug production UI.

Status: OPEN. Evidence: pending release verification.

## AQ. SETTINGS

Persistent volume/mute/motion/quality choices with keyboard labels and clear state.

Status: OPEN. Evidence: pending release verification.

## AR. RESPONSIVE UX

390×844/768×1024/1280×720/1920×1080 layouts inspected without overflow/hidden critical controls.

Status: OPEN. Evidence: pending release verification.

## AS. ACCESSIBILITY

Keyboard/focus/contrast/non-color cues/error announcements/motion sensitivity browser checks pass.

Status: OPEN. Evidence: pending release verification.

## AT. HUMAN ART

All release actions/directions/equipment states production approved; provisional entries block.

Status: OPEN. Evidence: pending release verification.

## AU. MOCHI ART

Both release species idle/move/attack/special/guard/hurt/exhaustion/social states approved.

Status: OPEN. Evidence: pending release verification.

## AV. MOB ART

All core mobs movement/attack/hurt/death states approved; static fallback does not pass.

Status: OPEN. Evidence: pending release verification.

## AW. WORLD ART

Every required region composed with readable boundaries/nodes/landmarks and coherent scale.

Status: OPEN. Evidence: pending release verification.

## AX. ANIMATION

Asset/animation tests plus pivots/contact/transitions/direction/cosmetic browser review pass.

Status: OPEN. Evidence: pending release verification.

## AY. VFX

Server-result-aligned readable spell/hit/gather effects bounded under crowd load and motion preference.

Status: OPEN. Evidence: pending release verification.

## AZ. AUDIO SCOPE

UI/combat/gather/spell/region/companion cues, volume/mute and silent fallback tested; music/voice post-release.

Status: OPEN. Evidence: pending release verification.

## BA. PERFORMANCE

Declared client/server/Adventure budgets in QUALITY_GATES pass on target hardware.

Status: OPEN. Evidence: pending release verification.

## BB. CCU

150 real mixed players pass ≥30-minute and ≥2-hour TLS/WAN/PostgreSQL/native-worker soaks.

Status: OPEN. Evidence: pending release verification.

## BC. STORAGE

Measured GC plateau, conservative capacity provision and unchanged ≥3GiB safety floor pass.

Status: OPEN. Evidence: pending release verification.

## BD. DB

Fresh/upgraded schema migrations, transactional integrity, bounded pool/locks and restore validated.

Status: OPEN. Evidence: pending release verification.

## BE. SECURITY

Independent auth/socket/economy/wallet/secret/dependency review has zero unresolved critical/high findings.

Status: OPEN. Evidence: pending release verification.

## BF. CI

Hosted candidate pipeline runs full PostgreSQL/native tests, asset/build/hygiene with zero skips.

Status: OPEN. Evidence: pending release verification.

## BG. OBSERVABILITY

Actionable room/socket/latency/worker/DB/storage/GC/economy/error metrics and alerts avoid sensitive logs.

Status: OPEN. Evidence: pending release verification.

## BH. DEPLOYMENT

Pinned reproducible build and documented TLS/migrations/volumes/workers/shutdown staging smoke pass.

Status: OPEN. Evidence: pending release verification.

## BI. BACKUP / RECOVERY

Owned test DB plus checkpoint backup restored and gameplay/brain continuation/replay verified.

Status: OPEN. Evidence: pending release verification.

## BJ. ONBOARDING

Town→guide/starter/Mochi→dummy→Forest fight→wood→sell→Trading Hall visible self-explanatory journey.

Status: OPEN. Evidence: pending release verification.

## BK. COMPLETE NEW-PLAYER PLAYTEST

Independent recorded first-account journey completes all onboarding steps without developer guidance.

Status: OPEN. Evidence: pending release verification.

## BL. COMPLETE RETURNING-PLAYER PLAYTEST

Login/appearance/equipment/inventory/Mochi/progression restored; no duplicate starter grants.

Status: OPEN. Evidence: pending release verification.

## BM. COMPLETE FAILURE / RECONNECT PLAYTEST

Network/server/worker interruptions, stale target/room/death and full inventory exercised end-to-end.

Status: OPEN. Evidence: pending release verification.

## BN. REPOSITORY HYGIENE

No secrets/checkpoints/test DB/raw dumps/caches; ignored local outputs and diff check pass.

Status: OPEN. Evidence: pending release verification.

## BO. DOCUMENTATION

All current renderer/pack/capacity/claims/setup statements agree with verified candidate evidence.

Status: OPEN. Evidence: pending release verification.

## BP. RELEASE CANDIDATE SMOKE

Exact candidate SHA, hosted CI, staging journeys and four independent final reviews pass with no blocking debt.

Status: OPEN. Evidence: pending release verification.
