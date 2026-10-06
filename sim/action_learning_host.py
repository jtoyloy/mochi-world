"""Isolated action/body experiment; never a production checkpoint or answer path."""
import base64
import json
import sys
import time
import numpy as np
from cadence import Brain
from mochi.life import Life
from mochi.anatomy import Genes
from mochi.battle import ACTIONS
from sim.battle_experiment import published_host
from sim.server_battle_host import ExperimentalHost

DOMAIN = 'cadence-action-learning-v1'
INPUTS = {'published':16, 'expanded':26, 'affordance':19,
          'expanded_affordance':29, 'penalty':19, 'persistent':19}

class ActionLearningHost(ExperimentalHost):
    def handle(self, m):
        op=m['op']
        if op=='boot':
            import cadence
            if cadence.__version__!='0.74.0': raise ValueError('Cadence 0.74.0 required')
            if m.get('domain')!=DOMAIN or m.get('arm') not in INPUTS: raise ValueError('experimental action domain required')
            self.arm=m['arm'];self.inputs=INPUTS[self.arm]
            self.body='approach-target-v2' if self.arm=='persistent' else 'short-hop-v1'
            self.spec=dict(inputs=self.inputs,actions=ACTIONS,senses=[dict(name='battle',size=self.inputs,area='battle')])
            self.receipts={};self.paid=set();self.sequence=0
            if m.get('checkpoint'):
                saved=json.loads(base64.b64decode(m['checkpoint']))
                if (saved.get('domain'),saved.get('arm'),saved.get('body'))!=(DOMAIN,self.arm,self.body): raise ValueError('incompatible experimental action checkpoint')
                self.life=Life.load_bytes(self.spec,base64.b64decode(saved['life']))
                self.receipts=saved['receipts'];self.sequence=saved['sequence']
            else:
                seed=int(m.get('seed',0))
                if self.inputs==16:self.life=published_host(seed).life
                else:
                    genes=Genes(layout='compose',first=0,association=64,dentate=0,trace_amplitude=3,trace_decay=.2)
                    self.life=Life(self.spec,genes,seed,brain=Brain.compose(self.inputs,7,modules=(64,),seed=seed))
            return dict(domain=DOMAIN,inputs=self.inputs,body=self.body)
        if self.life is None: raise ValueError('boot first')
        if op=='save':
            saved=dict(domain=DOMAIN,arm=self.arm,body=self.body,life=base64.b64encode(self.life.save_bytes()).decode(),receipts=self.receipts,sequence=self.sequence)
            return dict(checkpoint=base64.b64encode(json.dumps(saved).encode()).decode())
        if op=='probe':
            x=np.asarray(m['obs'],dtype=float)
            if x.ndim!=2 or x.shape[1]!=self.inputs or not np.isfinite(x).all() or (x<0).any() or (x>1).any(): raise ValueError('normalized probe required')
            return self.life.probe(x)
        result=super().handle(m)
        if op=='tick':result['policy']=self.life.policy().tolist()
        return result

if __name__=='__main__':
    host=ActionLearningHost()
    for line in sys.stdin:
        started=time.perf_counter()
        try:answer=host.handle(json.loads(line))
        except Exception as error:answer=dict(error=str(error))
        if isinstance(answer,list):answer=dict(probes=answer)
        answer['hostMs']=(time.perf_counter()-started)*1000
        print(json.dumps(answer,default=lambda v:v.tolist() if hasattr(v,'tolist') else str(v)),flush=True)
