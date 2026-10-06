"""Bounded resident host transport. BattleHost's settlement and pack stay unchanged."""
from collections import OrderedDict
import json
import sys
import time
import resource
import hashlib
from .battle import BattleHost


class Worker:
    def __init__(self):
        self.residents = OrderedDict()
        self.loads = self.saves = 0

    def handle(self, m):
        if m['op'] == 'ready':
            import cadence
            if cadence.__version__ != '0.74.0':
                raise ValueError('battle pack requires Cadence 0.74.0')
            return {'ready': True}
        if m['op'] != 'execute':
            raise ValueError('unknown worker operation')
        started = time.perf_counter()
        for key, resident in list(self.residents.items()):
            if time.monotonic()-resident[4] > m.get('idleSeconds', 300):
                del self.residents[key]
        identity = m['id']
        cached = self.residents.pop(identity, None)
        load_ms = 0
        if cached is None or cached[0] != m['version'] or cached[2] != m['pack'] or cached[3] != hashlib.sha256((m.get('checkpoint') or '').encode()).hexdigest() or time.monotonic()-cached[4] > m.get('idleSeconds', 300):
            at = time.perf_counter()
            host = BattleHost()
            host.handle(dict(op='boot', domain='battle-v1', pack=m['pack'], seed=m['seed'], checkpoint=m.get('checkpoint')))
            load_ms = (time.perf_counter()-at)*1000
            self.loads += 1
        else:
            host = cached[1]
        # Remove before mutation. Exceptions cannot leave partially mutated cached state.
        at = time.perf_counter()
        answer = host.handle(m['decision'])
        step_ms = (time.perf_counter()-at)*1000
        at = time.perf_counter()
        saved = host.handle(dict(op='save'))
        save_ms = (time.perf_counter()-at)*1000
        self.saves += 1
        self.residents[identity] = (m['version']+1, host, m['pack'], hashlib.sha256(saved['checkpoint'].encode()).hexdigest(), time.monotonic())
        while len(self.residents) > m['maxResidents']:
            self.residents.popitem(last=False)
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return dict(answer=answer, checkpoint=saved['checkpoint'], timings=dict(load=load_ms, step=step_ms, save=save_ms, host=(time.perf_counter()-started)*1000),
                    residents=len(self.residents), coldLoads=self.loads, saves=self.saves,
                    cpuSeconds=time.process_time(), rssBytes=usage.ru_maxrss if sys.platform=='darwin' else usage.ru_maxrss*1024)


if __name__ == '__main__':
    worker = Worker()
    for line in sys.stdin:
        try:
            answer = worker.handle(json.loads(line))
        except Exception as error:
            answer = {'error': str(error)}
        print(json.dumps(answer, default=lambda v: v.item() if hasattr(v, 'item') else str(v)), flush=True)
