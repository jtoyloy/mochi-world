# A neighborhood of persistent identities

Public pet and explorer pages show actual persisted names, collections, traits,
achievements, trophies and competition results. Profiles link to player shops and
other pets. Park displays saved neighbors and the current explorer's friends' Mochis.
No made-up popularity scores or visitors are displayed.

Friend requests have sender/recipient ownership and one pending unordered pair.
Only the recipient can accept/decline. Acceptance creates a canonical ordered
friendship. Removing a friend deletes that relationship; declined/accepted requests
remain history. Sending a request to yourself is rejected.

Gifts require an accepted friendship, a tradable unequipped bag item and owned quantity.
They transfer under sorted account locks. The recipient permanently discovers the
item and gets a real event. The inventory gift form is the confirmation step.

`user_events` has payload, timestamp and read time. Shop purchases/sales, daily claims,
arcade scores, awards, competition outcomes, gifts and friendships produce real events.
The home feed and notification count use those records. There is no profile visitor
tracking, live chat or message board in this MVP.

`mochi_relationships` stores familiarity, affection, rivalry, trust, interaction count
and last interaction for a directed pet pair. It is a future foundation, not an active
AI social network. Guilds/members have schemas and a Coming Soon discovery shell.
Messages also show Coming Soon. Moderation, roles and autonomous encounters are deferred.

Multiplayer now adds real instance membership, online/away presence, visible penguins and
active Mochis, predefined emotes/phrases, private owner dialogue and public environmental
bubbles. Nearby actual companions gain bounded familiarity and template greetings. Homes
admit owners/accepted friends. There is no unrestricted player public chat. See MULTIPLAYER.md,
MOCHI_COMPANION.md and MOCHI_DIALOGUE.md for privacy, limits and learned-behavior boundaries.
