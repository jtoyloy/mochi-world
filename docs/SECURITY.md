# Security and launch boundaries

Session-owned HTTP APIs retain same-origin checks, ownership checks, transactional account/
stock/listing locks and checkpoint CAS/leases. Socket upgrade requires a valid session and
matching Origin. Payload/rate/position/event validations prevent arbitrary room events and
public text. Private conversation defaults are enforced on server fan-out; generated text is
never HTML and the provider gets no tools, secrets or other-user private data.

Wallet ownership requires one-use signed challenge. Standard SPL payment verification checks
mint, decimals, raw integer amount, sender, recipient, memo, block time, success/finality and
balance deltas. Intent/signature uniqueness provides idempotency. No seed/private key custody,
autonomous real trading or web-server treasury execution exists.

Production gaps are explicit: account recovery/migration and secure proxy deployment validation, distributed
limits/presence, dialogue evaluation, browser checkpoint training provenance, bot-resistant
arcade, live-wallet test matrix, token payment reconciliation/refunds, treasury admin/multisig
review and object-storage retention. On-chain payments and database game items are centralized
and non-atomic. A late payment after expiry/cancel needs manual reconciliation; don't claim
trustless exchange or live production readiness. Legal/compliance review is required at launch.


## Adventure milestone — 2026-10-05

Adventure HTTP and WebSocket actions require an authenticated live actor and share a 150 ms action throttle. Targets, damage, loot, XP, resources, prices and reward amounts are server-owned. Gathering reservations and sale/claim treasury rows lock transactionally. Replay identifiers, immutable reward ledgers, exact receipt validation, currency pinning and backing checks guard token rewards. No signer keys or automatic real payouts are introduced. Multi-account collusion and sustained farming need operational monitoring beyond these controls.


## Account access follow-up

Password registration, salted scrypt credentials, hashed seven-day bearer sessions, secure production cookies, all-device revocation and socket admission/expiry are implemented. AUTH_REQUIRED exercises these locally without funds. Malformed credential JSON produces generic errors, not parser excerpts in logs. See [ACCOUNT_AUTH.md](ACCOUNT_AUTH.md) for limits, tests and remaining recovery/migration/proxy requirements. These controls do not certify production operations or wallet funding.
