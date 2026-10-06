# Phaser world

Phaser 3 is locally installed and served at `/vendor/phaser.js`. No CDN or build step is
needed. BootScene generates original body/detail/cosmetic textures; WorldScene renders
room specs from shared `model.js`. One reusable scene creates Town, Café, Park, Market,
Arcade, Exchange, Arena, Lab and owner/visitable Home layouts.

Entities use separate penguin and Mochi containers, sprite texture layers, nameplates,
foot shadows, walking/idle motion, Y depth and subtle depth scale. Collision and movement
rules are shared with the server. A point-and-click marker and server-corrected interpolation
keep movement independent from rendering. A bounded companion can roam/rest and return.

The DOM HUD provides map, inventory, Mochis, friends, wardrobe, conversation and wallet.
Props open the existing finite shop, arcade, paper trading, competition and neural views.
Clicking a remote penguin shows only valid friend/gift/home/profile/shop actions. No public
free-form player chat is implemented; allowed emotes and preset phrases are server validated.

Room art remains original procedural placeholder illustration; item-specific cosmetic atlases,
full room interiors and richer furniture physics are future work. Asset conventions are in
web/assets/README.md. Responsive HUD and text panels work on small screens; desktop is
primary. Keyboard-accessible panels, labeled controls and reduced decorative motion are included.

Phaser reference: https://docs.phaser.io/api-documentation/3.90.0/class/scale-scalemanager
