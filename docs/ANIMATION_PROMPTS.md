# Original animation prompts — built-in imagegen, 2026-10-06

Reference: only this repository's `web/assets/isoworld/characters-v1.png` was
supplied for original character identity/style. No third-party character art.
Final files live under `web/assets/isoworld/*-v2.png`; metadata registers source
rectangles without altering generated pixels. Generated grids required fallback
mapping; see ANIMATION_DELIVERY.md. These are provisional full-body cycles.

## Shared walk/idle prompt

Use case: stylized-concept. Asset type: production game animation sprite atlas, transparent RGBA. Generate exactly an 8-column by 8-row evenly spaced grid, square canvas. Every cell same size, no labels or dividing lines or shadows. Rows 1-4: 8 successive FULL BODY WALK poses facing respectively SE (front right), SW(front left), NW(back left), NE(back right). Columns contact-left, down, passing, up, contact-right, down, passing, up; LOOP smoothly. Rows 5-8: same four directions, eight quiet IDLE poses with breathing, occasional blink and tiny weight shift, feet together. Consistent character identity, proportions, outfit, size, perspective across all 64 cells. Whole character within every cell, feet baseline at 88% of cell height and centered at50% horizontally, head top around12%. Leave gutters, no overlaps. Actual full-body gait: opposite arm/leg swing, pelvis weight transfer, torso counterturn, hair and cloth/bag followthrough; not clones translated vertically. Match reference soft hand-painted warm isometric chibi shading, no vector/3D/pixel look. Preserve original character identity from specified reference row. Original reference supplies style/identity ONLY, draw all new full-body poses. 

## Subjects and final revisions

- Coral: second reference row only, brown skin, dark curly buns, coral tunic,
  cream cuffs/tan trousers/brown boots/crossbody satchel. Exactly64 sprites in
  EIGHT rows EIGHT columns; fit all8 rows; height75% of cell; backleft faces left,
  backright faces right.
- Sage final identity edit: preserve all64 fullbodyframes and EXACT8x8 layout
  of the coral sheet; change to fair tan skin, chestnut brown hairbun, sagegreen
  tunic, cream cuffs/tan trousers/brown boots/satchel. Do NOT change poses, grid,
  rowcount, framing. Every64 sprite fullbody, no removed rows, painterly same,
  transparent background. Earlier sage grids missing a row were discarded.
- Moonfox: third reference row only, cream/lavender small fox, massive fluffy
  lavender tail, leaf-green ears, crescent forehead. Exactly8rows8columns=64;
  fit all8 rows. Four legs coherently diagonally paired light quick trot, not
  human arms. Animate spine compression/head nod, tail counter-bounce, ears;
  idle blink/breath/look/tail/ears subtle. Backleft faces left/backright faces
  right; body including tail same width/height in all cells, feet88%; no human.
- Woodland Deer: fourth reference row only, moss green fur, cream chest,
  golden flowers, heavy chibi deer, golden branch antlers, leafy short tail.
  Exactly8rows8columns=64; fit all8 rows. Deliberate heavy four-beat quadruped
  steps; all four articulated legs, compression/weight transfer, subtle head/
  antler rock, ear flick, leafy tail followthrough. DIFFERENT from quick fox
  trot. Idle breathing/blink/look/ears. Backleft faces left/backright faces
  right; fully fit antlers/feet, same height75%; no human.

## Vendor gesture prompt

Original painterly isometric vendor TALK/GESTURE sprite sheet. EXACT8columns
8rows64fullbodycharacters. Row1-4 sage chestnutbun human in SE front-right,
SW front-left, NW back-left, NE back-right. Row5-8 coral darkcurl human same
four directions. Eight columns quiet talking gesture sequence: neutral, hand
lifts, open hand presentation, small nod, point outward, hand lowers, blink,
neutral. Mouth slight talk where visible. FEET STAY TOGETHER ON GROUND IN ALL
FRAMES, torso/head/arms/hair/satchel move gently. Same identity/outfits as
reference first2 rows. No walking, no gliding. All64 cells fullbody, size
consistent75% cell, feetcenter x50% y88%. Transparent background, no gridlines,
no labels, no shadows. Exactly eight rows fit all.

The gesture result supplied three views per human, not the requested four;
metadata explicitly mirrors the rear view rather than claiming missing art exists.

