"""Measured local battle acquisition control, not a general combat competence claim.
Run .venv/bin/python -m sim.battle_assay. Each action executes in the same small arena.
No teacher is consulted by the measured Cadence arm. Random and disclosed mother controls.
"""
import json
import numpy as np
from mochi.battle import BattleHost,DOMAIN

class Arena:
    def __init__(self):self.owner=100.;self.pet=80.;self.enemy=45.;self.distance=40.;self.cooldown=0;self.wins=0;self.defeats=0;self.damage=0;self.protection=0
    def obs(self):return [self.owner/100,self.pet/80,self.enemy/45,self.distance/400,1/6,1,0,.2,0,0,self.cooldown/6,0,0,0,1,1]
    def step(self,a):
        dealt=0;blocked=0;waste=False
        if a==0 and self.distance<=100:dealt=min(self.enemy,8)
        elif a==3 and self.distance<=190 and not self.cooldown:dealt=min(self.enemy,14);self.cooldown=6
        elif a==1:blocked=3
        elif a==4:self.distance=max(40,self.distance-65)
        elif a==5:self.distance=min(350,self.distance+65)
        elif a not in (2,6):waste=True
        self.enemy=max(0,self.enemy-dealt);self.damage+=dealt;self.protection+=blocked
        incoming=4-blocked;self.owner=max(0,self.owner-incoming);victory=self.enemy==0
        reward=max(-1,min(1,dealt/45+blocked/90+(.25 if victory else 0)-incoming/60-(.08 if waste else 0)-(.6 if self.owner==0 else 0)))
        self.cooldown=max(0,self.cooldown-1)
        if victory:self.wins+=1;self.enemy=45;self.owner=100;self.distance=40
        elif self.owner==0:self.defeats+=1;self.enemy=45;self.owner=100;self.distance=40
        return reward

def run(kind,seed,ticks=600):
    env=Arena();rng=np.random.default_rng(seed);h=BattleHost();h.handle({'op':'boot','domain':DOMAIN,'seed':seed});reward=0;counts=[0]*7;refused=0
    for i in range(ticks):
        x=env.obs()
        if kind=='cadence':
            result=h.handle({'op':'tick','obs':x,'reward':reward});a=result['action'][0]
            if result['refused']:refused+=1;reward=0;continue
        elif kind=='random':a=int(rng.integers(7))
        else:a=4 if env.distance>100 else 3 if not env.cooldown else 0
        counts[a]+=1;reward=env.step(a)
    return {'kind':kind,'seed':seed,'ticks':ticks,'wins':env.wins,'owner_defeats':env.defeats,'damage':env.damage,'protection':env.protection,'actions':counts,'refused':refused,'reward_updates':h.life.brain.basal_ganglia.updates if kind=='cadence' else 0}

if __name__=='__main__':print(json.dumps([run(k,s) for s in [42,7,18] for k in ['random','mother','cadence']],indent=2))
