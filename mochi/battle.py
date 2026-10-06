"""Domain-isolated continuing System 1 battle life; no access to trading state."""
import base64
import json
import sys
import numpy as np
from cadence import Brain
from .life import Life
from .anatomy import Genes

ACTIONS = ['ATTACK','DEFEND_OWNER','DEFEND_SELF','USE_SPECIAL','MOVE_CLOSER','MOVE_AWAY','WAIT']
SPEC = {'inputs':16,'actions':ACTIONS,'senses':[{'name':'battle','size':16,'area':'battle'}]}
DOMAIN = 'battle-v1'
PACK = 'battle-0.74.0-v1'

class BattleHost:
    def __init__(self):
        self.life = None
    def handle(self, m):
        op=m.get('op')
        if op=='boot':
            if m.get('domain')!=DOMAIN: raise ValueError('battle domain required')
            import cadence
            if cadence.__version__!='0.74.0':raise ValueError('battle pack requires Cadence 0.74.0; publish a new pack before upgrading')
            if m.get('pack',PACK)!=PACK:raise ValueError('unknown battle pack')
            if m.get('checkpoint'):
                saved=json.loads(base64.b64decode(m['checkpoint']))
                if saved.get('domain')!=DOMAIN: raise ValueError('wrong checkpoint domain')
                if saved.get('pack',PACK)!=PACK:raise ValueError('wrong checkpoint pack')
                self.life=Life.load_bytes(SPEC,base64.b64decode(saved['life']))
            else:
                seed=int(m.get('seed',0))
                # Simplest library System 1: one reciprocal processing region, default memory.
                brain=Brain.compose(16,7,modules=(64,),seed=seed)
                genes=Genes(layout='compose',first=0,association=64,dentate=0,trace_amplitude=3,trace_decay=.2)
                self.life=Life(SPEC,genes,seed,brain=brain)
            return {'domain':DOMAIN,'loaded':bool(m.get('checkpoint'))}
        if self.life is None: raise ValueError('boot first')
        if op=='finish':
            x=np.asarray(m['obs'],dtype=float).reshape(1,16)
            reward=float(m.get('reward',0))
            if not np.isfinite(x).all() or not np.isfinite(reward) or abs(reward)>1: raise ValueError('invalid battle outcome')
            if self.life.brain.basal_ganglia._pending is not None:
                self.life.brain.learn(np.array([reward]),np.array([True]),x)
            elif reward!=0:self.life.counters['dropped']+=1
            return {'domain':DOMAIN,'refused':False,'action':[], 'finished':True}
        if op=='tick':
            x=np.asarray(m['obs'],dtype=float)
            if x.shape!=(16,) or not np.isfinite(x).all() or (x<0).any() or (x>1).any(): raise ValueError('normalized battle observations required')
            reward=float(m.get('reward',0))
            if not np.isfinite(reward) or abs(reward)>1: raise ValueError('bounded battle reward required')
            out=self.life.tick(x[None,:],[reward],aroused=bool(m.get('aroused',True)),guide=m.get('guide'))
            out['domain']=DOMAIN
            out['learning']=dict(self.life.brain.last_learning or {})
            return out
        if op=='save':
            data=json.dumps({'domain':DOMAIN,'pack':PACK,'cadenceVersion':'0.74.0','life':base64.b64encode(self.life.save_bytes()).decode()}).encode()
            return {'checkpoint':base64.b64encode(data).decode(),'domain':DOMAIN,'counters':self.life.counters}
        raise ValueError('unknown battle operation')

if __name__=='__main__':
    host=BattleHost()
    for line in sys.stdin:
        try: answer=host.handle(json.loads(line))
        except Exception as error: answer={'error':str(error)}
        print(json.dumps(answer,default=lambda v:v.item() if hasattr(v,'item') else str(v)),flush=True)