## Gameplay action sheets — 2026-10-06

Built-in imagegen, transparent RGBA. Only `characters-v1.png` and
`adventure-v1.png` supplied as identity/style references. Saved final outputs:
`actions-sage-v1.png`, `reactions-sage-v1.png`, `mob-actions-v1.png`,
`actions-coral-v1.png`, `reactions-coral-v1.png`. Generated layout and directional
limitations/repeated poses are recorded in ACTION_ANIMATION_DELIVERY.md.

### Actions

Use case stylized-concept. Original game full-body action atlas matching reference identities/style. Transparent RGBA, exactly 8 columns by 8 rows evenly spaced grid, 1792x1792 if possible. No labels, shadows or grid lines. Each cell feet/ground contact centered at x50% y88%, head about12%, consistent size. Every row is 8 sequential coherent full-body action drawings: anticipation frames0-1, active2-3, followthrough4-5, recovery6-7. ALL face SE/front-right. Row1 chestnut sage human sword strike. Row2 same human staff cast. Row3 same human bow draw release recover. Row4 same human quick dagger strike. Row5 same human fishing rod cast reel catch recover. Row6 same human axe windup chop recover. Row7 Moonfox agile crouch pounce swipe land recover, paws stable baseline except airborne action. Row8 Woodland Deer heavy brace antler thrust stomp recover. Reference image identity/style only; create new poses. Keep entire bodies/tools within cells, no overlaps. Soft warm painterly chibi shading, articulated arms/legs/full torso changes, no procedural limbs. Exactly64 sprites.

### Reactions

Use case stylized-concept. Game full-body action animation atlas matching exact painterly identities reference. Transparent RGBA, exactly8 columns and8 rows evenly spaced, no grid/text/shadows. All face SE/front-right. Character feet fixed cell x50% y88%, human heads at12%, entire body within cell, identical scale. Each row8 sequential frames. Row1 sage human hurt recoil and recovery; row2 sage human defend raised arms braced; row3 sage human defeated lower to kneel sit tired final pose; row4 sage human drink small potion bottle recover; row5 Moonfox hurt recoil recovery; row6 Moonfox defend alert braced with raised fluffy tail; row7 Woodland Deer heavy defend antlers lowered chest braced; row8 Woodland Deer exhausted sink to ground rest. Preserve fullbody warm painted chibi identity. 64 sprites. No motion trails/particles.

### Early mobs

Use case stylized-concept. Painterly game animation sprite atlas. EXACT8 columns8 rows equally spaced 64 sprites, transparent RGBA no text/grid/shadow. Reference only exact identity/style. Every sprite same cell ground contact x50% y88%, entire silhouette fits with gutters, same size per species. All SE/front-right facing. Rows1-4 Meadow Slime (reference upperleft) respectively 8 sequential idle breathing, 8 move squash hop land, 8 attack squash lunge recover, 8 hurt then flatten defeated final. Rows5-8 Bramble Boar (reference second upper) respectively 8 idle, 8 move heavy steps, 8 attack crouch tusk thrust recover, 8 hurt then sit slump defeated final. Coherent fullbody poses all legs articulate, leaves jiggle. No root translation along ground. 64 separated sprites; consistent soft painted texture chibi original identity.

### Coral action identity edit

Identity-preserve edit. Image1 action atlas target. Preserve exactly8x8 layout and all poses/weapons/registration. Change humans in first6 rows to reference image2 second row identity: brown skin dark curly double hairbuns coral tunic cream cuffs tan trousers satchel. Bottom2 beast rows unchanged. Transparent background. Fix fishing row5 so all8 cells contain full human body with rod fully contained in each cell, no overlaps; sequence cast, cast, forward rod, forward rod, reeling, reeling, fish catch, recover. Preserve all other action poses. No text/grid.

The attempted fishing repair still produced a blank/overlapping cell; registration
excludes it. This is not claimed as successful art repair.

### Coral reaction identity edit

Identity-preserve edit image1 reaction atlas target. Preserve EXACT8x8 layout poses scale feet placement body stance every frame and transparency. Change only humans first4 rows from sage to reference image2 second row: brown skin dark curly hairbuns coral tunic cream cuffs trousers boots satchel. Bottom4 Moonfox/deer rows unchanged. No new effects text or grid. Keep64 fullbody sprites.
