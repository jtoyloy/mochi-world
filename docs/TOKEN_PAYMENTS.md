# Token payments

GameCurrencyService is implemented by TokenService. GET /api/token/balance returns raw and
formatted balance/mint/decimals/network/mock mode. POST /api/token/intent accepts item/shop
or listing plus bounded quantity; price/recipient/amount/lifetime are calculated on the server.
POST /api/token/verify takes intent ID and signature; /cancel releases an unpaid reservation.
Up to three pending checkouts are allowed per account.

Real verification requests getTransaction at finalized commitment. It requires successful meta,
matching signature, sender signer/authority, standard SPL transferChecked, exact mint/decimals/
amount, source and recipient owner annotations, matching token balance deltas, creation/expiry
block time and the exact `mochi:INTENT_ID` memo. Unique signatures and locked intent status
prevent replay. Wrong or unfinalized payments grant nothing. Explicit cancel/expiry releases stock.

NPC stock is escrowed at intent creation. Marketplace inventory remains in its original listing
escrow with one exclusive pending reservation. Concurrent fulfillment grants only once. Seller
payments in real mode go directly to the verified seller wallet; item delivery is centralized.
A canceled/expired intent can have a late finalized payment, requiring operator reconciliation;
there is no on-chain escrow/refund automation. Never claim atomic trustlessness.

Mint/network credentials are unset locally, so no mainnet/devnet funds were used. Production
needs wallet integration tests, reconciliation jobs, reviewed token policy and smart-contract
escrow/split-payment work before enabling live purchases at scale.
