"""Episode-bounded controlled combat; experimental configs never enter gameplay.
Reproduce: python -m sim.battle_experiment --output docs/assays/battle-learning.json
This extends the legacy arena, NOT the production server physics.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import numpy as np
from mochi.battle import BattleHost, DOMAIN
from sim.battle_assay import Arena

PACK = Path('web/brains/battle-0.74.0-v1')

def published_host(seed):
    # Execute the immutable host sources, rather than assuming the working host matches.
    spec = importlib.util.spec_from_file_location('battle_control', PACK/'py/__init__.py', submodule_search_locations=[str(PACK/'py')])
    import sys
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    from battle_control.battle import BattleHost as Published
    h = Published(); h.handle({'op':'boot','domain':DOMAIN,'seed':seed})
    return h

class EpisodeArena(Arena):
    def __init__(self, distance=40):
        super().__init__(); self.distance=distance; self.last={}
    def step(self, a):
        dealt=0.; blocked=0.; waste=False
        if a==0 and self.distance<=100: dealt=min(self.enemy,8)
        elif a==3 and self.distance<=190 and not self.cooldown: dealt=min(self.enemy,14); self.cooldown=6
        elif a==1: blocked=3
        elif a==4: self.distance=max(40,self.distance-65)
        elif a==5: self.distance=min(350,self.distance+65)
        elif a not in (2,6): waste=True
        self.enemy-=dealt; self.owner=max(0,self.owner-(4-blocked))
        self.cooldown=max(0,self.cooldown-1)
        self.wins=int(self.enemy==0); self.defeats=int(self.owner==0 and not self.wins)
        self.last=dict(damage=dealt,owner_damage=4-blocked,pet_damage=0,protection=blocked,
                       wasted=int(waste),special=int(a==3 and dealt>0),terminal=bool(self.wins or self.defeats))
        return float(np.clip(dealt/45+blocked/90+.25*self.wins-(4-blocked)/60-.08*waste-.6*self.defeats,-1,1))

def run(arm, seed, episodes=120, block=20, evaluation=60):
    h = published_host(seed) if arm=='published' else BattleHost()
    if arm!='published': h.handle({'op':'boot','domain':DOMAIN,'seed':seed})
    if arm in ('weak_trace','weak_trace_terminal'):
        h.life.brain.working_memory.amplitude=.3
    rng=np.random.default_rng(seed)
    counts=[0]*7; totals=dict(wins=0, defeats=0, timeouts=0, damage=0, owner_damage=0, pet_damage=0, protection=0, wasted=0, special=0, reward=0., refused=0, decisions=0, pet_survivals=0)
    curves=[]
    for episode in range(episodes):
        # Matched initial scenarios independent of policy-dependent episode length.
        env=EpisodeArena([40,140,240][episode%3]); reward=0; terminal=False
        for tick in range(60):
            obs=env.obs()
            if arm=='random': a=int(rng.integers(7))
            elif arm=='mother': a=4 if env.distance>100 else 3 if not env.cooldown else 0
            else:
                out=h.handle({'op':'tick','obs':obs,'reward':reward})
                if out['refused']:
                    totals['refused']+=1; reward=0; continue
                a=out['action'][0]
            counts[a]+=1; totals['decisions']+=1
            reward=env.step(a)
            for key in ('damage','owner_damage','pet_damage','protection','wasted','special'): totals[key]+=env.last[key]
            terminal=env.last['terminal']
            if arm=='weak_trace_terminal': reward=np.clip(reward*3,-1,1).item()
            if arm=='no_guard_bonus': reward=float(np.clip(reward-env.last['protection']/90,-1,1))
            totals['reward']+=reward
            if terminal: break
        totals['wins']+=env.wins; totals['defeats']+=env.defeats
        totals['timeouts']+=int(not terminal); totals['pet_survivals']+=1
        if arm not in ('random','mother'):
            # Close actual last action BEFORE reset; terminal bootstrap is zero.
            h.handle({'op':'finish','obs':env.obs(),'reward':reward})
        if (episode+1)%block==0:
            curves.append(dict(episodes=episode+1,**totals,actions=counts.copy()))
    # Reload the full trained life; evaluate greedily with zero learning feedback.
    if arm not in ('random','mother'):
        checkpoint=h.handle({'op':'save'})['checkpoint']
        restored=published_host(seed) if arm=='published' else BattleHost()
        restored.handle({'op':'boot','domain':DOMAIN,'checkpoint':checkpoint})
        h=restored
        weights=np.array(h.life.brain.brain.weights)
        updates=h.life.brain.basal_ganglia.updates
    eval_rng=np.random.default_rng([seed,0xE7A1])
    measured=dict(wins=0,defeats=0,timeouts=0,damage=0,owner_damage=0,pet_damage=0,
                  protection=0,wasted=0,special=0,refused=0,decisions=0,pet_survivals=0,reward=0.,actions=[0]*7)
    for episode in range(evaluation):
        env=EpisodeArena([40,140,240][episode%3]); terminal=False
        for _ in range(60):
            if arm=='random': a=int(eval_rng.integers(7))
            elif arm=='mother': a=4 if env.distance>100 else 3 if not env.cooldown else 0
            else:
                out=h.handle({'op':'tick','obs':env.obs(),'aroused':False,'reward':0})
                if out['refused']: measured['refused']+=1; continue
                a=out['action'][0]
            measured['actions'][a]+=1; measured['decisions']+=1
            measured['reward']+=env.step(a)  # common original reward for evaluation
            for key in ('damage','owner_damage','pet_damage','protection','wasted','special'): measured[key]+=env.last[key]
            terminal=env.last['terminal']
            if terminal: break
        measured['wins']+=env.wins; measured['defeats']+=env.defeats
        measured['timeouts']+=int(not terminal); measured['pet_survivals']+=1
    if arm not in ('random','mother'):
        assert np.array_equal(weights,h.life.brain.brain.weights)
        assert updates==h.life.brain.basal_ganglia.updates
    return dict(arm=arm,seed=seed,episodes=episodes,**totals,actions=counts,curve=curves,
                evaluation=dict(episodes=evaluation,**measured))

def diagnostics():
    env=Arena(); env.distance=140; before=env.obs(); env.step(4); after=env.obs()
    defense=Arena(); r=defense.step(1)
    return dict(distance_change=dict(before=before[3],after=after[3],delta=after[3]-before[3]),
                defense_reward=r, attack_reward=Arena().step(0),
                caveats=['pet never attacked in legacy arena','defense immediate in arena; server guard lasts 1800ms',
                         'instant movement in arena; server path may be overwritten','server geometry, attack phase, owner-enemy distance, guard expiry and species range absent from 16 senses',
                         'legacy assay resets terminal state without done=True; new assay closes before reset'])

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--output',default='runs/battle-learning.json'); p.add_argument('--episodes',type=int,default=120); p.add_argument('--seeds',type=int,default=8); p.add_argument('--arms',nargs='+',default=['random','published','weak_trace','weak_trace_terminal','no_guard_bonus','mother']); args=p.parse_args()
    results=[run(a,s,args.episodes) for s in range(args.seeds) for a in args.arms]
    out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(dict(protocol='controlled legacy arena, terminal closure, 60-decision cap; no production competence claim',diagnostics=diagnostics(),results=results),indent=2)+'\n')
    for arm in sorted({r['arm'] for r in results}):
        rows=[r for r in results if r['arm']==arm]
        print(arm,{k:sum(r[k] for r in rows) for k in ('wins','defeats','timeouts','damage','wasted','decisions')},flush=True)
