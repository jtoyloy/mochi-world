"""Seed-level summaries; bootstrap paired seed differences, never iid episodes."""
import json
from pathlib import Path
import numpy as np


def summarize(path):
    rows=json.loads(Path(path).read_text())['results']
    random={r['seed']:r for r in rows if r['arm']=='random'}
    rng=np.random.default_rng(20261006)
    summary={}
    for arm in sorted({r['arm'] for r in rows}):
        chosen=[r for r in rows if r['arm']==arm]
        result={}
        for phase in ('training','evaluation'):
            samples=[r if phase=='training' else r['evaluation'] for r in chosen]
            paired=np.array([(r if phase=='training' else r['evaluation'])['wins']/(r if phase=='training' else r['evaluation'])['episodes']-
                             (random[r['seed']] if phase=='training' else random[r['seed']]['evaluation'])['wins']/(random[r['seed']] if phase=='training' else random[r['seed']]['evaluation'])['episodes'] for r in chosen])
            boot=paired[rng.integers(len(paired),size=(10000,len(paired)))].mean(axis=1)
            result[phase]={key:sum(s[key] for s in samples) for key in ('episodes','wins','defeats','timeouts','damage','owner_damage','pet_damage','protection','wasted','special','decisions','refused','pet_survivals','reward')}
            result[phase].update(actions=np.sum([s['actions'] for s in samples],axis=0).tolist(),
                                 wins_by_seed=[s['wins'] for s in samples],
                                 paired_win_rate_difference=float(paired.mean()),
                                 paired_seed_bootstrap_95=np.quantile(boot,[.025,.975]).tolist(),
                                 seeds_beating_random=int(sum(paired>0)))
        summary[arm]=result
    return summary

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args()
    Path(a.output).write_text(json.dumps(summarize(a.source),indent=2)+'\n')
