import hashlib
import base64
import json
import numpy as np
from mochi.battle_worker import Worker
from mochi.battle import BattleHost

OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]

def request(key='A',version=0,checkpoint=None):
    return dict(op='execute',id=key,version=version,checkpoint=checkpoint,pack='battle-0.74.0-v1',seed=7,maxResidents=2,decision=dict(op='tick',obs=OBS,reward=.1))

def test_resident_and_cold_restore_are_exact_and_eviction_is_bounded():
    worker=Worker()
    a=worker.handle(request())
    b=worker.handle(request(version=1,checkpoint=a['checkpoint']))
    cold=Worker().handle(request(version=1,checkpoint=a['checkpoint']))
    assert b['answer']==cold['answer']
    def life(checkpoint):
        saved=json.loads(base64.b64decode(checkpoint))
        from mochi.life import Life
        from mochi.battle import SPEC
        return Life.load_bytes(SPEC,base64.b64decode(saved['life']))
    np.testing.assert_array_equal(life(b['checkpoint']).brain.brain.weights,life(cold['checkpoint']).brain.brain.weights)
    assert b['coldLoads']==1
    for key in ['B','C','D']:worker.handle(request(key))
    assert len(worker.residents)==2


def test_same_version_different_checkpoint_and_idle_expiry_force_restore():
    worker=Worker();a=worker.handle(request())
    # Another coordinator committed a different state at the same logical version.
    alternate=request();alternate['seed']=18
    other=Worker().handle(alternate)
    r=worker.handle(request(version=1,checkpoint=other['checkpoint']))
    assert r['coldLoads']==2
    idle=request(version=2,checkpoint=r['checkpoint']);idle['idleSeconds']=-1
    assert worker.handle(idle)['coldLoads']==3
