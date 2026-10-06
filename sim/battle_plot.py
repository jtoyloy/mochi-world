"""Render block win-rate curves with between-seed standard errors (not CI)."""
import argparse
import json
from pathlib import Path
import numpy as np

def plot(source, output):
    # Matplotlib is optional and does not affect experiment execution.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    rows=json.loads(Path(source).read_text())['results']
    fig, ax=plt.subplots(figsize=(8,4))
    for arm in sorted({r['arm'] for r in rows}):
        chosen=[r for r in rows if r['arm']==arm]
        episodes=np.array([p['episodes'] for p in chosen[0]['curve']])
        wins=np.array([[p['wins'] for p in r['curve']] for r in chosen])
        rates=np.diff(wins,axis=1,prepend=0)/np.diff(episodes,prepend=0)
        mean=rates.mean(axis=0); se=rates.std(axis=0,ddof=1)/np.sqrt(len(rates))
        ax.plot(episodes,mean,label={'published':'Published control','weak_trace':'Trace 0.3','weak_trace_terminal':'Trace 0.3 + reward ×3','no_guard_bonus':'No protection bonus','random':'Uniform random','mother':'Mother'}.get(arm,arm)); ax.fill_between(episodes,mean-se,mean+se,alpha=.12)
    ax.set(xlabel='Training episodes',ylabel='Wins / episodes in block',ylim=(0,1),title=f'Controlled combat: {len(chosen)} seeds; shading ±1 SE')
    ax.legend(); fig.tight_layout(); fig.savefig(output)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');a=p.parse_args();plot(a.source,a.output)
