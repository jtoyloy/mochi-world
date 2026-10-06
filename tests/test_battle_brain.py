import base64
import json
import numpy as np
import pytest
from mochi.battle import BattleHost, DOMAIN

OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]
def boot(seed=42):
    h=BattleHost();h.handle({'op':'boot','domain':DOMAIN,'seed':seed});return h

def test_battle_domains_and_invalid_observations():
    h=BattleHost()
    with pytest.raises(ValueError):h.handle({'op':'boot','domain':'trading'})
    h=boot()
    for x in [[1]*15,[float('nan')]*16,[2]*16]:
        with pytest.raises(ValueError):h.handle({'op':'tick','obs':x})
    for r in [float('nan'),2,-2]:
        with pytest.raises(ValueError):h.handle({'op':'tick','obs':OBS,'reward':r})
    wrong=base64.b64encode(json.dumps({'domain':'trading','life':''}).encode()).decode()
    with pytest.raises(ValueError):h.handle({'op':'boot','domain':DOMAIN,'checkpoint':wrong})

def test_real_reward_changes_cadence_weights_and_saved_pending_continuation():
    h=boot();h.handle({'op':'tick','obs':OBS})
    before=np.array(h.life.brain.brain.weights)
    h.handle({'op':'tick','obs':OBS,'reward':.3})
    assert h.life.brain.basal_ganglia.updates==1
    assert not np.array_equal(before,h.life.brain.brain.weights)
    checkpoint=h.handle({'op':'save'})['checkpoint']
    other=boot(7);other.handle({'op':'boot','domain':DOMAIN,'checkpoint':checkpoint})
    a=h.handle({'op':'tick','obs':OBS,'reward':-.08})
    b=other.handle({'op':'tick','obs':OBS,'reward':-.08})
    assert a['action']==b['action']
    assert a['learning']==b['learning']
    np.testing.assert_array_equal(h.life.brain.brain.weights,other.life.brain.brain.weights)

def test_battle_does_not_mutate_a_separate_trading_life():
    from mochi.host import Host
    from pathlib import Path
    pack=Path('web/brains/traders-0.74.0-v1')
    spec=json.loads((pack/'manifest.json').read_text())['spec']
    trade=Host();trade.handle({'op':'boot','spec':spec,'path':str(pack/'basic.life')})
    import io,zipfile
    def content(payload):
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(payload))) as z:return {name:z.read(name) for name in z.namelist()}
    snapshot=content(trade.handle({'op':'save'})['npz'])
    battle=boot(18);battle.handle({'op':'tick','obs':OBS});battle.handle({'op':'tick','obs':OBS,'reward':.7})
    assert content(trade.handle({'op':'save'})['npz'])==snapshot

def test_actual_feedback_is_closed_once_without_an_unexecuted_followup_action():
    h=boot();h.handle({'op':'tick','obs':OBS});h.handle({'op':'finish','obs':OBS,'reward':.4})
    assert h.life.brain.basal_ganglia._pending is None
    updates=h.life.brain.basal_ganglia.updates
    h.handle({'op':'finish','obs':OBS,'reward':.4})
    assert h.life.brain.basal_ganglia.updates==updates

def test_constant_close_range_learning_control_counts_executed_actions():
    h=boot();reward=0;good=0
    for _ in range(120):
        result=h.handle({'op':'tick','obs':OBS,'reward':reward})
        assert not result['refused']
        a=result['action'][0];good+=a in (0,3)
        reward=.3 if a in (0,3) else -.08
    # A narrow acquisition assay, not a claim about open-world fighting.
    assert good>=80
    assert h.life.brain.basal_ganglia.updates==119

def test_matched_brains_develop_different_free_actions_after_different_feedback():
    choices=[]
    for goal in [0,1]:
        h=boot(42);reward=0
        for _ in range(160):
            a=h.handle({'op':'tick','obs':OBS,'reward':reward})['action'][0]
            reward=.3 if a==goal else -.08
        h.handle({'op':'finish','obs':OBS,'reward':reward})
        choices.append(h.handle({'op':'tick','obs':OBS,'aroused':False})['action'][0])
    assert choices==[0,1]
