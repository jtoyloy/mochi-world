"""Pin extension identity, real Cadence continuation and explicit reward ownership."""
import json
from pathlib import Path
import numpy as np
from mochi.life import Life
from mochi.host import Host

PACK=Path('web/brains/traders-0.74.0-v1')
SPEC=json.loads((PACK/'manifest.json').read_text())['spec']

def test_extension_preserves_original_sensory_and_motor_contract():
    original=json.loads(Path('web/brains/mochi-0.74.0-a/manifest.json').read_text())['spec']
    assert SPEC['senses'][:-1]==original['senses']
    assert SPEC['actions'][:17]==original['actions']
    assert SPEC['inputs']==253

def test_real_brain_continues_after_save_and_reload():
    a=Life.load_bytes(SPEC,(PACK/'basic.life').read_bytes())
    obs=np.full((1,253),.1)
    result=a.tick(obs,[0],aroused=True)
    assert not result['refused']
    b=Life.load_bytes(SPEC,a.save_bytes())
    x=a.tick(obs,[.1],aroused=True)
    y=b.tick(obs,[.1],aroused=True)
    assert x['action']==y['action']
    assert x['mode']==y['mode']
    np.testing.assert_allclose(a.brain.brain.weights,b.brain.brain.weights)

def test_interval_reward_writes_owned_action_without_replacing_pet_pending():
    host=Host();host.handle({'op':'boot','spec':SPEC,'path':str(PACK/'basic.life')})
    obs=np.full((1,253),.1)
    host.handle({'op':'tick','obs':obs.tolist(),'reward':[0],'aroused':True})
    before=host.life.brain.basal_ganglia._pending
    count=host.life.brain.hippocampus.writes
    host.handle({'op':'trade_credit','obs':obs[0].tolist(),'action':18,'reward':.2})
    assert host.life.brain.hippocampus.writes==count+1
    assert host.life.brain.basal_ganglia._pending is before
