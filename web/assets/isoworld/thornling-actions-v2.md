# Thornling action candidate — 2026-10-10

Classification: **USABLE_PROVISIONAL candidate; live Forest review pending**.
This does not close the release art gate. Thornling is an aggressive, moving
Forest mob whose walk/attack/hurt/defeat previously used its static
`adventure-v1.png` fallback. `MOB_ACTION_SHEETS` now registers its optional sheet
alongside slime and boar. Missing or malformed metadata/PNG retains that static
fallback. The normal texture owner registers one shared PNG and 40 World-owned
frame views; no separate cache or source ownership path is introduced.

## Provenance and source

Original built-in imagegen, using this repository's `adventure-v1.png` only as
character identity and painterly style reference. No third-party reference or
external paid API. PNG source alpha/pixels are preserved, with no pixel edits,
procedural limbs, affine action deformation or invented outcome.

Selected source and review contact sheet: `thornling-actions-v2.png`,
1536×1024, 2,510,196 compressed bytes / 6,291,456 decoded RGBA bytes.
SHA-256 `ca0ca4c8605bb596e8f52493e2b97277c3934912d8c6742715af66822b6b4ce0`.
There are 844,879 fully transparent pixels; contour alpha remains unchanged.

Built-in source output retained outside the repository: generation folder ID
`01a125de-b99b-7b93-9de2-97e5256c5dc5`, selected filename
`exec-1b2aae4e-d777-4425-9368-9d659d1ca474.png`.
The first attempt remains locally under the same generation ID as
`exec-6b8a2115-accd-4189-8b1f-e334c68a26db.png`; it is not a runtime asset.
Its nominal equal cells intersected feet/branches/attack reaches. The targeted
padding revision improved spacing but still crosses nominal attack cell edges.
Explicit unequal rectangles through measured gutters resolve registration; this
is not a claim that imagegen followed the requested regular grid perfectly.

## Pose review and remaining limits

The source contact sheet shows five rows: idle/blink, root-foot walk, claw reach
attack, recoil/recover, and lowering/lying defeat. Eight separately drawn cells
per row have 40 distinct pixel hashes. Attack anticipation bends the head/body,
then extends an arm before withdrawal; hurt lifts a root foot and recoils; defeat
progresses to a held lying side pose. These are meaningful drawn pose changes,
not translations or distorted copies of a static body.

Only the SE view is painted. SW/NW mirror it and NE reuses it, explicitly recorded
in metadata. Four/eight authored directions remain missing. Walking loop
continuity, planted-root contact, modest shape/proportion drift, idle blink
frequency and source body-centre/ground placement require moving viewer and live
Forest inspection. Upright row baselines preserve motion; reviewed per-frame
resting contacts ground the defeat drawings without changing scale. These are
not evidence of perfect walking-foot planting. No action sockets or
cosmetic/equipment certification. Contact slot is a visual convention only:
animation never owns damage, movement, rewards or Cadence decisions.

Playback preserves the existing generic attack 600ms, hurt 300ms and defeat
800ms with a held final pose. Mob defeat remains visible for the existing
1100ms renderer interval. Walking consumes actual traveled distance with the
existing 90-unit stride. Optional idle frame durations keep the eight original
drawings in a 4.8-second loop: `[.9,.9,.08,.9,.9,.08,.08,.96]` seconds. Closed-eye
drawings 2/5/6 now hold 80ms each (240ms total), rather than the original equal
600ms slots. Other mob profiles retain uniform idle timing. No server cooldowns
or event sequencing change. `contactFrames.attack=4` labels source column 4
(zero-based) in the viewer; legacy sheets retain their generic marker. This
metadata is a painted contact convention only. The server's authoritative event
selects the reaction after its outcome arrives.

## Independent moving viewer review and measured repair

The actual bundled offline renderer/viewer was inspected at source `4eb699f` in
a separate Chrome tab. All 40 state/frame indices were observed in visible
diagnostic text at 50% playback, and five states × eight logical direction
selections were checked. Screenshots and diagnostic samples are retained locally
under `runs/thornling-viewer-2026-10-10/`; sample filenames reflect the diagnostic
at sampling time, and a running animation can advance before capture. The
screenshots themselves show their actual frame diagnostics.

Clean cutout edges and distinct reach/recoil/collapse were visible. Walking root
feet and torso drift between drawings, so planted-foot/loop acceptance failed.
Held defeat frame 7 floated approximately nine source pixels above the logical
ground (source bottom 986 versus original row baseline 995). The original idle
had eyes closed for three equal slots, including a long two-slot consecutive
hold. These failed observations remain evidence; they were not converted to a
full art pass.

Metadata repair grounds each reviewed defeat pose at its actual resting contact
`[997,995,995,994,991,990,985,986]`, retaining the common pivot, source canvas and
174px scale. Walking registration and PNG pixels remain unchanged. The optional
idle durations and contact metadata above address their measured presentation
issues. Focused tests verify lying contact within one logical pixel, all idle
drawings/brief closed holds, malformed timing/contact rejection and retained
uniform control profiles.

