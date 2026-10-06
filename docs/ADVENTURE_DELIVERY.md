# Adventure milestone delivery — 2026-10-05

1. **Town:** preserved spacious isometric world; social center, western combat stalls, eastern fashion, northeastern trading and southern buyers. Eighteen residents.
2. **Trading Hall:** physical market board, portfolio, cups, history and research terminals; existing paper engine preserved.
3. **Cosmetics:** existing owned inventory, wardrobe, shops and player marketplace preserved alongside combat catalog.
4. **Combat vendors:** Bram sells weapons/armor; Iris spells; Sage supplies; Opal charms.
5. **Combat:** server simulation owns attacks, cooldowns, HP, MP, collision/range, loot, XP and defeat. Intent-only clients.
6. **Weapons:** sword, staff, bow and dagger; differing range, rate, power and specials.
7. **Spells:** Fire Bolt, Ice Shard, Heal, Shield and Lightning.
8. **Accessories:** Iron Ring, Ember Charm, Bond Necklace, Healer Pendant; two slots.
9. **Consumables:** small/large healing, mana, antidote and combat food.
10. **Mobs:** Dewdrop Slime, Bramble Boar, Thornling, Rippleback, Mossmask Scavenger, Lantern Guardian and training dummy. Original painted art.
11. **Spawns:** authored server cells in Forest, Lake, Ruins and Yard; respawn, aggression, leash and death states.
12. **Battle behavior:** seven real motor choices, species specials, persistent counters and safe holds. Counts describe experience, not a fixed character class.
13. **Cadence:** actual native composed 64-cell control; full settlement, owned outcome learning and complete checkpoint persistence. No gameplay teacher.
14. **Separation:** independent battle-v1 state and immutable battle-0.74.0-v1 pack; trading checkpoints and lifecycle remain separate.
15. **Fishing:** timed owned-rod actions, server weighted catches, shared cooldowns, XP and reload recovery.
16. **Woodcutting:** owned axe, level-gated trees, timed harvests, shared cooldowns and XP; decorative trees excluded.
17. **Buyers:** Neri buys fish, Alder wood; quantity selection and exact configured-price estimates.
18. **Rewards:** atomic inventory sales reserve funded treasury liabilities; batch claims. Mock payouts locally; production claims require external verified transfers.
19. **Anti-abuse:** authentication/live actor, shared throttles, proximity/time/level checks, row locks, replay protection, caps, age gates, finalized backing checks and immutable receipts.
20. **Schema:** player_adventure, mochi_battle_brains, resource_node_state, resource_harvests, adventure_events, combat_encounters, reward_treasury/funding, game_reward_accruals/claims/payouts and party foundation. Unified item catalog retained.
21. **Checks:** ownership, cooldowns, client-forged outcomes, transaction replay, gathering cancellation, exact claims/receipts, domain isolation, true checkpoint continuation, native plasticity, defeat and existing world/social/trading regressions.
22. **Results:** 124 JavaScript tests and 21 Python tests pass; Vite build succeeds. Browser confirmed slime victories, Softwood and Silver Carp harvests, introductory quest rewards and a backed mock resource sale and payout, and Trading Hall access. Decorative-label pointer interception and desktop HUD overlap found in browser QA were corrected. Narrow acquisition reaches 578/578/570 of 600 versus random 89/84/74, mother 600. Combat assay remains worse than random: Cadence wins 0/0/3; random 8/7/9; mother 100 each. See [battle documentation](MOCHI_BATTLE_AI.md), [raw assays](assays/battle-adjusted-reward.json) and STATUS.md.
23. **Limits:** combat learning competence is unproven; no party gameplay/PvP/full obstacle pathfinding or production auto-payout worker. Production economics require configuration and review. No sustained multiplayer capacity benchmark. One painted pose per mob, animated through movement and effects.
24. **Setup:** use commands below. Existing installations preserve their .env and data.
25. **Next:** improve battle behavior through measured matched-control experiments; verify long-lived outcomes across host outages; implement cooperative encounters and pathfinding; review economics/farming telemetry; add an audited payout worker and multiplayer soak tests.

## Fresh local setup

```sh
cd /Users/j.t./Documents/ChatGPT/Neopets
npm ci
python3.12 -m venv .venv
.venv/bin/python -m pip install numpy pytest web/brains/traders-0.74.0-v1/cadence_net-0.74.0-py3-none-any.whl
cp -n .env.example .env
npm run db:local
```

Set DATABASE_URL and TEST_DATABASE_URL in .env to the separate URLs printed by db:local. Keep DEV_MODE=true and MOCK_TOKEN_MODE=true for local testing. Then:

```sh
npm run db:migrate
npm run build
npm test
npm run test:brain
npm start
```

Optional legacy save import: `npm run db:import`. Open http://127.0.0.1:8777/home. Existing workspace server is left running.

## Reproduce brain measurements

```sh
.venv/bin/python -m sim.battle_assay
.venv/bin/python -m sim.battle_acquisition
```

Production rewards are deliberately disabled by empty configuration. Read TOKEN_REWARDS.md before configuring a distinct treasury, real prices/caps/account-age gates or recording finalized external funding/payout transfers. No real tokens were transferred in this milestone.
