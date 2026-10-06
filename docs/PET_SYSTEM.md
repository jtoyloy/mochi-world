# Persistent pets

The original `World`, senses, canvas renderer, audio and motion remain in the private
room. Five underlying need values stay in `World.m.needs`. Public pages derive three
primary stats with the existing `petStats`: Happiness, Fullness and Energy. Secondary
confidence, stress and curiosity are retained in state and Research Lab.

Outside the room, `last_pet_tick` bounds elapsed catch-up to 24 hours. Per hour:
hunger +.06, thirst +.05, boredom/loneliness +.04, fatigue +.035; sleep reduces fatigue
by .18. All needs stay in [0,1]. Sleep lasts up to two wall-clock hours and blocks scheduled trading; petting
wakes Mochi. Catch-up divides elapsed time between sleep and waking correctly. The original accelerated simulated day remains local to the interactive room.

Care uses the existing `interact` on the actual saved World, with a five-second
per-action cooldown. Food consumes one owned bag item and reduces hunger using the
catalog's 10/15/20/25 fullness values. Catalog happiness effects relieve loneliness,
and Ramen also reduces fatigue. Happiness is a composite need stat, so changes are
bounded by the other underlying needs. Toys affect boredom, loneliness, stress or
curiosity and the ball appears in the real room.

Profiles contain adoption date, variant/color, age, XP/level, equipment and trophies.
Food/toy preference scores count repeated successful care; a favorite appears after
three uses. Location scores count at most one visit per location per calendar day.
Traits stay conservative until 20 care interactions, update at most once per day,
and derive from accumulated
play/social ratios and curiosity. These are transparent UI summaries; they are not
claims that Cadence has learned a psychological trait. Trading style remains “Still
learning” until at least five actual trades.

Clothing overlays use hat/glasses/shirt/accessory slots. Furniture uses bed, plant,
rug, computer and toy slots, rendered in the room. Furniture slots are decoration;
original simulated functional furniture remains part of the World. Full furniture
physics, asset layering and custom toy coordinates remain future work.

Users can adopt multiple pets and choose an active companion. A saved pet retains its
pack and own versioned checkpoint. Mochi-to-Mochi relationships have a foundation
schema, but social autonomous simulation is not implemented in this MVP.

The account's penguin is the player avatar; Mochis are its individually persistent companions.
One active Mochi follows in public rooms, while inactive pets can appear in the owner's home.
Care uses the original authoritative state/cooldown/inventory rules. See MOCHI_COMPANION.md.
