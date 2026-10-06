# Economy

$MOCHI is an actual configured standard SPL token. Real mode reads authoritative on-chain
balances via finalized RPC with a 30s cache; canonical amounts are bigint/string base units,
mint and decimals. It never uses users.coins as a real token balance.

Development uses a separate mock_token_balances/mock_token_ledger, explicitly labeled
TEST $MOCHI. Existing integer balances are imported once. Existing reward calculations
remain as test/game reward points; mock mode credits test tokens. Live rewards do not mint,
transfer or promise $MOCHI. The legacy Coin purchase HTTP endpoints are disabled in normal
runtime and enabled only by an explicit development test flag to preserve old contract tests.

Token intents determine item, price, quantity, sender, recipient and five-minute lifetime on the
server. NPC stock is reserved; marketplace listings have exclusive reservations. Fulfillment
locks accounts/intent/listing, enforces unique signature, and grants once. No client balances,
prices or portfolio results are authoritative. Existing care/daily/arcade protections stay.

Real P2P payments go directly to the seller's verified wallet. The backend owns centralized item
fulfillment; payment and game-item transfer are not trustless atomic settlement. Real marketplace
fees are disabled until split payments are supported. Mock fees exercise revenue accounting.
Treasury revenue excludes P2P gross volume and tracks only NPC receipts/actual fees.


## Adventure milestone — 2026-10-05

Resource sale rewards are small treasury-reserved accruals rather than client-minted token balances. See RESOURCE_ECONOMY.md and TOKEN_REWARDS.md. Development prices are test values; production balancing and cap approval remain necessary. Cosmetic and combat purchases continue through the existing owned inventory/shop and marketplace systems.
