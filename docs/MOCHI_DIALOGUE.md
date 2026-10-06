# Mochi dialogue

`DialogueService` validates owner/pet identity, length (1–400), six messages/minute per user,
one concurrent generation per user and visibility. Direct owner conversations default to
owner_only; room visibility requires an explicit UI checkbox. Environmental remarks are
room-visible and use actual fullness/energy/happiness/location with a 45s cooldown.

Context is deliberately small: named pet, derived stats/personality/preferences, room,
up to eight recent messages, four memory summaries and actual own paper-trading state.
No other user's private inventory, wallet, prompts, configuration or secrets are included.

TemplateDialogueProvider runs without credentials and narrates real state. Optional
OpenAIDialogueProvider uses the Responses API with server-only key/model, no tools,
store:false, short output and a timeout; errors fall back to templates. Its instructions forbid
state changes, fabricated positions, investment recommendations and guaranteed returns.
Output is always plain text, stripped of tags/control characters, capped at 220 and never HTML.
External language accuracy still needs evaluation; text has no capability to affect trades,
balances, inventory, movement, rewards or brain learning.

Messages/history are owner-gated, retained to 100/pet; panels load 24. A bounded owner-contact
memory summary complements actual persistent preferences. No infinite transcript is sent.
SpeechBubbleSystem anchors, wraps, queues (max three), separates overlapping bubbles,
auto-dismisses/fades after 3–8s and supports clicking to dismiss; replies also appear in the
conversation panel. Dialogue history and environmental remarks appear as plain textual UI.

Official provider reference: https://developers.openai.com/api/docs/guides/text
