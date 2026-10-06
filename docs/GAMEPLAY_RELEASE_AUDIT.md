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
