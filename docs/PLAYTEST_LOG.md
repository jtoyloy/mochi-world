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

### Fishing extension and offline review fixture — 2026-10-10

At `4eb699f`, the supervisor traveled through Map → Moonwater Lake, clicked
Moonwater Dock to approach, then clicked again to fish. The live HUD displayed
the fishing wait, followed by `Gathered Silver Carp · +20 XP`. The pack confirmed
one Silver Carp and fishing progress 1/5. Returning to Town and approaching Neri
opened the Coins buyer; selling the single carp raised Coins 510 → 535 and
removed accepted fish from the buyer inventory. No wallet was connected.

While the separate offline art viewer was open, the unattended Forest character
had died to live mobs: the returning game displayed the Town recovery notice
and full HP. Subsequent pack inspection retained the earlier Slime Resin, two
Thorn Fiber, equipment and supplies. This is an observed death/recovery sample,
not controlled acceptance of all death/reconnect edges.

The repaired offline fixture opened the real renderer and animation viewer.
Thornling walk and terminal defeat frame 7 rendered; all directions visibly reuse
or mirror the one authored view. Renderer remount reported previous resources
released, shared sheets reused, shared sources valid and two host canvases.
These are supervisor samples; independent visual and complete-player reviews
remain open. Hosted workflow 46 at exact `4eb699fa9911a9cbcaed5239c8db3aa60be9f769`
passed 377 JavaScript and 49 Python tests, zero skips, build/audit/diff checks.

Reload retained fishing progress 1/5, removed the sold Carp, preserved all seven
guide steps and showed 535 Coins in the shops. The earned iron ring equipped in
accessory1; attempting it in accessory2 was rejected and restored the empty slot.
Reload preserved that equipment. Learning the earned Ice Shard consumed its scroll
and persisted the spell, but the original pack left its old Learn button visible.
Fix `6039947` refreshes the pack after confirmed learning, guards duplicate clicks
and preserves a rejected scroll/control. Seventeen focused UI/guide/progress checks
pass; independent review and latest exact-SHA hosted validation remain pending.

The first learning-refresh patch `6039947` passed workflow 48 (379 JavaScript,
49 Python, zero skips) but failed live learning: its guard checked the button's
disabled property after the shared wrapper disabled it. No Shield scroll was
consumed. The correction uses a separate pending flag; the two spell tests now
exercise the wrapper's real disable-before-handler contract. Seventeen focused
checks pass. Actual purchased Shield (220 Coins, 535 → 315) then learned through
the corrected handler, refreshed immediately to a usable Shield button and
removed the scroll. The earlier passing CI is not acceptance of the faulty patch.

Mouse activation of Mage Atelier opened the companion panel twice. DOM hit testing
at the building button's center confirmed the overlapping `iso-character-name`
for `Expiry retained`. Keyboard activation opened Iris's Town resident panel and
its shop correctly. A focused CSS priority change for interactive place/road
buttons is being checked; decorative road captions no longer capture pointer
events. General label spacing and crowded-world readability remain open.

After reloading the CSS fix, the same Mage Atelier button's center hit itself
(`z-index: 2`), and an ordinary mouse click opened Iris's Town resident panel.
The focused obstruction is repaired locally; crowded-label and independent
acceptance remain open.
