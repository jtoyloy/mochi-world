"""Physical cue contrasts on diagnostic clones, with/without working trace."""
import argparse
import json
from pathlib import Path
import numpy as np
from sim.action_learning_host import ActionLearningHost, DOMAIN

def summarize(directory):
    rows=[]
    for path in sorted(Path(directory).glob('*.json')):
        data=json.loads(path.read_text());h=ActionLearningHost()
        h.handle(dict(op='boot',domain=DOMAIN,arm=data['arm'],checkpoint=data['checkpoint']))
        h.life.start_streams()
        cleared=h.handle(dict(op='probe',obs=[c['obs'] for c in data['contexts']]))
        row={k:data[k] for k in ['arm','replica','contexts','fresh','trained']};row['traceCleared']=cleared
        row['contextDiscrimination']={}
        for label,results in [('fresh',data['fresh']),('trained',data['trained']),('traceCleared',cleared)]:
            ps=np.array([r['policy'] for r in results if r['qualified']])
            row['contextDiscrimination'][label]={'qualified':len(ps),'argmaxActions':[r['action'] for r in results],'maxPairwiseL1':float(max((np.abs(a-b).sum() for a in ps for b in ps),default=0)),'meanMaxProbability':float(ps.max(axis=1).mean()) if len(ps) else None}
        rows.append(row)
    return {'diagnosticSeeds':'7000..7002, 60 identical training episodes; contexts from 6999, never used for selection','rows':rows}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('output');a=p.parse_args();Path(a.output).write_text(json.dumps(summarize(a.directory),indent=2)+'\n')
