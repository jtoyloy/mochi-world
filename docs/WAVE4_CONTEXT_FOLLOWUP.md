# Wave 4 context discrimination follow-up

This is a controlled diagnostic for the unresolved Cadence action-learning finding. It uses the
existing isolated `cadence-action-learning-v1` host and the minimal `affordance` arm. Production
hosts, published packs, rewards and action masking are untouched.

The predeclared contexts share the same ordinary battle state and vary only the three measured
possibility senses: attack executable, special executable, and approach available. The set is
`near_ready`, `far_ready`, `special_ready`, and `special_unavailable`. A 24-pair replay then
exposes a fixed far-to-near sequence so delayed movement credit can be counted without replacing
the action selected by Cadence. The report records fresh and trained policy vectors, action
changes, entropy, update and associative-memory deltas, refusals, and the selected actions in
each transition.

Run the small fixture with:

```sh
.venv/bin/python -m sim.action_context_followup --output runs/wave4-context-followup.json
.venv/bin/python -m pytest -q tests/test_action_context_followup.py
```

This experiment is diagnostic evidence only. It does not define a promotion gate, tune an arm,
rerun the affordance assay, or authorize a production change. Interpret a zero action change or
zero movement credit as evidence about this fixed host/seed fixture, not as a mechanism-wide
claim. The simpler published control remains the relevant comparison in the completed assay.
