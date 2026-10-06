import base64
import json
from pathlib import Path
import numpy as np
import pytest
from sim.action_learning_host import ActionLearningHost, DOMAIN, INPUTS
from mochi.battle import ACTIONS

OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]
def boot(arm='affordance',seed=7):
    h=ActionLearningHost();h.handle(dict(op='boot',domain=DOMAIN,arm=arm,seed=seed));return h

@pytest.mark.parametrize('arm',list(INPUTS))
def test_action_indices_pending_continuation_and_freeze(arm):
    h=boot(arm);obs=OBS+[.1]*(INPUTS[arm]-16)
    assert h.spec['actions']==ACTIONS
    h.handle(dict(op='tick',obs=obs))
    saved=h.handle(dict(op='save'))['checkpoint'];b=boot(arm,18)
    b.handle(dict(op='boot',domain=DOMAIN,arm=arm,checkpoint=saved))
    for reward in [.3,-.32]:
        a=h.handle(dict(op='tick',obs=obs,reward=reward));other=b.handle(dict(op='tick',obs=obs,reward=reward))
        assert a['action']==other['action'];np.testing.assert_array_equal(h.life.brain.brain.weights,b.life.brain.brain.weights)
    h.handle(dict(op='finish',obs=obs,reward=.1))
    before=h.handle(dict(op='stats'))
    for _ in range(5):h.handle(dict(op='tick',obs=obs,frozen=True))
    h.handle(dict(op='finish',obs=obs,frozen=True))
    after=h.handle(dict(op='stats'))
    for field in ['weights','updates','memory_writes']:assert before[field]==after[field]
    with pytest.raises(ValueError):h.handle(dict(op='tick',obs=obs,frozen=True,reward=.1))

def test_new_domain_body_and_senses_cannot_cross_into_published_pack():
    from mochi.battle import BattleHost,DOMAIN as PRODUCTION
    h=boot('persistent');saved=h.handle(dict(op='save'))['checkpoint']
    with pytest.raises(ValueError):BattleHost().handle(dict(op='boot',domain=PRODUCTION,checkpoint=saved))
    with pytest.raises(ValueError):boot('penalty').handle(dict(op='boot',domain=DOMAIN,arm='penalty',checkpoint=saved))
    data=json.loads(base64.b64decode(saved));data['body']='short-hop-v1'
    with pytest.raises(ValueError):h.handle(dict(op='boot',domain=DOMAIN,arm='persistent',checkpoint=base64.b64encode(json.dumps(data).encode()).decode()))
    root=Path('web/brains/battle-0.74.0-v1')
    # The existing pack test verifies the manifest schema; pin every published byte here.
    import subprocess
    for name in subprocess.check_output(['git','ls-tree','-r','--name-only','925cdbec4399b249bbf1872a26edfaad217d2547',str(root)],text=True).splitlines():
        assert Path(name).read_bytes()==subprocess.check_output(['git','show',f'925cdbec4399b249bbf1872a26edfaad217d2547:{name}'])

def test_private_probe_does_not_change_pending_activity_rng_or_checkpoint():
    h=boot();obs=OBS+[1,1,0];h.handle(dict(op='tick',obs=obs))
    before=h.handle(dict(op='save'))['checkpoint'];stats=h.handle(dict(op='stats'))
    result=h.handle(dict(op='probe',obs=[obs,OBS+[0,0,1]]))
    assert len(result)==2
    assert h.handle(dict(op='save'))['checkpoint']==before
    for field in ['weights','updates','memory_writes']:assert h.handle(dict(op='stats'))[field]==stats[field]

def test_probe_json_wire_response_is_an_object():
    import subprocess
    import sys
    messages=[dict(op='boot',domain=DOMAIN,arm='affordance'),dict(op='probe',obs=[OBS+[1,1,0]])]
    result=subprocess.run([sys.executable,'-m','sim.action_learning_host'],input='\n'.join(json.dumps(m) for m in messages)+'\n',text=True,capture_output=True,check=True)
    answer=json.loads(result.stdout.splitlines()[-1])
    assert len(answer['probes'])==1 and answer['hostMs']>=0
