# Visual release audit — 2026-10-06

Base: `99f31e15ab10a23e1985280d3508af3063f96b1a`. **Visual release remains IN_PROGRESS.** Asset validation establishes valid registrations, not final art quality. No current state family is certified as complete eight-direction production art.

## Actual review and this change

Inspected the actual PixiJS World through a dedicated offline fixture, first at 1280×720 and then 390×844. Reviewed Town, Forest, Lake, Ruins, Training Yard, Trading Hall and Marketplace scenery; the fixture derives stationary mobs from the shared spawn definitions. It runs no gameplay, network, rewards or persistence. It is not a full player journey, live battle, device certification or animated contact assessment. Screenshots were inspected in the browser session; no new screenshot files were committed.

`web/dev/visual-review.html` now gives reviewers a styled room selector, real renderer controls and the existing diagnostic animation viewer. Run `npx vite web --host 127.0.0.1 --port 5181`, then open `/dev/visual-review.html`. Unlike the performance benchmark it includes the game's stylesheet. Room changes reproduce existing scenery, not newly authored levels. Trading Hall and Marketplace use repeated building/stall sprites on a compact paved island; their economic overlays were not reviewed in this pass.

Fixed the room heading blending into tree/building artwork using a bounded cream backing panel. Checked its readability at both viewport widths. Added named zoom buttons, visible keyboard focus and a pressed-state decorative-motion control. The renderer honors OS reduced motion until the user overrides it for that World session; subsequent OS changes apply while no override exists. Reduced mode freezes ambient idle frames, accessory sway, dance/reaction bobbing and water ripples, and replaces expanding hit rings with a stationary fading marker. Distance-driven locomotion and accepted gameplay action timing continue. The minimap accessibility label now names the current room. The preference listener is removed on World destruction.

## Release-required state inventory

| Family / visible states | Classification | Required work |
|---|---|---|
| Both humans idle / walk | USABLE_PROVISIONAL | Four authored diagonal views; logical eight sectors use nearest view. Refine gait contact/counter-motion and rear pose reuse. |
| Human run / trot | PLACEHOLDER | Reuses walk art; dedicated run/catch-up poses missing. |
| Both humans sword / fishing cast-wait-catch | USABLE_PROVISIONAL | Improved four independent diagonal drawings and padded registration; eight authored views, contact, socket/cosmetic acceptance still outstanding. |
| Human staff / cast / bow / dagger / hurt / defend / defeat / item | USABLE_PROVISIONAL | Original single-view/mirrored action art, clipping warnings, baked glow/trails, weapon/hand alignment unresolved. |
| Human interact | PLACEHOLDER | Braced-hand alias lacks task-specific contact art. |
| Human chop / recover | USABLE_PROVISIONAL | Original mirrored axes/trails; dedicated directions and planted contact needed. |
| Human head / cape / boots / outfit / equipment during actions | USABLE_PROVISIONAL | Cached or attached cosmetics lack authored action sockets; boots painted into base. Full equipped-state acceptance missing. |
| Moonfox idle / walk / attack / defend / hurt | USABLE_PROVISIONAL | Mirrored/reused rear views, animal contact refinement. |
| Moonfox special / exhaustion / run | PLACEHOLDER | Attack/low-hurt/walk aliases; dedicated species art needed. |
| Deer idle / walk / attack / defend / hurt / lying exhaustion | USABLE_PROVISIONAL | Cleanup complete silhouettes/recoil; gait source edges, mirrored/reused directions and contact remain. |
| Deer special / run | PLACEHOLDER | Attack/walk aliases; independent sequences missing. |
| Slime / boar idle-walk-attack-hurt-defeat | USABLE_PROVISIONAL | Single-view/mirrored atlas; contact and directional refinement required. |
| Dummy / Thornling / Rippleback / Scavenger / Guardian action states | PLACEHOLDER | Compatible static painted body; independent locomotion/attack/hurt/defeat missing. |
| NPC idle / walk / talk / gesture / sit | USABLE_PROVISIONAL | Shared human profiles, rear fallbacks and seated original pose; role-specific art and cosmetic alignment needed. |
| Town scenery / vendors / signs | USABLE_PROVISIONAL | Repeated stall silhouettes; tree source rectangles visibly meet background; overlapping Trading Hall place/landmark labels. |
| Forest / Lake / Yard scenery | USABLE_PROVISIONAL | Sparse repeated tree arrangement, abrupt water shape, limited region identity. Live purpose/content is a separate gameplay gate. |
| Ruins scenery | PLACEHOLDER | Plain gray procedural columns among reused trees; painterly ruins identity missing. |
| Trading Hall / Marketplace / shops | USABLE_PROVISIONAL | Backdrops inspected; inspect actual interiors/panels, crowded use, empty/error/loading states and responsive sizes. |
| Combat / spell / gathering VFX | USABLE_PROVISIONAL | Generic rings, original baked effects and absence of weapon/spell-specific visual acceptance. |
| UI / HUD / labels / settings | USABLE_PROVISIONAL | Heading/control improvements checked; complete overlay, keyboard, error, contrast and crowd acceptance outstanding. |

