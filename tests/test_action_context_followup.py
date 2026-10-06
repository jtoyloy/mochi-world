from sim.action_context_followup import CONTEXTS, context, run


def test_predeclared_contexts_are_normalized_and_distinct():
    rows = [context(k) for k in CONTEXTS]
    assert all(len(row) == 19 and all(0 <= v <= 1 for v in row) for row in rows)
    assert rows[0] != rows[1] and rows[2] != rows[3]


def test_followup_is_isolated_and_records_real_updates():
    result = run(seed=7404, repetitions=2)
    assert result["protocol"] == "wave4-context-followup-v1"
    assert result["domain"] == "cadence-action-learning-v1"
    assert set(result["contexts"]) == set(CONTEXTS)
    assert len(result["transitions"]) == 4
    assert result["updatesDelta"] >= 0 and result["memoryWritesDelta"] >= 0
    assert result["delayedMovementCredit"]["pairs"] == 2
