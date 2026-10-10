# Account authentication — 2026-10-06

Password registration/sign-in is independent of optional wallet linking. Production (`DEV_MODE=false`) always requires an account; local `DEV_MODE=true AUTH_REQUIRED=true` exercises identical authentication with explicitly mock currency and HTTP-compatible development cookies. Ordinary development auto-account mode remains available only without AUTH_REQUIRED. Production cookies require HTTPS.

Registration is atomic under the account advisory lock, grants starter possessions once and rejects every existing username, including legacy development accounts. Stored credentials are salted scrypt-v1 (`N=32768,r=8,p=1`, 64-byte derivation); bearer cookies use 32 random bytes and only their SHA256 is stored. APIs whitelist public account fields. Sign-in failures share a generic response and perform equivalent hashing for absent/legacy accounts. Four concurrent derivations, per-IP/per-username ten-minute limits and a 10,000-entry bounded table constrain admission. Do not forward untrusted proxy IP headers; shared-proxy sizing remains an operations review item.

Cookies are HttpOnly, SameSite=Strict and Secure in production. Account actions require POST with exact same Origin. Auth request bodies are limited to4KiB; malformed JSON returns/logs a generic message without credential fragments. Logout revokes all sessions and evicts live presence; socket admission revalidates after avatar loading, revocation revisions reject stale database responses, and socket ticks/dispatch enforce persisted expiry. HTTP/socket ownership and all Wave4 action-credit protections remain.

Run `npm run db:migrate` before enabling the account flow. Migrating hashed bearer storage invalidates old sessions deliberately. Existing dev identities cannot be claimed through registration; owner migration/account recovery is still a release item. No email provider, production credential or public deployment was configured. Production coin/token configuration and HTTPS are separate gates; local mock-mode auth tests do not certify funded SPL operation.

Validation: native PostgreSQL credential/race/replay/expiry tests, actual required-auth HTTP APIs and WebSockets, deterministic delayed-revocation/late-connect tests. Independent visual/gameplay reviewers found and re-reviewed pending-connect/expiry and malformed-JSON logging defects before acceptance. The actual local browser registered a disposable new account and entered Town; returning-player/logout journey continues in integrated playtest.

Session expiry opens a separate modal sign-in gate without closing or replacing
an open brain panel. The original account must authenticate again, and a fresh
world identity check must match before the ordinary save/cleanup can run. A
different account leaves the retained state intact and cannot continue it. Save
failures remain visible with a retry action that does not repeat password login;
navigation stays blocked while recovery is open. Keep the page open until saving
succeeds: this retains live DOM/runtime state, not a new offline persistence
mechanism. Five bounded handler tests cover refused-save retry, changed account,
failed identity refresh, concurrent recovery and login-gate retry. Browser expiry
with a live brain panel remains an integrated validation gate.

Hash API: [Node crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Account mechanism is deterministic game infrastructure and changes no Cadence pack or neural mechanism.
