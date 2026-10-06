"""Narrow, synthetic action/outcome association control. No fighting competence claim."""
import json
import numpy as np
from mochi.battle import BattleHost,DOMAIN
OBS=[.9,.9,.8,.1,.16,0,0,.2,0,0,0,0,0,0,1,1]
def run(goal):
    h=BattleHost();h.handle({'op':'boot','domain':DOMAIN,'seed':42});reward=0;counts=[0]*7
    for _ in range(600):
        a=h.handle({'op':'tick','obs':OBS,'reward':reward})['action'][0]
        counts[a]+=1;reward=.3 if a==goal else -.08
    h.handle({'op':'finish','obs':OBS,'reward':reward})
    free=h.handle({'op':'tick','obs':OBS,'aroused':False})['action'][0]
    rng=np.random.default_rng(42);random_hits=sum(int(rng.integers(7))==goal for _ in range(600))
    return {'reinforced_action':goal,'cadence_hits':counts[goal],'random_hits':random_hits,'mother_hits':600,'ticks':600,'actions':counts,'free_action_after_feedback':free,'updates':h.life.brain.basal_ganglia.updates}
if __name__=='__main__':print(json.dumps([run(g) for g in [0,1,4]],indent=2))
