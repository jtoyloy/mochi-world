import base64
import json
from pathlib import Path
import numpy as np
import pytest
from mochi.battle import BattleHost, DOMAIN
from sim.battle_experiment import EpisodeArena, published_host
OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]


def test_terminal_state_is_observed_before_reset():
    arena=EpisodeArena(); arena.enemy=8
    assert arena.step(0)>0
    assert arena.last['terminal'] and arena.obs()[2]==0


def test_published_control_is_immutable_and_same_seed():
    h=published_host(42); b=BattleHost(); b.handle({'op':'boot','domain':DOMAIN,'seed':42})
    assert h.handle({'op':'tick','obs':OBS})['action']==b.handle({'op':'tick','obs':OBS})['action']
    import hashlib
    root=Path('web/brains/battle-0.74.0-v1')
    for name,digest in json.loads((root/'manifest.json').read_text())['hashes'].items():
        assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest


def test_battle_rejects_real_trading_checkpoint_even_with_forged_envelope():
    from mochi.life import Life
    root=Path('web/brains/traders-0.74.0-v1')
    payload=(root/'basic.life').read_bytes()
    snapshot=payload
    h=BattleHost()
    for checkpoint in (base64.b64encode(payload).decode(),base64.b64encode(json.dumps({'domain':DOMAIN,'pack':'battle-0.74.0-v1','life':base64.b64encode(payload).decode()}).encode()).decode()):
        with pytest.raises((ValueError,UnicodeDecodeError)):
            h.handle({'op':'boot','domain':DOMAIN,'checkpoint':checkpoint})
    assert (root/'basic.life').read_bytes()==snapshot
    h.handle({'op':'boot','domain':DOMAIN,'seed':7})
    for _ in range(8): h.handle({'op':'tick','obs':OBS,'reward':.2})
    assert (root/'basic.life').read_bytes()==snapshot


def test_reward_credits_previous_action_exactly_once():
    h=published_host(7); h.handle({'op':'tick','obs':OBS})
    updates=h.life.brain.basal_ganglia.updates
    h.handle({'op':'finish','obs':OBS,'reward':.5})
    assert h.life.brain.basal_ganglia.updates==updates+1
    h.handle({'op':'finish','obs':OBS,'reward':0})
    assert h.life.brain.basal_ganglia.updates==updates+1


def test_candidate_trace_and_pending_credit_survive_checkpoint_continuation():
    a=BattleHost(); a.handle({'op':'boot','domain':DOMAIN,'seed':18})
    a.life.brain.working_memory.amplitude=.3
    a.handle({'op':'tick','obs':OBS})
    saved=a.handle({'op':'save'})['checkpoint']
    b=BattleHost(); b.handle({'op':'boot','domain':DOMAIN,'checkpoint':saved})
    assert b.life.brain.working_memory.amplitude==.3
    for distance,reward in [(.4,-.08),(.2,.3),(.1,-.2)]:
        obs=OBS.copy(); obs[3]=distance
        left=a.handle({'op':'tick','obs':obs,'reward':reward})
        right=b.handle({'op':'tick','obs':obs,'reward':reward})
        assert left['action']==right['action']
        assert left['learning']==right['learning']
        np.testing.assert_array_equal(a.life.brain.brain.weights,b.life.brain.brain.weights)
    a.handle({'op':'finish','obs':obs,'reward':.25})
    b.handle({'op':'finish','obs':obs,'reward':.25})
    np.testing.assert_array_equal(a.life.brain.brain.weights,b.life.brain.brain.weights)


def test_episode_harness_closes_training_and_freezes_reloaded_evaluation():
    from sim.battle_experiment import run
    a=run('no_guard_bonus',7,episodes=3,block=1,evaluation=3)
    b=run('no_guard_bonus',7,episodes=3,block=1,evaluation=3)
    assert a==b
    assert sum(a[k] for k in ('wins','defeats','timeouts'))==3
    assert sum(a['evaluation'][k] for k in ('wins','defeats','timeouts'))==3
    assert sum(a['actions'])==a['decisions']
    assert sum(a['evaluation']['actions'])==a['evaluation']['decisions']
