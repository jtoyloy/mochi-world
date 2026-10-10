# Gameplay release audit — 2026-10-06

Baseline: validated Wave 4 `99f31e15ab10a23e1985280d3508af3063f96b1a`.
Scope: inspected actual AdventureUI, shared adventure catalog, adventure server action/harvest handlers, world inventory/economy, Town guide, HTTP sessions and reward documentation. This is a focused source audit; it does not certify the whole economy, security or a completed browser player journey.

## Fixed frontend correctness findings

- **Equipment:** both head and body dropdowns previously offered both armor pieces. The server correctly rejected mismatched slots, but the UI suggested invalid actions and kept a rejected choice displayed. Lists now match the authoritative slot definition; a rejected save restores the last accepted selection and disables concurrent changes while saving.
- **Consumables:** only Small Potion was usable from the HUD. Mana Potion, Large Potion, Antidote and Combat Food had server effects but no Adventure pack use control. All owned catalog consumables now expose an authoritative use action and reload the pack after success.
- **Gathering lifecycle:** manual completion and cancellation left an automatic completion callback armed, causing later duplicate/conflicting requests and error feedback. One completion promise now owns each harvest, cancellation clears its timer, and successful completion cues/notices occur once.
- **Gathering recovery:** the pack exposed a pending saved harvest but required manually guessing when to finish it. Opening the pack now resumes its completion timer from `ready_at - serverTime`, preserving server authority and avoiding dependence on browser clock accuracy. The server still checks location, room instance, movement and expiry before granting inventory/XP.

## Remaining release gaps

- **Onboarding (in progress):** the HUD now identifies the next first-journey step, and Adventure lists the ordered starter → active Mochi → dummy → forest win → wood → sale → Trading Hall path. Actual choose/travel controls open existing gameplay. Completion derives from persisted server facts, including dummy training progress and historical wood-sale records after payout; returning players with real victories bypass introductory dummy practice. No client grants rewards or records lesson completion. Paused token sale remains incomplete and visibly deferred while free exploration continues. Full first-player browser journey remains a required gate.
- **Progression (high, confirmed):** real shop UI uses token-payment intents; `/api/buy` ordinary Coins checkout is disabled except explicit legacy development tests. Daily/arcade rewards credit Coins and mirror to TEST token balances only in mock mode. Production resource sales require a verified wallet and funded reward treasury. Free starter/first-quest equipment is available, but renewable wallet-free supply/upgrade progression is not established. Proposed separate ordinary Coins resource sale and combat gear/supply market must preserve explicit SPL purchase/reward options; no real-token minting or currency replacement was introduced.
- **Recovery/playtest (high):** source/tests support server-owned harvests and inventory persistence, but full browser reconnect/room-change/combat/gather/vendor journeys require new integrated evidence.
- **Security (release gate):** inspected POST origin protection, HttpOnly/SameSite sessions, server ownership/range checks and transaction locks. Full adversarial auth/session/WebSocket, wallet replay and reward-ledger review remains outstanding. No security certification is claimed.
- **Research/performance:** published battle competence and 150 CCU are not certified by this frontend work. No Cadence mechanism or pack was changed.

## Validation

`node --test tests/adventure/ui.test.mjs`: 6/6 pass. Tests exercise real UI handlers using a minimal DOM fixture and virtual timers: slot filtering/save rejection, item use, cancel-before-ready, manual/automatic completion race, saved-harvest readiness with repeated pack opening, and stale pack controls during a newer harvest. Stale Finish/Cancel controls refuse before dispatching any action, preserving the current activity timer.

`npm run build`: passed, including existing asset validation. Asset validation continues to report source-edge-continuation diagnostics; passing the command does not certify visual polish. Browser visual/playtest evidence is pending integration.

## Onboarding milestone validation

Guidance model/UI: 11 tests pass. Native PostgreSQL historical sale test: 1 passes, zero skips; verifies actual sale, paid claim, persistent sale evidence, separate user and fishing isolation. Production build and asset validation pass. Authenticated Settings now provides an explicit sign-out-on-all-devices action through the server logout endpoint. Independent visual/source review passed with no critical/high findings after dynamic mob names, honest adventure-victory wording and narrow-HUD wrapping corrections. Integrated browser UX remains pending; dummy facts require service commit `519f63c`.

## Wallet-free commerce frontend milestone

Primary combat NPC interactions now open ordinary earned Coins shops; resource buyers open Coins sale panels. Separate explicit buttons open optional $MOCHI token markets/rewards. Labels, estimates and authoritative endpoints stay separate; no client converts Coins to tokens. Bram also exposes monster-material sales when its catalog includes a buyer. Purchase/sale retries retain the same receipt ID for the same payload after uncertain responses. Quantity controls validate owned/request limits before dispatch; the server remains authoritative.

The first-journey sale step now accepts historical successful Coins wood-sale receipts as well as historical token wood-sale records. Clearing claimable token balance cannot erase progress. Paused optional token rewards do not prevent the ordinary Coins buyer step.

Validation: 16 model/UI tests pass, zero skips; production build/asset validation passes. New frontend cases verify separate Coins endpoints, stable response retry receipts, owned quantity validation, explicit optional token paths, and persisted Coins sale progress with optional token treasury paused. Commerce server/endpoint integration and full browser buy→equip→fight→gather→sell→resupply remain required before declaring the loop polished.

Independent authentication review of the integrated parent patch: 11 native PostgreSQL/HTTP/WebSocket tests passed, zero skips. Malformed JSON password-fragment logging found in review was fixed with generic parser errors and verified by regression. No critical/high auth issue remains identified in this focused scope; broader whole-product security certification remains outstanding.

