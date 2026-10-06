"""Experimental server-physics host. Never accepted by production BattleHost.
One reciprocal Cadence brain; only observed executed outcomes write its memory.
"""
import base64
import hashlib
import json
import resource
import sys
import time
import numpy as np
from cadence import Brain, SynapticMemory
from mochi.life import Life
from mochi.anatomy import Genes
from mochi.battle import ACTIONS
from sim.battle_experiment import published_host

DOMAIN = 'server-battle-experiment-v1'
ARMS = ('published','no_protection','expanded','causal','expanded_causal','terminal')

class ExperimentalHost:
    def __init__(self):
        self.life=None; self.receipts={}; self.paid=set(); self.sequence=0
    def handle(self,m):
        op=m['op']
        if op=='boot':
            import cadence
            if cadence.__version__!='0.74.0':raise ValueError('experimental protocol pins Cadence 0.74.0')
            if m.get('domain')!=DOMAIN or m.get('arm') not in ARMS: raise ValueError('experimental battle domain and arm required')
            self.arm=m['arm']; self.inputs=26 if 'expanded' in self.arm else 16
            self.spec=dict(inputs=self.inputs,actions=ACTIONS,senses=[dict(name='battle',size=self.inputs,area='battle')])
            if m.get('checkpoint'):
                saved=json.loads(base64.b64decode(m['checkpoint']))
                if saved.get('domain')!=DOMAIN or saved.get('arm')!=self.arm: raise ValueError('wrong experimental checkpoint')
                self.life=Life.load_bytes(self.spec,base64.b64decode(saved['life']))
                self.receipts=saved['receipts'];self.paid=set(saved['paid']);self.sequence=saved['sequence']
            else:
                seed=int(m.get('seed',0)); self.receipts={};self.paid=set();self.sequence=0
                if self.inputs==16: self.life=published_host(seed).life
                else:
                    genes=Genes(layout='compose',first=0,association=64,dentate=0,trace_amplitude=3,trace_decay=.2)
                    self.life=Life(self.spec,genes,seed,brain=Brain.compose(26,7,modules=(64,),seed=seed))
            return dict(domain=DOMAIN,inputs=self.inputs)
        if self.life is None: raise ValueError('boot first')
        if op=='save':
            data=dict(domain=DOMAIN,arm=self.arm,life=base64.b64encode(self.life.save_bytes()).decode(),receipts=self.receipts,paid=sorted(self.paid),sequence=self.sequence)
            return dict(checkpoint=base64.b64encode(json.dumps(data).encode()).decode())
        if op=='stats':
            usage=resource.getrusage(resource.RUSAGE_SELF)
            return dict(updates=int(self.life.brain.basal_ganglia.updates),memory_writes=int(self.life.brain.hippocampus.writes),weights=hashlib.sha256(np.asarray(self.life.brain.brain.weights).tobytes()).hexdigest(),rssBytes=usage.ru_maxrss if sys.platform=='darwin' else usage.ru_maxrss*1024,cpuSeconds=time.process_time())
        if op=='executed':
            receipt=self.receipts.get(str(m['decisionId']))
            if receipt is None or receipt['executed']: raise ValueError('unknown or duplicate execution')
            receipt['executed']=True
            return dict(executed=True)
        if op=='cancel':
            if not m.get('frozen',False) and self.arm in ('causal','expanded_causal'):self.credit(m.get('credits',[]))
            self.life.counters['dropped']+=int(bool(m.get('reward',0)))
            self.life.start_streams()  # discard eligibility of a choice the body never executed
            self.receipts={};self.paid=set()
            return dict(cancelled=True)
        x=np.asarray(m['obs'],dtype=float)
        r=float(m.get('reward',0)); frozen=bool(m.get('frozen',False))
        if x.shape!=(self.inputs,) or not np.isfinite(x).all() or (x<0).any() or (x>1).any():raise ValueError('normalized experimental observations required')
        if not np.isfinite(r) or abs(r)>1:raise ValueError('bounded outcome required')
        if frozen and (r!=0 or m.get('credits')):raise ValueError('evaluation cannot learn')
        if op=='finish':
            if not frozen and self.life.brain.basal_ganglia._pending is not None:
                self.life.brain.learn([r],[True],x[None,:])
            elif not frozen and r!=0:self.life.counters['dropped']+=1
            if self.arm in ("causal","expanded_causal") and not frozen:self.credit(m.get("credits",[]))
            self.receipts={};self.paid=set()
            return dict(finished=True)
        if op!='tick': raise ValueError('unknown experimental operation')
        if self.arm in ('causal','expanded_causal') and not frozen:
            # First close the pending window exactly once, then write older witnessed
            # guard outcomes to their own cue. No fabricated basal-ganglia eligibility.
            if self.life.brain.basal_ganglia._pending is not None:
                self.life.brain.learn([r],[False],x[None,:])
            r=0
            self.credit(m.get("credits",[]))
        result=self.life.tick(x[None,:],[r],aroused=not frozen)
        if not result['refused']:
            self.sequence+=1; key=str(self.sequence)
            self.receipts[key]=dict(obs=x.tolist(),action=result['action'][0],executed=False)
            result['decisionId']=self.sequence
        return result

    def credit(self,credits):
        for credit in credits:
            event=str(credit['eventId']); receipt=self.receipts.get(str(credit['decisionId']))
            if event in self.paid or receipt is None or not receipt['executed'] or receipt['action'] not in (1,2,3): raise ValueError('unowned or duplicate causal outcome')
            value=float(credit['reward'])
            if not np.isfinite(value) or not 0<=value<=1:raise ValueError('invalid protection outcome')
            target=np.zeros((1,7)); target[0,receipt['action']]=value
            mask=np.zeros((1,7),dtype=bool);mask[0,receipt['action']]=True
            self.life.brain.hippocampus.observe(np.asarray(receipt['obs'])[None,:],target,salience=[value],value_mask=mask)
            self.paid.add(event)

if __name__=='__main__':
    host=ExperimentalHost()
    for line in sys.stdin:
        started=time.perf_counter()
        try: answer=host.handle(json.loads(line))
        except Exception as error:answer=dict(error=str(error))
        answer['hostMs']=(time.perf_counter()-started)*1000
        print(json.dumps(answer,default=lambda v:v.item() if hasattr(v,'item') else str(v)),flush=True)
