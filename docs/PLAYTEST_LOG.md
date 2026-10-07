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
