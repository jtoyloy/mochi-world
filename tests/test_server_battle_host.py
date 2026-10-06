import base64
import json
from pathlib import Path
import numpy as np
import pytest
from sim.server_battle_host import ExperimentalHost, DOMAIN

OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]
def boot(arm='published',seed=7):
    h=ExperimentalHost();h.handle(dict(op='boot',domain=DOMAIN,arm=arm,seed=seed));return h

def test_new_observation_version_does_not_load_into_published_host():
    from mochi.battle import BattleHost,DOMAIN as PRODUCTION
    h=boot('expanded');saved=h.handle(dict(op='save'))['checkpoint']
    with pytest.raises(ValueError):BattleHost().handle(dict(op='boot',domain=PRODUCTION,checkpoint=saved))
    with pytest.raises(ValueError):boot().handle(dict(op='boot',domain=DOMAIN,arm='published',checkpoint=saved))
    for obs in ([0]*25,[float('nan')]*26,[2]*26):
        with pytest.raises(ValueError):h.handle(dict(op='tick',obs=obs))

def test_real_trading_life_cannot_be_loaded_or_mutated_by_experimental_battle():
    root=Path('web/brains/traders-0.74.0-v1');data=(root/'basic.life').read_bytes()
    wrapper=base64.b64encode(json.dumps(dict(domain=DOMAIN,arm='published',life=base64.b64encode(data).decode())).encode()).decode()
    with pytest.raises(ValueError):boot().handle(dict(op='boot',domain=DOMAIN,arm='published',checkpoint=wrapper))
    h=boot();h.handle(dict(op='tick',obs=OBS));h.handle(dict(op='tick',obs=OBS,reward=.3))
    assert (root/'basic.life').read_bytes()==data

def test_pending_and_expanded_checkpoint_continue_exactly():
    h=boot('expanded');obs=OBS+[.1]*10;h.handle(dict(op='tick',obs=obs))
    snapshot=h.handle(dict(op='save'))['checkpoint'];b=boot('expanded',18)
    b.handle(dict(op='boot',domain=DOMAIN,arm='expanded',checkpoint=snapshot))
    for reward in [.3,-.08]:
        assert h.handle(dict(op='tick',obs=obs,reward=reward))['action']==b.handle(dict(op='tick',obs=obs,reward=reward))['action']
        np.testing.assert_array_equal(h.life.brain.brain.weights,b.life.brain.brain.weights)

def test_frozen_reads_do_not_learn_and_finish_closes_exactly_once():
    h=boot();h.handle(dict(op='tick',obs=OBS));h.handle(dict(op='finish',obs=OBS,reward=.2))
    before=h.handle(dict(op='stats'))
    h.handle(dict(op='finish',obs=OBS,reward=.2))
    for _ in range(5):h.handle(dict(op='tick',obs=OBS,frozen=True))
    h.handle(dict(op='finish',obs=OBS,frozen=True))
    after=h.handle(dict(op='stats'))
    for key in ('weights','updates','memory_writes'):assert before[key]==after[key]
    with pytest.raises(ValueError):h.handle(dict(op='tick',obs=OBS,frozen=True,reward=.2))

def test_unexecuted_choice_is_cancelled_without_fabricated_credit():
    h=boot();h.handle(dict(op='tick',obs=OBS));before=h.handle(dict(op='stats'))
    h.handle(dict(op='cancel',reward=.7))
    assert h.life.brain.basal_ganglia._pending is None
    assert h.handle(dict(op='stats'))['updates']==before['updates']
    assert h.life.counters['dropped']==1

def test_delayed_guard_credit_uses_its_saved_cue_not_later_action_and_rejects_replay():
    h=boot('causal');guard=None
    for _ in range(50):
        result=h.handle(dict(op='tick',obs=OBS,reward=0))
        h.handle(dict(op='executed',decisionId=result['decisionId']))
        if result['action'][0] in (1,2):guard=result;break
    assert guard is not None
    later=OBS.copy();later[3]=.6
    later_action=h.handle(dict(op='tick',obs=later,reward=0))
    h.handle(dict(op='executed',decisionId=later_action['decisionId']))
    assert later_action['decisionId']!=guard['decisionId']
    snapshot=h.handle(dict(op='save'))['checkpoint'];b=boot('causal',18)
    b.handle(dict(op='boot',domain=DOMAIN,arm='causal',checkpoint=snapshot))
    credit=dict(eventId=100,decisionId=guard['decisionId'],reward=.2)
    updates=h.life.brain.basal_ganglia.updates
    writes=h.life.brain.hippocampus.writes
    pending=h.life.brain.basal_ganglia._pending
    captured=[];observe=h.life.brain.hippocampus.observe
    def audit(key,target,**kwargs):
        captured.append(np.array(key));return observe(key,target,**kwargs)
    h.life.brain.hippocampus.observe=audit
    h.credit([credit]);b.credit([credit])
    np.testing.assert_array_equal(captured[-1],np.asarray(OBS)[None,:])
    assert not np.array_equal(captured[-1],np.asarray(later)[None,:])
    assert h.life.brain.basal_ganglia.updates==updates
    assert h.life.brain.basal_ganglia._pending is pending
    assert h.life.brain.hippocampus.writes==writes+1
    with pytest.raises(ValueError):h.credit([credit])
    assert h.handle(dict(op='tick',obs=OBS,reward=-.08))['action']==b.handle(dict(op='tick',obs=OBS,reward=-.08))['action']
    with pytest.raises(ValueError):h.credit([dict(eventId=101,decisionId=9999,reward=.2)])
