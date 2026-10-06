"""Paired replica uncertainty; action validity, contribution and transfer gate."""
import argparse
import gzip
import json
from collections import Counter
from pathlib import Path
import numpy as np

def load(path):
    raw=Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)

def totals(episodes):
    keys=['wins','petDamageDealt','ownerDamageDealt','ownerDamage','petDamage','wasted','decisions','invalidAttack','invalidSpecial','approaches','attackAfterApproach','movingMs','shapedReward','reward','pathFailures']
    out={k:sum(e[k] for e in episodes) for k in keys};out['episodes']=len(episodes)
    out['actions']=np.sum([e['actions'] for e in episodes],axis=0).tolist() if episodes else [0]*7
    out['petDamageShare']=out['petDamageDealt']/max(1,out['petDamageDealt']+out['ownerDamageDealt'])
    details=[d for e in episodes for d in e['decisionDetails']]
    out['validRate']=sum(d['execution']['executable'] for d in details)/max(1,len(details))
    out['validAttackRate']=1-out['invalidAttack']/out['actions'][0] if out['actions'][0] else None
    out['validSpecialRate']=1-out['invalidSpecial']/out['actions'][3] if out['actions'][3] else None
    out['confusion']={str(a):dict(Counter(d['execution']['reasons'][0] for d in details if d['action']==a)) for a in range(7)}
    out['allReasons']={str(a):dict(Counter(reason for d in details if d['action']==a for reason in d['execution']['reasons'])) for a in range(7)}
    out['observationExecutionConfusion']=dict(Counter(f"{int(d['observation']['executable'])}->{int(d['execution']['executable'])}" for d in details))
    out['maxInvalidStreak']=max((e['maxInvalidStreak'] for e in episodes),default=0)
    times=[e['firstValidAttackMs'] for e in episodes if e['firstValidAttackMs'] is not None]
    out['episodesWithValidAttack']=len(times);out['firstValidAttackMedianMs']=float(np.median(times)) if times else None
    out['motorStops']=dict(sum((Counter(e['motorStops']) for e in episodes),Counter()))
    policies=[np.asarray(d['policy']).reshape(-1) for d in details if d['policy'] is not None]
    out['meanMaxPolicy']=float(np.mean([p.max() for p in policies])) if policies else None
    out['meanEntropy']=float(np.mean([-sum(p*np.log(np.maximum(p,1e-12))) for p in policies])) if policies else None
    return out

def summarize(data):
    assert data['complete'],'incomplete experiment'
    arms=data['protocol']['arms'];rng=np.random.default_rng(20261007)
    baseline={r['replica']:r for r in data['results'] if r['arm']=='random'}
    answer={'selection':data['selection'],'sources':data['sources'],'arms':{},'transfer':{}}
    for arm in dict.fromkeys(r['arm'] for r in data['results']):
        rows=[r for r in data['results'] if r['arm']==arm];out={phase:totals([e for r in rows for e in r[phase]]) for phase in ['training','validation','evaluation']};answer['arms'][arm]=out
        if arm not in arms:continue
        diff=np.array([np.mean([e['wins'] for e in r['evaluation']])-np.mean([e['wins'] for e in baseline[r['replica']]['evaluation']]) for r in rows])
        samples=diff[rng.integers(len(rows),size=(20000,len(rows)))].mean(axis=1)
        ev=out['evaluation'];ev['winGain']=float(diff.mean());ev['pairedReplicaBootstrap95']=np.quantile(samples,[.025,.975]).tolist();ev['familywise95']=np.quantile(samples,[.05/8,1-.05/8]).tolist()
        episodes=[e for r in rows for e in r['evaluation']];base=[e for r in baseline.values() for e in r['evaluation']]
        classes={}
        for k in ['type','distance','ownerHp','petHp','cooldown','pressure','geometry','species','latency','statScale']:
            for v in sorted({e['scenario'][k] for e in episodes},key=str):
                selected=[e for e in episodes if e['scenario'][k]==v];random=[e for e in base if e['scenario'][k]==v];t=totals(selected)
                classes[f'{k}={v}']={'episodes':len(selected),'wins':t['wins'],'randomWins':sum(e['wins'] for e in random),'winGain':(t['wins']-sum(e['wins'] for e in random))/len(selected),'petDamageShare':t['petDamageShare']}
        ev['classes']=classes
    for direction in dict.fromkeys(r['direction'] for r in data['transfer']):
        result={}
        for arm in dict.fromkeys(r['arm'] for r in data['transfer'] if r['direction']==direction):
            rows=[r for r in data['transfer'] if r['direction']==direction and r['arm']==arm];result[arm]=totals([e for r in rows for e in r['evaluation']])
            random_rows={r['replica']:r for r in data['transfer'] if r['direction']==direction and r['arm']=='random'}
            diff=np.array([np.mean([e['wins'] for e in r['evaluation']])-np.mean([e['wins'] for e in random_rows[r['replica']]['evaluation']]) for r in rows])
            samples=diff[rng.integers(len(rows),size=(20000,len(rows)))].mean(axis=1)
            result[arm]['winGain']=float(diff.mean());result[arm]['pairedReplicaBootstrap95']=np.quantile(samples,[.025,.975]).tolist()
        answer['transfer'][direction]=result
    random=answer['arms']['random']['evaluation'];published=answer['arms']['published']['evaluation']
    for arm in arms:
        ev=answer['arms'][arm]['evaluation'];reasons=[]
        if arm in ['random','published','mother']:reasons.append('control')
        if ev['winGain']<.05:reasons.append('win-gain-under-5pp')
        if ev['pairedReplicaBootstrap95'][0]<=0:reasons.append('confidence-includes-no-gain')
        if ev['validRate']<=max(random['validRate'],published['validRate']):reasons.append('validity-not-above-controls')
        if ev['petDamageShare']<=max(random['petDamageShare'],published['petDamageShare']):reasons.append('pet-share-not-above-controls')
        if min(c['winGain'] for c in ev['classes'].values())<-.1:reasons.append('scenario-collapse')
        for direction,transfer in answer['transfer'].items():
            if arm not in transfer:reasons.append(f'{direction}-not-qualified-by-transfer')
            elif transfer[arm]['wins']<transfer['random']['wins']:reasons.append(f'{direction}-transfer-regression')
        answer['arms'][arm]['promotion']={'qualified':not reasons,'failureReasons':reasons}
    return answer

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('raw');p.add_argument('summary');a=p.parse_args()
    Path(a.summary).write_text(json.dumps(summarize(load(a.raw)),indent=2)+'\n')
