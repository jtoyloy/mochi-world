# Gameplay release audit — 2026-10-06

Baseline: validated Wave 4 `99f31e15ab10a23e1985280d3508af3063f96b1a`.
Scope: inspected actual AdventureUI, shared adventure catalog, adventure server action/harvest handlers, world inventory/economy, Town guide, HTTP sessions and reward documentation. This is a focused source audit; it does not certify the whole economy, security or a completed browser player journey.

## Fixed frontend correctness findings

- **Equipment:** both head and body dropdowns previously offered both armor pieces. The server correctly rejected mismatched slots, but the UI suggested invalid actions and kept a rejected choice displayed. Lists now match the authoritative slot definition; a rejected save restores the last accepted selection and disables concurrent changes while saving.
- **Consumables:** only Small Potion was usable from the HUD. Mana Potion, Large Potion, Antidote and Combat Food had server effects but no Adventure pack use control. All owned catalog consumables now expose an authoritative use action and reload the pack after success.
- **Gathering lifecycle:** manual completion and cancellation left an automatic completion callback armed, causing later duplicate/conflicting requests and error feedback. One completion promise now owns each harvest, cancellation clears its timer, and successful completion cues/notices occur once.
- **Gathering recovery:** the pack exposed a pending saved harvest but required manually guessing when to finish it. Opening the pack now resumes its completion timer from `ready_at - serverTime`, preserving server authority and avoiding dependence on browser clock accuracy. The server still checks location, room instance, movement and expiry before granting inventory/XP.

## Remaining release gaps

- **Onboarding (high):** Pip supplies a paragraph; Adventure shows starter instructions and two quests. There is no ordered, stateful tutorial for adoption → dummy → first forest fight → gathering → sale → Trading Hall. New accounts must discover adoption separately through Mochis. Full first-player journey remains a required browser gate.
- **Progression (high):** resource buyers reserve token rewards, not the ordinary starter Coins balance; real token rewards can be paused. Verify and balance a meaningful renewable wallet-free equipment/supply progression loop rather than assuming resource sales finance shop upgrades.
- **Recovery/playtest (high):** source/tests support server-owned harvests and inventory persistence, but full browser reconnect/room-change/combat/gather/vendor journeys require new integrated evidence.
- **Security (release gate):** inspected POST origin protection, HttpOnly/SameSite sessions, server ownership/range checks and transaction locks. Full adversarial auth/session/WebSocket, wallet replay and reward-ledger review remains outstanding. No security certification is claimed.
- **Research/performance:** published battle competence and 150 CCU are not certified by this frontend work. No Cadence mechanism or pack was changed.

## Validation

`node --test tests/adventure/ui.test.mjs`: 6/6 pass. Tests exercise real UI handlers using a minimal DOM fixture and virtual timers: slot filtering/save rejection, item use, cancel-before-ready, manual/automatic completion race, saved-harvest readiness with repeated pack opening, and stale pack controls during a newer harvest. Stale Finish/Cancel controls refuse before dispatching any action, preserving the current activity timer.

`npm run build`: passed, including existing asset validation. Asset validation continues to report source-edge-continuation diagnostics; passing the command does not certify visual polish. Browser visual/playtest evidence is pending integration.
