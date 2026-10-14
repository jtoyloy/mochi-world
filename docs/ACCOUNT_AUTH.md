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
mechanism. Six bounded gate tests cover refused-save retry, changed account,
failed identity refresh, concurrent recovery, login-gate retry and retained export.

Brain persistence reports authentication expiry to the outermost accessible
same-origin world, so nested panels do not stack login gates. Lease failure
pauses decisions while preserving the initialized worker; unavailable or failed
Save returns `false` and cannot authorize panel teardown. Same-account Save can
renew its lease or reacquire an expired lease only while the retained cloud
version matches. An intervening save, changed owner or ambiguous committed save
response refuses overwrite and keeps the local brain exportable. Failed release
also retains the room token and refuses teardown. Heartbeats restart only after
validated recovery; late results from older leases cannot pause or reopen the
recovered room. Snapshot/export holds the room still until an in-flight decision
and worker save finish, without changing decision or reward ownership.
Fifteen bounded persistence/save/snapshot tests exercise these contracts,
including a heartbeat pause arriving during confirmed save/cache completion;
that newer pause remains until validated recovery. No
native brain worker or database is spawned by those tests.

Owned local browser expiry drill at `654aeee`, 2026-10-10: initialized the restored
synthetic pet's real room, changed its name to `Expiry retained`, then expired only
that fixture's session and lease in the dedicated restore database. The outer
recovery gate appeared; DOM inspection confirmed the retained name and paused
brain. Export downloaded a life header with that name, the original
`traders-0.74.0-v1` pack and 9,461,945 brain bytes without dismissing the gate.
Signing back into the original synthetic account reacquired the same-version
lease, saved and returned to Town. The database confirmed version 13, retained
name and released lease. This is local supervisor acceptance; independent full
failure journey, production HTTPS and operational recovery gates remain open.

Hash API: [Node crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Account mechanism is deterministic game infrastructure and changes no Cadence pack or neural mechanism.
