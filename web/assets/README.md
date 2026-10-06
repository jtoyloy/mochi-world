# Original asset conventions

The world currently uses original generated Phaser textures (BootScene.js) and rounded
procedural room illustrations (WorldScene.js), not third-party game art. Replace textures
without changing their anchors: penguin foot origin at (40,85), companion foot at (24,37).

- avatar/penguin/base/: body/detail atlases; logical 80×94
- avatar/penguin/hats/, tops/, face/: centered transparent layers
- mochi/: variant base, detail, cosmetics and effects; logical 48×44
- world/: room backdrops, props, collision metadata

Body color is a tint, equipment uses existing catalog IDs; temporary hat/top/face/accessory
art is shared per layer. No proprietary map, character, audio or artwork is included.
