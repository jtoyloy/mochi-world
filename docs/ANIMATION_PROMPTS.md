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