Post-repair inspection used a fresh tab with the rebuilt bundle, then continued
only in its already-loaded offline canvas when the host fell below the 3GiB
safety floor and the owned server was stopped. No reload, build, generation or
native/gameplay work followed that warning. Held defeat frame 7 now visibly
meets the green ground marker (trim Y 98, versus original Y 89), and the attack
viewer marks painted slot 4. At 50% viewer speed, lightweight visible-text
transition reads measured closed-frame holds of approximately 166ms (frame 2),
140ms (frame 5) and 167ms (frame 6), consistent with 160ms expected after speed
scaling and observation quantization. The consecutive 5/6 hold was approximately
307ms versus 320ms expected; frame 2 recurred after 9620ms versus the 9600ms loop.
Three screenshots and `idle-after-repair-transitions.json` preserve this evidence
in the same local runs folder. This verifies the scoped presentation repairs;
walking contact, looping art quality and authored direction acceptance remain
open, and no sustained performance or complete production-art pass follows.

Two pre-repair renderer remounts reused valid shared sources, released previous
ownership and held `ownedFrames=1150`, `ownedCanvasSources=4`, `hostCanvases=2`.
Chrome extension warnings were unrelated to the renderer. The historic failed
bare-module fixture load predates the repaired bundle and is retained separately;
no new application warning/error appeared during the completed moving review.

## Registration and focused validation

`node tools/register-thornling.mjs` writes the source trim metadata.
`node tools/register-thornling.mjs --check` checks exact regeneration, source
hash, dimensions, complete state/frame mappings and logical ground/head pivot
contract. It scans alpha≥96 silhouettes inside explicit source regions, rejects
region-edge pixels or inadequate gutters, and applies the existing padded-frame
pixel audit. Passed: 40 valid nonblank frames, zero region/source-edge pixels at
that threshold, zero existing pixel-audit warnings. Soft fringe below the audit
threshold is not certified as absent; genuine alpha is preserved.

Actual installed Pixi `loadActionAtlas`/`selectTexture` were exercised for all
160 state/direction/frame selections. Forty owned frame views share one source;
destroying views preserved that shared source. No build, browser/live gameplay,
performance or release-wide acceptance has been claimed from these checks.

## Prompt set

Initial built-in prompt:

> Use case: stylized-concept. Asset type: original painterly isometric game
> animation sprite atlas. Reference image is project-owned style and character
> identity ONLY: Thornling, the little wooden creature in top row third cell,
> round amber eyes, branch crown with green leaves, leafy chest, two twig arms
> and two root feet, cream tiny flowers. Create ONE genuine transparent PNG
> animation sheet, 1536x1024 landscape, strict 8 columns by 5 rows (40 full-body
> separate drawings), each pose centered within its own 192x204 cell, wide
> transparent margins including branch tips, NO text or grid lines. Same
> creature identity, body proportions and scale throughout, three-quarter
> southeast camera facing right, warm gouache brush texture matching reference.
> Row1 eight subtle idle poses with gentle breathing and leafy settling. Row2
> eight distinct walking cycle poses: alternate planted and lifted root feet,
> opposite arm swing, passing and contact poses, no spinning. Row3 eight
> meaningful claw attack poses: 1ready 2crouch anticipation 3right arm windup
> 4forward reach 5clear extended slash contact pose 6follow-through 7withdraw
> 8return ready. Row4 eight distinct hurt recoil and recovery poses, recoils
> away from right, no defeat here. Row5 eight defeat poses: standing wobble,
> lowering, knee bend, sit, tip sideways, lie on side, settle, held resting side
> pose. All drawing fully inside cells, roots share common baseline except
> intentional lifted feet or collapse. Each full body redrawn for pose, never
> affine distorted repeated sprites. No motion trails, glows, dust, detached
> leaves, shadows, scenery, silhouettes, cropped limbs, extra creatures,
> weapons or typography. This is one SE-view candidate; do not add other
> directions.

Targeted padding revision prompt:

> Edit this sprite atlas. Preserve 40 Thornling poses, identity, painterly
> drawing, action order, actual transparent background, 8 columns and 5 rows
> in a 1536x1024 canvas. Fix cell padding only: REDRAW EACH creature at about
> 65 percent of current size, center within each of its own 192x204 cells, so
> ALL branch tips, arms and feet have minimum 20px fully transparent margin
> to every edge of their own cell. Keep body scale identical across poses
> including low resting collapse. Never crop or overlap neighbor creatures.
> Give every upright pose same logical root-foot ground baseline at 175px
> inside its row. Make the complete attack arm reach fit wholly within its
> cell. Leave generous full transparent gutters across every row and column.
> No background wash, no checkerboard, no ground shadow, no words or lines.
> Preserve genuine alpha, existing meaningful independently drawn
> walk/attack/recoil/defeat gestures. This is a layout correction, do not
> create new content.
