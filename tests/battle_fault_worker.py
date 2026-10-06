"""Test-only process crash injection at real BattleHost boundaries."""
import json
import os
import sys
from mochi.battle_worker import Worker
from mochi.battle import BattleHost
original = BattleHost.handle
fault = None

def handle(self, m):
    stage=m['op']
    if fault == stage or fault == stage+'-before':
        os._exit(71)
    result=original(self,m)
    if fault == stage+'-after':
        os._exit(72)
    return result
BattleHost.handle=handle
worker=Worker()
for line in sys.stdin:
    m=json.loads(line)
    fault=m.get('fault')
    try:
        result=worker.handle(m)
    except Exception as error:
        result={'error':str(error)}
    print(json.dumps(result,default=lambda v:v.item() if hasattr(v,'item') else str(v)),flush=True)
