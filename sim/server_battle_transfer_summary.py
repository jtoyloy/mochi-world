"""Seed-paired leave-one-species-out summaries, no model selection."""
import argparse
import json
from pathlib import Path
import numpy as np
from sim.server_battle_summary import load

def summarize(data):
    assert data['complete']
    rng=np.random.default_rng(20261007);summary={}
    for direction in range(2):
        rows=[r for r in data['results'] if r['direction']==direction]
        random={r['replica']:r for r in rows if r['arm']=='random'}
        label=f"{rows[0]['trainSpecies']} to {rows[0]['evalSpecies']}";arms={}
        for arm in data['protocol']['arms']:
            selected=[r for r in rows if r['arm']==arm];phases={}
            for phase in ['training','evaluation']:
                episodes=[e for r in selected for e in r[phase]]
                keys=['wins','defeats','timeouts','ownerSurvival','petSurvival','ownerHp','petHp','petDamageDealt','ownerDamageDealt','ownerDamage','petDamage','protection','causalProtection','delayedProtection','wasted','invalidAttack','invalidSpecial','specials','specialDamage','pathFailures','decisions']
                totals={k:sum(e[k] for e in episodes) for k in keys};totals['episodes']=len(episodes)
                totals['actions']=np.sum([e['actions'] for e in episodes],axis=0).tolist()
                totals['winsBySeed']=[sum(e['wins'] for e in r[phase]) for r in selected]
                delta=np.array([np.mean([e['wins'] for e in r[phase]])-np.mean([e['wins'] for e in random[r['replica']][phase]]) for r in selected])
                samples=delta[rng.integers(len(delta),size=(10000,len(delta)))].mean(axis=1)
                totals['pairedWinRateDifference']=float(delta.mean());totals['pairedSeedBootstrap95']=np.quantile(samples,[.025,.975]).tolist()
                phases[phase]=totals
            arms[arm]=phases
        summary[label]=arms
    return dict(protocol=data['protocol'],directions=summary)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('raw');p.add_argument('summary');a=p.parse_args()
    Path(a.summary).write_text(json.dumps(summarize(load(a.raw)),indent=2)+'\n')