Independent commerce source review approved with no critical/high findings. The subsequently identified close/reload receipt gap is fixed by per-account sessionStorage recovery: exact endpoint/request/ID saved before dispatch, unresolved transactions block new commerce, and an explicit Retry reuses the saved owned receipt after reopening. A fresh server catalog verifies account identity before dispatch, and the exact request carries `expectedOwner` for the HTTP boundary to bind to the authenticated account. A cookie switch between GET and POST must refuse with 401 before any replay or mutation; its original receipt stays available for the owner. Network/server failures, authentication expiry, timeouts and throttling preserve the receipt; definitive rejection or success clears it. No credentials, wallet data or token balances enter this storage. Browser storage unavailability blocks checkout safely while exploration remains available.

Receipt recovery validation: 21 bounded in-memory model/UI tests pass, zero skips. New cases cover close/remount recovery, exact receipt replay, new-account isolation, stale-panel owner revalidation, definitive rejection and ambiguous errors. No database or native workers were started for this gate. Static source review of the separate commerce backend approves authority, finite positions, integer bounds, atomic inventory/Coins/receipt rollback, owned idempotent replay and currency separation; native PostgreSQL and integrated browser gates remain pending external disk headroom.

## Independent BK browser journey — 2026-10-10

Actual visible-UI acceptance on the owned restored synthetic server
`http://127.0.0.1:8788`, in a new named Chrome tab. This agent could not access the
parent's IAB browser; Chrome fallback was explicitly approved, and existing user
tabs and the parent's tab 3 were untouched. The journey began on `de54734` and
continued after an explicit reload on
`4565e40837a2f416b97dc21fc5212bcfa04adda1`. No direct database/API mutation,
hidden application-state access, account reset or grant bypass was used.

Synthetic account `bk_accept_1010` registered and adopted Birch BK. The returned
picker correctly showed the new companion, without recreating the stale
"first companion is waiting" prompt. All seven persisted beginner checkmarks
were observed: starter pack, active companion, Training Yard dummy, Forest
victory, first wood, Alder sale and Trading Hall. Dummy victory reported +0 XP;
the Dewdrop Slime victory reported +18 combat XP. Quest inventory/rewards were
then available through the ordinary Adventure pack.

The starter potion restored HP from 91 to 100 and reduced its count from three
to two. A Softwood Grove harvest produced one Softwood and completed the first
walk quest. Selling that wood raised Coins from 500 to 510; buying one Small
Potion from Sage reduced Coins to 490 and raised the post-quest potion count
from four to five. The separate optional TEST token display remained 500.
Quest-earned Reed Staff and Iron Ring were equipped, and Learn Ice Shard became
Ice Shard after consuming its scroll. Fishing produced one Common Minnow and
+12 XP; the five-fish quest remains honestly at 1/5.

Reload preserved all seven checkmarks, learned Ice Shard, equipped staff/ring,
five potions, one minnow and 490 Coins. Settings Sign out on all devices returned
to the login gate; real sign-in to the same synthetic account restored the same
guide, gear, spell and inventory. Screenshots and accessibility observations in
the computer-use transcript show complete guide and returning-player evidence.
The synthetic saved account remains. The agent-created Chrome tab is marked for
the subsequent reconnect/failure acceptance work; no user tabs are claimed.

Recorded operator errors: an initial dummy weapon skill was outside range and
was rejected; moving closer allowed practice to complete. A coordinate click
after the Forest camera moved accidentally opened the player's appearance
dialog; closing it resumed the fight, with no appearance mutation. Registration
began at 13:11:52 UTC and returning-player verification finished at 14:14:04 UTC;
this interrupted elapsed interval includes task/build changes and is not a
continuous game-completion or latency benchmark.

One nonblocking wording defect remains on this build: entering Alder's Coins
buyer displayed the old toast "Sell owned resources for funded, capped rewards."
The primary panel and successful transaction correctly use Coins, with token
rewards separate; the approach toast should match that separation. Merchant
approach sometimes requires a second click once nearby, consistent with the
resource approach instructions but less explicit for shops.

Saved screenshot evidence under ignored `runs/bk-browser-20261010/`:
`returning-seven-checks.jpg`, `returning-equipped-staff-ring.jpg` and
`before-restart-coins.jpg`. The buyer toast was subsequently corrected by the
parent in `b6e8aec`; this journey's screenshot/source evidence predates that fix.
The browser's documented capabilities expose viewport and page-assets controls,
with no offline/network interception control. No uncoordinated server stop was
attempted.

The parent then gracefully restarted the owned server with the same restored
database, checkpoint, authentication, mock-currency and one-worker environment.
Without reloading Chrome, the observed screenshot showed Online, Town Square,
two occupants and the still-open 490 Coins directory. This screenshot is saved
as `after-restart-no-reload.jpg`. The directory had been open before the restart,
so its balance alone is retained UI evidence, not proof of a fresh server read.
Before closing/reopening it to verify authoritative catalog, companion and gear,
the parent measured 2.8 GiB free against the mandatory 3 GiB safety floor and
stopped further gameplay. Reconnect acceptance therefore remains partial and
blocked by disk headroom. This was a graceful transport interruption, not a
forced worker crash; controlled death, stale-target and full-inventory failure
gates were not completed in this session. No extra purchase, sale, loot or token
transaction was performed after the restart.

This evidence closes the focused new-player/Coins loop and returning-player UI
journey gate. It does not certify funded SPL transactions, release-wide security,
all quests, mobile controls, battle competence, 150 CCU, scientific claims or
finished world art. Brain/session-expiry recovery was exercised separately by
the parent; this independent journey did not open a home-brain panel or run
native scientific assays. The server supplied its normal combat behavior.
