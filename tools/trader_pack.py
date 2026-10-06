"""Expand the immutable pet control into a new pack without altering its published files."""
import copy
import hashlib
import json
import shutil
from pathlib import Path
import numpy as np
from mochi.life import Life

ROOT=Path(__file__).resolve().parent.parent
OLD=ROOT/'web/brains/mochi-0.74.0-a'
NEW=ROOT/'web/brains/traders-0.74.0-v1'

def build_pack():
    if NEW.exists():
        raise FileExistsError('Brain packs are immutable. Choose a new NEW pack ID before building another candidate.')
    manifest=json.loads((OLD/'manifest.json').read_text())
    spec=copy.deepcopy(manifest['spec'])
    spec['inputs']+=30
    spec['senses'].append({'name':'trader','size':30,'area':'insula'})
    spec['actions']+=['HOLD','BUY_SMALL','BUY_MEDIUM','SELL_SMALL','SELL_MEDIUM','SELL_ALL']
    old=Life.load_bytes(manifest['spec'],(OLD/'basic.life').read_bytes())
    life=Life(spec,old.genes,old.seed)
    source,target=old.brain,life.brain
    mapping={}
    for name in ('sensory','association','motor','prefrontal'):
        a=np.asarray(source.connectome.populations[name]);b=np.asarray(target.connectome.populations[name])
        mapping.update(zip(a.tolist(),b[:len(a)].tolist()))
    edges={(mapping[int(a)],mapping[int(b)]):float(w) for a,b,w in zip(source.connectome.pre,source.connectome.post,source.brain.weights)}
    weights=np.asarray(target.brain.weights).copy()
    new_senses=set(np.asarray(target.sensory_index)[223:].tolist())
    for i,(a,b) in enumerate(zip(target.connectome.pre,target.connectome.post)):
        key=(int(a),int(b))
        if key in edges:weights[i]=edges[key]
        elif int(a) in new_senses: weights[i]*=.05
    target.brain.efficacy=weights/(target.brain.neuron_model.gain * target.connectome.count * np.exp(target.brain.log_gain)[target.connectome.pre])
    bias=np.asarray(target.brain.bias).copy()
    for a,b in mapping.items():bias[b]=np.asarray(source.brain.bias)[a]
    target.brain.bias=bias
    for a,b in ((source.hippocampus,target.hippocampus),(source.hippocampus.shown,target.hippocampus.shown)):
        if a is None or b is None:continue
        b.consolidated[:223,:17]=a.consolidated
        if len(a.strength):
            b.strength=np.zeros((len(a.strength),253,23));b.strength[:,:223,:17]=a.strength
            b.mass=np.zeros((len(a.mass),253,23));b.mass[:,:223,:17]=a.mass
        b.writes=a.writes
    NEW.mkdir(exist_ok=True)
    shutil.copytree(OLD/'py',NEW/'py',dirs_exist_ok=True)
    shutil.copy2(OLD/manifest['wheel'],NEW/manifest['wheel'])
    # Interval outcomes write the exact original observation/action into the same memory.
    # They do not credit a more recent pet action through its eligibility trace.
    host=NEW/'py/host.py'
    code=host.read_text()
    code=code.replace('    def op_report(self,', '''    def op_trade_credit(self, message):
        life = self.life
        assert life is not None
        key = np.asarray(message['obs'], dtype=float).reshape(1, -1)
        action = int(message['action'])
        if key.shape[1] != life.spec['inputs'] or action < 17 or action >= life.actions:
            raise ValueError('trade credit needs a trading motor action and full observation')
        value = np.zeros((1, life.actions))
        mask = np.zeros(value.shape, dtype=bool)
        value[0, action] = np.clip(float(message['reward']), -1, 1)
        mask[0, action] = True
        life.brain.hippocampus.observe(key, value, value_mask=mask)
        return {'credited': action}

    def op_report(self,''')
    host.write_text(code)
    (NEW/'basic.life').write_bytes(life.save_bytes())
    manifest.update(id=NEW.name,name='Mochi Traders',spec=spec,raised={'migration':'Original learned pet weights and stores preserved; added trading outputs untrained.'},notes='Experimental extension; original pack is the measured pet control.')
    manifest.update(life_sha256=hashlib.sha256((NEW/'basic.life').read_bytes()).hexdigest())
    manifest['sources_sha256']={name:hashlib.sha256((NEW/'py'/name).read_bytes()).hexdigest() for name in manifest['sources']}
    manifest.pop('atlas',None)
    manifest.update(life.report())
    (NEW/'manifest.json').write_text(json.dumps(manifest,indent=2))
    index=json.loads((ROOT/'web/brains/index.json').read_text())
    index['packs']=[x for x in index['packs'] if x['id']!=NEW.name]
    index['packs'].append({k:manifest[k] for k in ('id','name','cadence','neurons','synapses')})
    # Classic retains its default; the trader page explicitly chooses its new pack.
    (ROOT/'web/brains/index.json').write_text(json.dumps(index,indent=2))
    print(json.dumps(life.report(),default=str)[:600])

if __name__=='__main__':build_pack()
