# Release-candidate playtest log

## Returning account and preference recovery — 2026-10-07

Environment: local server on `127.0.0.1:8787`, dedicated `mochi_autonomous_dev`
PostgreSQL database, mock token mode, rebuilt assets from the integration branch.
Account `release_playtester` is a synthetic local fixture; no real credentials or
funds were used.

Observed sequence:

1. Entered Town Square with the persisted account and companion HUD visible.
2. Set sound volume to `0.31` and enabled reduced decorative motion.
3. Reloaded the rebuilt bundle and observed reduced motion still `on` and volume
   still `0.31`.
4. Opened Settings, selected “Sign out on all devices,” and observed the account
   gate with Username/Password controls.
5. Signed back in as the same synthetic account and observed Town Square, the
   existing `500 TEST $MOCHI` balance, the same player identity, companion HUD,
   motion preference and volume restored.

This is direct browser evidence for account sign-out/sign-in and preference
persistence on the local candidate. It does not certify the complete new-player,
combat, gather, reconnect, responsive, WAN or production staging journeys.

After migrating the dedicated database with `server/world/migrate.mjs`, an
authenticated request to `/api/adventure/commerce` returned the same account,
`currency: "Coins"`, 500 starting Coins, inventory, four shops and two buyers.
The server log remained free of commerce relation errors during that check.

## Adoption handoff — 2026-10-10

Local mock environment as above; synthetic account `adoption_1010`.
The first new-player run exposed an empty companion picker that remained stale
after adoption. The repaired handler closes that picker before opening adoption
and reloads server-owned companions when the adoption panel closes.

Browser verification: opened the empty Mochis picker, selected “Adopt a Mochi,”
adopted the first available companion, closed adoption and observed a fresh
picker showing “Mochi · with you.” Selecting that companion closed the picker;
the first-journey panel recorded both pack and companion steps, then traveled to
the Training Yard. The handoff passed independent source review, including the
guard against reopening panels during world teardown. Four handler tests cover
the handoff and late refresh completion/rejection; the build passed.

The complete new-player journey remains open. The first Training Yard arrival
lacked an interactive dummy label; reconnecting and traveling again exposed it.
Targeting moved the body toward the dummy, but the original spawn ownership
check cancelled battle decisions and cleared the selected target. Fix `6a6e269`
looks up the spawn slot and checks the exact mob identity, so replacement mobs
cannot inherit an old encounter. Four actual-spawn tests and nine room-lane
tests pass. After restarting the owned local server, targeting the dummy reduced
its health and completed the practice step. The journey panel showed the first
three steps checked and advanced to the first forest fight. Initial delayed
labels remain unconfirmed; complete journey acceptance is still open.

The supervisor then followed the visible journey instructions through a forest
Slime fight (`+18 combat XP`, Slime Resin), Softwood approach and chop (`+12 XP`,
one Softwood), Alder's Coins buyer (`500 → 510 Coins`, wood removed), and Trading
Hall arrival. All seven journey steps were checked in the pack. Reload preserved
the completed guide, companion, loot and starter/progression inventory. No wallet
was connected. The Trading Hall HUD prompt initially stayed stale until opening
the pack; live progress publication was corrected in `536fcfb`. This completes the
supervisor's guided path, but BK's independent first-account acceptance remains
open. A local screenshot is retained in the session evidence, not as an art or
responsive certification.

### Resumed local recovery and guide acceptance — 2026-10-10

The restored fixture's guide initially reset to the starter step on a fresh live
frame because progress was published without starter/companion/sale history.
Fix `abda789` hydrates full guidance once; 15 focused UI/guide/live-progress checks
pass, and actual reload and room closure retain `First adventures complete`.

Recovery source `654aeee` passed independent concurrency review and 21 focused
gate/persistence/snapshot checks. A real initialized room retained the visible
`Expiry retained` change after the owned synthetic session and lease were expired
in the dedicated restore database. The top-level gate appeared without removing
the nested room. DOM inspection confirmed the retained name and paused status.
Export downloaded the original pack's 9,461,945 brain bytes and matching life
header while leaving the gate open. Original-account sign-in saved and returned
to Town; the database confirmed version 13, matching name and released lease.
Production HTTPS and independent full failure acceptance remain open.

At `de54734`, Forest visibly loaded Thornling's provisional painted action
body without a rectangular background. A live selected encounter completed
with `+50 combat XP`; the player reached 30/105 HP and Heal restored 64/105
while mana fell 60 → 42. This was not a continuous frame-by-frame attack/defeat
review: planted feet, loop quality and authored directions remain unaccepted.
Independent complete new-player and moving-art browser review agents were
assigned but stopped at an account usage limit before completing their reviews.
Neither acceptance is counted as passed.
