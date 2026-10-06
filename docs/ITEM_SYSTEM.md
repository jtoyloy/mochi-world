# Items

The original shared 20-item catalog, categories/rarity, finite restocks, integer stock, bag/storage,
four pet-clothing and five furniture slots, permanent collection discoveries, consumables,
listing escrow and gifts remain. Items are ordinary PostgreSQL game items, not NFTs.

Penguin cosmetics reference the same owned clothing IDs. AvatarService validates ownership
and layers; existing inventory movement/listing/gifting also checks avatar equipment. Pet
accessories remain independently equipped. Founder terminals and original trained possessions
remain intact. Trading tools still unlock the original masked market observations.

NPC and player purchases now use TokenService payment intents. Stock or listings are reserved
before signing; successful independently verified payment grants inventory in one transaction.
Canceled/expired NPC stock returns within the same restock cycle; restocked cycles don't
resurrect obsolete inventory. Discoveries persist after consuming/selling items.

Home scenes read saved furniture slots. Placeholder art/layer reuse and shared copies across
slots remain limitations; per-instance items and bespoke art are future refinements.


## Adventure milestone — 2026-10-05

The unified catalog now includes weapons, spell scrolls, armor, combat accessories, consumables, resources and gathering tools alongside cosmetics and trading tools. Adventure equipment/progression persist in player_adventure JSONB. Inventory ownership remains authoritative; worn combat gear cannot be listed, stored or gifted. Spell scrolls consume once when learned. Starter equipment and two quests provide a free core loop. Existing marketplace listings and cosmetic equipment flows are preserved.
