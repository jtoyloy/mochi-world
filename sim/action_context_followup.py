"""Small, predeclared context-discrimination experiment.

This is an isolated diagnostic host.  It never loads a production life or changes a
published pack.  The contexts differ only in declared physical possibility bits;
the action set remains unmasked.
"""
import json
import math
from pathlib import Path
import numpy as np

from sim.action_learning_host import ActionLearningHost, DOMAIN, INPUTS

ARM = "affordance"
CONTEXTS = ("near_ready", "far_ready", "special_ready", "special_unavailable")


def context(label):
    x = np.full(INPUTS[ARM], .2, dtype=float)
    # Keep the ordinary battle state identical; only the measured possibility
    # senses at the end vary (attack, special, approach).
    x[0:5] = [.8, .8, .5, .1, .2]
    bits = {
        "near_ready": (1, 1, 0),
        "far_ready": (0, 1, 1),
        "special_ready": (1, 1, 0),
        "special_unavailable": (1, 0, 0),
    }[label]
    x[-3:] = bits
    return x.tolist()


def entropy(policy):
    p = np.asarray(policy, dtype=float)
    return float(-(p * np.log(np.maximum(p, 1e-15))).sum())


def probes(host, labels):
    rows = host.handle({"op": "probe", "obs": [context(k) for k in labels]})
    return [{"label": k, "action": int(row["action"]),
             "entropy": entropy(row["policy"]), "policy": row["policy"]}
            for k, row in zip(labels, rows)]


def run(seed=7404, repetitions=24):
    host = ActionLearningHost()
    host.handle({"op": "boot", "domain": DOMAIN, "arm": ARM, "seed": seed})
    labels = list(CONTEXTS)
    fresh = probes(host, labels)
    before = host.handle({"op": "stats"})
    transitions = []
    for i in range(repetitions):
        # A fixed far -> near pair tests delayed credit for approach.  The body
        # reports the actually selected action; no action is substituted.
        for label, reward in (("far_ready", .35), ("near_ready", .55)):
            obs = context(label)
            tick = host.handle({"op": "tick", "obs": obs, "reward": reward})
            action = int(tick.get("action", [-1])[0])
            transitions.append({"round": i, "context": label, "action": action,
                                "refused": bool(tick.get("refused")),
                                "decisionId": tick.get("decisionId")})
            if tick.get("decisionId") is not None:
                host.handle({"op": "executed", "decisionId": tick["decisionId"]})
        host.handle({"op": "finish", "obs": context("near_ready"), "reward": .15})
    trained = probes(host, labels)
    after = host.handle({"op": "stats"})
    action_changes = sum(a["action"] != b["action"] for a, b in zip(fresh, trained))
    return {"protocol": "wave4-context-followup-v1", "domain": DOMAIN, "arm": ARM,
            "seed": seed, "repetitions": repetitions, "contexts": labels,
            "fresh": fresh, "trained": trained, "actionChanges": action_changes,
            "updatesDelta": after["updates"] - before["updates"],
            "memoryWritesDelta": after["memory_writes"] - before["memory_writes"],
            "transitions": transitions,
            "delayedMovementCredit": {"pairs": repetitions,
                "farApproach": sum(t["action"] == 4 for t in transitions if t["context"] == "far_ready"),
                "nearAttack": sum(t["action"] == 0 for t in transitions if t["context"] == "near_ready")}}


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=7404)
    p.add_argument("--repetitions", type=int, default=24)
    p.add_argument("--output", type=Path)
    a = p.parse_args()
    result = run(a.seed, a.repetitions)
    text = json.dumps(result, indent=2) + "\n"
    if a.output: a.output.write_text(text)
    else: print(text, end="")
