# Action art cleanup audit — 2026-10-06

Base: `925cdbec4399b249bbf1872a26edfaad217d2547`. Source-sheet visual review,
registered-frame pixel scans and the actual animation viewer informed this pass.
`node tools/audit-actions.mjs` regenerates the per-state evidence in
[assays/action-art-audit.json](assays/action-art-audit.json). A fixed ground pivot
is a registration check, not evidence of perfect foot planting. Unmeasured visual
issues are explicitly marked for review, never converted into passing counts.

Every original action registration used one SE sequence, mirrored SW/NW and
reused NE. S/W/N/E remain nearest-diagonal views in the existing controller.
This pass replaces those mirrors/reuse for **sword and fishing, both humans**
with distinct SE/SW/NW/NE drawings. It does not add eight authored views.

| Body/state | Crop, silhouette/weapon collision | Pivot/scale/foot contact | Timing and remaining art |
|---|---|---|---|
| Both humans: sword | New padded short-sword cells; connected silhouette extraction excludes adjacent drawings | Authored body centres/feet; one scale per appearance, same standing-body scale as new fishing | Eight anticipation/strike/contact/recovery poses, slot 4 contact; rear recovery sometimes hides blade behind body |
| Both humans: staff / cast | Original large baked glow reaches source boundaries; scan warnings retained | Original bottom-silhouette registration; body scale versus glow still provisional | Cast aliases staff; distinct rear views and separate effect-free art needed |
| Both humans: bow | Original release glow/trail provisional, edge warnings in JSON | Original registration; planted feet/body proportions not certified | Draw/release/follow-through remains original; slot 4 release |
| Both humans: dagger | Original trail/source-boundary risk remains | Original registration; foot slide not certified | Quick strike remains original; slot 4 contact |
| Both humans: hurt | Original reaction sheet; per-frame edge evidence retained | Fixed ground pivot; recoil/locomotion silhouette differences remain | Original recoil; rear views missing |
| Both humans: defend | Original unarmed brace | Fixed pivot; no authored hand/equipment sockets | Shield/weapon variants missing |
| Both humans: defeat | Original kneel/collapse, no new pose | Bottom anchoring moves the body between standing and kneeling by design | Original recovery/hold contract preserved |
| Both humans: item / potion | Original bottle sequence | Bottle and outfit identity retained, no action cosmetic bake | Original use timing; distinct directions missing |
| Both humans: interact | Reuses defend/hand brace | Original pivot; no interaction-specific contact | Dedicated interact art missing |
| Both humans: fish-cast / fish-wait / fish-catch | New independent full bodies, rods/lines/fish contained in padded cells; no blank used frame or cell-edge opaque pixels | Body-ground pivots exclude bobbers/rods; one scale across cast, wait and outcome | Seven authored stages expanded to eight slots by explicit holds; cast → line-forward/wait → reel/catch → recover; no invented outcome |
| Both humans: chop / chop-recover | Original axe/trail boundaries remain provisional | Original bottom-silhouette registration; planted contact requires further review | Existing windup/contact/recover order retained; slot 4 contact; directional art missing |
| Moonfox: attack / special | Original pounce sheet; special aliases attack | Fixed pivot but airborne/contact foot planting provisional | 420ms species attack retained; special art missing |
| Moonfox: defend | Original brace | Original pivot and body-scale limitations | Owner/self aliases retained, directions missing |
| Moonfox: hurt / exhausted | Original hurt; exhausted aliases held low hurt/defeat | Original bottom anchoring | Dedicated lying exhaustion missing |
| Deer: attack / special | New complete antlers/hooves; two overlapping source drawings excluded | Fixed scale and authored feet; antler silhouette does not independently rescale each frame | Deliberate lower/thrust/contact/rise; slots 3/4 held; 850ms species duration retained; special aliases attack |
| Deer: defend | New braced antler sequence | Full silhouettes, padded cells; eight body-ground anchors | Still SE with SW/NW mirrors and NE reuse |
| Deer: hurt | Dedicated recoil replaces resting-hurt alias | Complete hoof/antler silhouettes | Recovery sequence; no directional recoil art yet |
| Deer: exhausted / defeat | Dedicated lower/lie/rest sequence | Rest is intentional silhouette lowering; shared logical ground/head anchors retained | Held lying exhaustion; directions still provisional |
| Slime: idle / walk / attack / hurt / defeat | Original atlas; individual warnings retained in JSON | Fixed pivots, squash/stretch intentional; no planted-foot claim | Single-view/mirrored set remains |
| Boar: idle / walk / attack / hurt / defeat | Original atlas; individual warnings retained in JSON | Fixed pivots; shape changes/contact planting remain provisional | Single-view/mirrored set remains |
| Dummy / Thornling / Rippleback / Scavenger / Guardian | Static compatible painted fallback, no dedicated action frames | Original foot anchor; animated contact cannot be certified | No independent attack/hurt/defeat animation; fallback disclosed |

The old Deer locomotion sheet is retained. Its uneven/cropped source edges are
still an art task; replacing its gait drawings would require another measured
locomotion asset pass. No procedural limbs were introduced.

## Equipment inspection boundary

New human art preserves the base outfit/satchel and painted sword/rod. Existing
hat/cape/accessory graphics still use the same attachment layers during actions,
and boots remain painted into the body. Action sheets are not precomposed per
outfit and do not have authored hand/head/cape sockets. Large hats/capes and
alternate visible weapon models are **not production-certified** across every
pose; no new cosmetic system or unbounded appearance cache was introduced.

## Acceptance boundary

The five new sheets are usable cleanup assets for the existing four-view
presentation, with pixel/registration checks and viewer inspection. None is
advertised as final eight-direction production art. Distinct staff/bow/dagger,
woodcutting, Moonfox, Deer and mob directions, separately painted trot, special
and interact actions, and complete action cosmetic alignment remain provisional.
Authoritative outcome packets arrive after hits: this pass does not claim the
anticipation animation occurred before an already received hit. Viewer contact
markers identify painted frame slots only; animation never determines damage.
