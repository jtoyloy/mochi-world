# Ordinary Coins adventure commerce

Basic adventure progression has a separate ordinary Coins path. Town buyers pay
Coins for owned gathered resources and combat materials, and Town suppliers sell
potions, gear, advanced spells and gathering tools for Coins. These trades do not
quote SPL units, reserve funded rewards, require wallets, create token payments,
allocate platform revenue or touch a treasury. Existing explicitly selected SPL
purchases/resource rewards retain their existing accounting and fee rules.

## Server contract and integration

`AdventureCommerce` exposes `catalog(userId)`, `buy(userId,input,actor)` and
`sell(userId,input,actor)`. Mount GET `/api/adventure/commerce`, POST `/buy` and
POST `/sell` through the existing authenticated session and global Adventure queue.
Pass `isActorLive: p => multiplayer.store.players.get(p.userId) === p` to the
constructor. Apply `server/adventure/commerce-schema.sql` in the migration path.

Buying takes `{id,vendor,itemId,quantity}`; selling takes `{id,vendor,items}`. Prices
come exclusively from `web/js/game/commerce.js`. Town, actor ownership, finite
coordinates, connection identity and 130-unit vendor range are checked before and
during mutation. Consumables allow 1–50 per request, other goods one, resource
sales 1–999 of each accepted item. There is no rotating scarcity for essentials.

A per-user advisory transaction lock owns Coins, inventory, currency ledger,
event and receipt commits together. A receipt ID accepts only its original
normalized request; an identical retry returns the stored result without another
trade, including after departure when no live body remains. The replay path only
reads the authenticated owner's receipt and permits no new mutation. User-scoped receipt keys prevent one account from replaying another account's
trade. Failed quantities, funds, inventory, position or downstream writes roll back
the entire transaction. Receipt history forbids update and delete. `woodSales`
counts committed ordinary Coins wood sale receipts, which onboarding may use as
completion evidence alongside separate SPL history without adding currencies.

`WorldService.coins` needs an eighth `{mirrorMockTokens:true}` option, with existing
callers unchanged. Commerce passes `false`. When mock mode is enabled, an absent
compatibility balance must be seeded from the **pre-trade** Coins balance before
the soft Coin delta, so `TokenService.balance` cannot later turn newly earned Coins
into test SPL through its legacy lazy initialization. No soft trade adds a mock
SPL ledger credit or changes an existing mock SPL balance. This method patch is
owned by the integration supervisor and excluded from the commerce module commit.

## Initial pacing

Coins valuations preserve the relative gathered-resource values: softwood/minnow
10, hardwood 22, carp 25, bark 40, moonfish 45, koi 70. Bram buys combat materials
for 8–80 Coins. A Small Potion costs 20, Mana Potion 24, Large Potion 40; gathering
tools 50–60, gear 80–220 and advanced spells 180–360. Fire Bolt and Heal remain
free starter knowledge. The existing 500 starter Coins remain available.

Two softwood grants finance one Small Potion. The actual harvest fixture exercises
two 3.5-second harvests separated by the existing 15-second node cooldown: 22 seconds
from initial harvest submission to the second completion, excluding travel and
contention. Fishing's original probabilities imply 15.125 Coins expected gross
per dock catch; this is a catalog arithmetic expectation, not measured sustained
player income. No conversion rate or value guarantee is implied for tokens.

These are a modest initial gameplay balance, requiring integrated travel/combat
playtests and longer progression balancing. They do not establish bot resistance,
long-term economic stability, browser acceptance or production token safety.

## Validation status

Ten small PostgreSQL cases cover real-token mode with paused rewards/no wallet,
identical/canonical retries, concurrent duplicate and competing trades, vendor
proximity/ownership/nonfinite inputs, quantities/items, rollback, receipt ownership
and immutability, mock SPL lazy initialization isolation, and the actual harvest →
Coins sale → replacement potion loop. Source syntax and `git diff --check` pass.

The initial test attempt failed in fixture setup because generated usernames
exceeded the existing 24-character account limit; this was corrected. The run did
not exercise trades. The corrected PostgreSQL run is pending because host free
disk is below the existing 3 GiB floor after an independently interrupted release
gate. No native brain processes or capacity benchmark are part of these tests.
