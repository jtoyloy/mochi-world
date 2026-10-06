# One continuing Cadence brain
The original 0.74.0 pack is immutable. New pack `traders-0.74.0-v1` copies the trained
original pet parameters to matching original region/neuron edges, copies old outcome
and shown memory matrices into expanded matrices, and adds 30 senses plus 6 motors.
The new pack has 253 senses, 23 motors, 1,300 neurons and 415,232 synapses. One 512
association region and one working trace settle with everything else. No LLM.

Added sensory vector: six pet stats, three sets of six market features (four returns,
volume change, volatility), cash fraction, selected-position fraction, unrealized P&L
fraction, realized P&L fraction, drawdown and a trade-opportunity cue. Target asset's
features come first, followed by the remaining rotating assets. Shop unlocks zero
unavailable volume/quant features. All market/portfolio values are bounded; original
223 senses are unchanged. Missing live windows stay unavailable in the UI and become
neutral zeros for the network. Explicit missingness neurons are a next step.

Six added motors: HOLD, BUY_SMALL, BUY_MEDIUM, SELL_SMALL, SELL_MEDIUM, SELL_ALL.
The brain chooses the motor. The coordinator cycles the asset being observed; there
is no manual trading UI. Motor mapping is a declaration, not an external policy.
Market opportunities arouse the existing exploration lifecycle. The deterministic
risk controller can refuse a proposal, never replace it with an alternative trade.

Migration preserves durable parameters/memory, but clears transient working state,
optimizer history and pending reward because the graph changes size. Existing saved
original lives are preserved in the classic page; arbitrary original saved lives are
not silently migrated. New lives copy the same founder, then each worker/state/save
belongs to its own `?mochi=<id>` identity. Pack changes must use a new ID.

The trading outputs are untrained in the founder. A real 120-step free replay observed
one BUY_MEDIUM, zero refusals and ending mock value $10,123.25; this is one deterministic
sample, not proof of learned profit or preservation of all original behavioral scores.
The original pack remains the measured control. Offline `tools/bootstrap_trader.mjs`
is a disclosed optional demonstration experiment, never imported by the page and not
applied to the shipped founder. No inference-time teacher supplies trading answers.

Interval credit writes into the actual associative store with an observation/action
mask; current pet eligibility stays untouched. Tests pin continuation and ownership.
The retained brain viewer shows real activity and policy. The trade debug panel shows
raw/normalized observations, motor/action, reward, risk, pet and portfolio state.

## Browser-world ownership and hosting

The migration changes ownership and hosting, not the connectome mechanism. Published
brain packs stay immutable. Room decisions still settle all 253 inputs and 23 motors
inside one Brain.compose with the wide association region. Public game metadata is not
an answer path. Normal room ticks use the original arousal lifecycle; only actual
scheduled market opportunities arouse the trading lifecycle.

`BrainRepository` loads/saves file bytes, checks owner/pack/version and holds a two-minute
room lease, renewed every 30 seconds. The same PostgreSQL brain lock protects native
steps. Browser saves must match token and expected version. Client economy, awards,
public profile and portfolio proposals are ignored. A stale/expired lease stops saving;
the room reports it. A brain boot failure preserves the saved checkpoint rather than
silently hatching a replacement. Room navigation waits for its save and release.

One native host is reused sequentially across pets; each step boots the correct complete
Life and saves it back. Inactive brains are unloaded on the next boot. Failure for one
pet does not prevent the remaining pets from being scheduled. Actual storage keys never
leave the server. Filesystem storage implements `write/read`; production adapters can
use S3/R2 without changing the domain service.

Browser room state/checkpoints are owned-user uploads, so learned state can still be
modified by a sophisticated client. Economy/results remain server-authoritative, but
public prize-bearing competition requires signed training/checkpoint provenance or
server-hosted interaction. This MVP does not claim that tampering is impossible.

The current Phaser/socket/dialogue separation is documented in CADENCE_INTEGRATION.md.
Rendering and deterministic companion locomotion add no neural mechanism, new motor space
or financial decision clock. The original host/checkpoint/lease/trading contracts are retained.
