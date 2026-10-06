# Mochi City

The home page begins with the active pet and Happiness, Fullness and Energy. Coins,
actual events and four daily rituals provide reasons to return. A modest paper
portfolio summary links into trading without making it the entire product.

The CSS city map has original buildings, roads, trees and seven linked destinations.
Small screens use destination cards. No external virtual-pet artwork is used.

| Location | MVP |
|---|---|
| Market Row | Six generic NPC shops, stock and deterministic restocks; player shops |
| Arcade | Berry Basket, 45 seconds, one timed berry per 1.5 seconds |
| Mochi Park | Actual saved pets and friends' pets, linked public identities |
| Trading Floor | Portfolio, Cadence decisions, commentary and links into the lab/cup |
| Arena | Daily isolated paper competition, actual entrants and configured rewards |
| Bank | Integer Coin balance and recorded transactions |
| Research Lab | Original room with words, demonstrations, diary and neural tools |

Every specified MVP route is handled, including canonical `/items/*`,
`/community/friends`, `/community/guilds`, `/trading/leaderboard`, `/dailies`, and
`/mochi/[id]/brain`. Player shops live at `/shop/[username]`. Guilds, trading post,
auctions and messages are polished Coming Soon pages with foundations, not pretend
working systems. Unknown pages display an explicit wrong-turn state.

Notifications reflect persisted `user_events`; there are no invented visits,
participants, profits or news events. The home welcome banner is editorial copy.

## Current social-world entry

The primary experience is now Mochi World at /home: a player-controlled penguin and active
Mochi inside Phaser multiplayer rooms. Town, Café, Park, Market, Arcade, Exchange, Arena,
Lab and Home share a room renderer/protocol. Existing inventory/shop/profile/trading pages
remain detailed panels. See PHASER_WORLD.md and SOCIAL_WORLD_DELIVERY.md; the earlier
page-based city layout is retained as secondary exploration, not the main avatar experience.


## Adventure milestone — 2026-10-05

The spacious isometric Town adds western combat stalls and southern resource carts, with portals to Training Yard, Whispering Forest, Moonwater Lake and Old Lantern Ruins. Eighteen residents include ten shopkeepers. Outdoor trees, water and carts have physical collision footprints. Original painted mob/cart atlas adventure-v1.png matches existing world art. View culling, sprite interpolation and a bounded effect pool support the new scenes. Current renderer is Pixi isometric; this milestone does not replace it with a new 3D engine.