The source audit remains [ACTION_ART_AUDIT.md](ACTION_ART_AUDIT.md); architecture/fallback boundaries remain [ANIMATION_DELIVERY.md](ANIMATION_DELIVERY.md) and [ACTION_ANIMATION_DELIVERY.md](ACTION_ANIMATION_DELIVERY.md). Dedicated recovery/social poses beyond existing aliases are not independently certified.

## Findings that remain release debt

- Tree cutouts show visible rectangular texture boundaries in all reviewed exterior scenes. Replace/refine source exports; do not erase validation warnings or label the old sheets final.
- Town Trading Hall name and landmark/Trader Tech labels overlap; Forest spawn labels cluster over player/pet. Fixed place labels reserve additional vertical space for the backed heading; actor-name avoidance remains incomplete. Introduce measured label avoidance and inspect actual crowded play.
- Narrow view shows actor names clipping at the right edge. Complete edge-aware labels, actual HUD/overlay touch layouts and keyboard journeys before claiming mobile support.
- Ruins uses flat gray columns; Forest, Lake and Yard reuse the same small tree/path group. Artist/content refinement is a release requirement, not an inaccessible credential blocker.
- Full state/direction, planted feet, equipment alignment, special actions and static fallback mobs remain uncompleted. No neural competence claim follows from these visuals.

## Checks

19 animation tests passed; asset validation passed with original source-edge/continuation warnings retained; Vite production build passed. Browser checked motion toggle off→on with the accessible pressed state at desktop and narrow width. These checks do not certify full WCAG compliance, live multiplayer, sustained FPS, final eight-direction art or the complete new-player path.

## Shared texture ownership follow-up

Installed Pixi `assets/loader/parsers/textures/utils/createTexture.mjs` removes its cache entry and warns when an Assets-owned Texture is destroyed directly. The original World teardown destroyed those cached PNG wrappers while leaving their sources alive, forcing repeat loads and retaining registrations. World now retains shared Assets PNGs for the document and explicitly releases its own frame views, generated split canvases and appearance canvases. Optional frames arriving after unmount release immediately; generated sources release exactly once. Texture-frame lists include unselected action registration cells, so none leaves a resize listener attached to a shared source.

The visual fixture's **Remount renderer** button destroys and reconstructs the actual renderer without page navigation, reports cached sheet identity/source validity, prior ownership release and current allocation/canvas counts. Automated follow-up: 22 animation tests passed, including actual installed Pixi TextureSource listener counts across three ownership lifecycles; production build and asset validation passed. Same-document browser remount evidence remains pending until the parent browser session runs the fixture; source/test evidence alone is not browser acceptance.
