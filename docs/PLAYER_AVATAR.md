# Player avatar

Every user lazily receives one `player_avatars` row, keyed by user ID. It stores a bounded
plain-text display name, validated hex body color, four equipment layers, current room,
last valid coordinates and update time. The player controls this penguin; Cadence does not.

`GET/POST /api/avatar` reads/updates the authenticated avatar. Clothing comes from the
existing item catalog and owned bag inventory. Unequipping is explicit; moving/listing/gifting
an equipped penguin item is refused. Cosmetic art is currently shared per layer rather than
one bespoke asset per item, consistent with the earlier shared closet/item model.

Penguin body, eyes/belly, top, hat, face and side accessory are separate Phaser texture layers.
Color is a body tint. Socket refresh propagates appearance changes to actual room members.
Profiles retain their existing pet/trophy/friend/shop/collection data; richer avatar previews
and item-instance occupancy are follow-up work.

## Current world presentation

The main world uses PixiJS painterly isometric rendering with DOM/React overlays.
Three.js and React Three Fiber are historical prototype tooling. Domain services and
Cadence contracts remain preserved. Build with `npm run build` before serving/deploying.
