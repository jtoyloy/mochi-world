"""Static scientific figure from measured certification summary, no model data."""
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
r=json.loads(Path('docs/assays/ccu-certification.json').read_text())
rows=sorted([x for x in r['rows'] if 'stage' in x['file'] and x.get('durationSeconds')],key=lambda x:x['users'])
fig,axes=plt.subplots(1,2,figsize=(11,4))
axes[0].bar([str(x['users']) for x in rows],[x['tick']['max'] for x in rows],color='#cf7357')
axes[0].axhline(100,color='black',linestyle='--',label='100ms acceptance limit')
axes[0].set(xlabel='Concurrent users',ylabel='Maximum movement pass (ms)',title='Measured distributed load');axes[0].legend()
for x in rows:
 s=x['checkpoint'].get('series') or []
 if x['users']==150 and s:
  d=[p for p in x.get('disk',[]) if p['at']>=s[0]['at'] and p.get('checkpointDisk',{}).get('bytes',0)>0]
  axes[1].plot([(p['at']-s[0]['at'])/60000 for p in d],[p['checkpointDisk']['bytes']/2**30 for p in d],linestyle='--',color='#bc6b25',label='150 physical files (stopped)')
 if s:axes[1].plot([(p['at']-s[0]['at'])/60000 for p in s],[p.get('bytes',0)/2**30 for p in s],label=str(x['users']))
axes[1].set(xlabel='Minutes at load',ylabel='Checkpoint inventory (GiB)',title='Real files inventoried by live GC');axes[1].legend(title='Users')
fig.tight_layout();fig.savefig('docs/assays/ccu-certification.png',dpi=160);plt.close(fig)
