"""Seed-paired summaries and learning curves for the predeclared server-physics protocol."""
import argparse
import gzip
import json
from pathlib import Path
import numpy as np

def load(path):
    return json.loads(gzip.decompress(Path(path).read_bytes()) if str(path).endswith('.gz') else Path(path).read_text())

def summarize(data):
    assert data['complete']
    random={row['replica']:row for row in data['results'] if row['arm']=='random'}
    rng=np.random.default_rng(20261006)
    answer=dict(protocol=data['protocol'],sources=data['sources'],arms={},latencyMs={})
    for arm in data['arms']:
        chosen=[r for r in data['results'] if r['arm']==arm];phases={}
        for phase in ['training','validation','evaluation']:
            episodes=[e for r in chosen for e in r[phase]]
            keys=['wins','defeats','timeouts','ownerSurvival','petSurvival','ownerHp','petHp','petDamageDealt','ownerDamageDealt','ownerDamage','petDamage','protection','causalProtection','delayedProtection','wasted','invalidAttack','invalidSpecial','staleAttack','staleSpecial','pathFailures','specials','specialDamage','guardActions','decisions','refused','discardedResponses','latencyOutcomeDropped','latencyRewardDropped','reward','timeMs']
            totals={k:sum(e[k] for e in episodes) for k in keys}
            totals['episodes']=len(episodes);totals['actions']=np.sum([e['actions'] for e in episodes],axis=0).tolist()
            totals['winsBySeed']=[sum(e['wins'] for e in r[phase]) for r in chosen]
            differences=np.array([np.mean([e['wins'] for e in r[phase]])-np.mean([e['wins'] for e in random[r['replica']][phase]]) for r in chosen])
            samples=differences[rng.integers(len(chosen),size=(10000,len(chosen)))].mean(axis=1)
            totals['pairedWinRateDifference']=float(differences.mean());totals['pairedSeedBootstrap95']=np.quantile(samples,[.025,.975]).tolist()
            totals['pairedSeedBootstrapBonferroni95']=np.quantile(samples,[.05/12,1-.05/12]).tolist()
            totals['seedsBeatingRandom']=int(sum(differences>0))
            times=[e['killMs'] for e in episodes if e['killMs'] is not None]
            totals['killMsMedian']=float(np.median(times)) if times else None
            totals['specialEfficiency']=totals['specials']/max(1,totals['actions'][3])
            totals['defenseAvoidedPerGuard']=totals['causalProtection']/max(1,totals['guardActions'])
            totals['meanOwnerHp']=totals['ownerHp']/len(episodes);totals['meanPetHp']=totals['petHp']/len(episodes)
            totals['petDamageShare']=totals['petDamageDealt']/max(1,totals['petDamageDealt']+totals['ownerDamageDealt'])
            if phase=='evaluation':
                classes={}
                for key in ['type','distance','ownerHp','petHp','cooldown','pressure','geometry','species','latency','statScale']:
                    for value in sorted({e['scenario'][key] for e in episodes},key=str):
                        selected=[e for e in episodes if e['scenario'][key]==value]
                        baseline=[e for r in random.values() for e in r[phase] if e['scenario'][key]==value]
                        classes[f'{key}={value}']=dict(episodes=len(selected),wins=sum(e['wins'] for e in selected),randomWins=sum(e['wins'] for e in baseline),difference=sum(e['wins'] for e in selected)/len(selected)-sum(e['wins'] for e in baseline)/len(baseline),petSurvival=sum(e['petSurvival'] for e in selected),timeouts=sum(e['timeouts'] for e in selected))
                totals['classes']=classes
            phases[phase]=totals
        e=phases['evaluation']
        phases['promotionQualified']=arm not in ('random','mother','published') and e['pairedWinRateDifference']>=.05 and e['pairedSeedBootstrap95'][0]>0 and min(c['difference'] for c in e['classes'].values())>=-.1
        answer['arms'][arm]=phases
    for op in ['boot','tick','save','finish']:
        samples=[r for r in data['timing'] if r['op']==op]
        answer['latencyMs'][op]={k:{'n':len(samples),**dict(zip(['p50','p95','p99'],np.quantile([r[k] for r in samples],[.5,.95,.99]).tolist()))} for k in ['wallMs','hostMs']}
    answer['frozenCpuSeconds']=sum(p['cpuSeconds'] for p in data['profiles'])
    answer['nativeHighWaterRssBytes']=max(p['rssBytes'] for p in data['profiles'])
    return answer

def plot(data,path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    labels={'random':'Random','published':'Published','no_protection':'No protection','expanded':'26 senses','causal':'Causal credit','expanded_causal':'26 senses + causal','terminal':'Terminal emphasis','mother':'Reference'}
    fig,(ax,bx)=plt.subplots(1,2,figsize=(12,4))
    for arm in data['arms']:
        rows=[r for r in data['results'] if r['arm']==arm]
        counts=np.array([[c['wins'] for c in r['curve']] for r in rows]);x=np.array([c['episodes'] for c in rows[0]['curve']]);rates=np.diff(counts,prepend=0,axis=1)/np.diff(x,prepend=0)
        mean=rates.mean(axis=0);se=rates.std(axis=0,ddof=1)/np.sqrt(len(rows))
        ax.plot(x,mean,label=labels[arm]);ax.fill_between(x,mean-se,mean+se,alpha=.08)
    summary=summarize(data);arms=data['arms'];rates=[summary['arms'][a]['evaluation']['wins']/summary['arms'][a]['evaluation']['episodes'] for a in arms]
    bx.bar(range(len(arms)),rates,color=['#888' if a in ['random','mother'] else '#5986ab' for a in arms]);bx.set_xticks(range(len(arms)),[labels[a] for a in arms],rotation=50,ha='right')
    ax.set(xlabel='Training episodes',ylabel='Block win fraction',ylim=(0,1),title='12 seed replicates; shading ±1 SE');ax.legend(fontsize=7,ncol=2)
    bx.set(ylabel='Frozen held-out win fraction',ylim=(0,1),title='432 matched held-out encounters per arm')
    fig.tight_layout();fig.savefig(path)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('raw');p.add_argument('summary');p.add_argument('--plot');a=p.parse_args();data=load(a.raw)
    Path(a.summary).write_text(json.dumps(summarize(data),indent=2)+'\n')
    if a.plot:plot(data,a.plot)
