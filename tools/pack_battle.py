"""Publish a new battle foundation pack. Existing packs are never overwritten."""
from pathlib import Path
import hashlib
import json
import shutil
import cadence
from mochi.battle import BattleHost, SPEC, DOMAIN, PACK

ROOT=Path(__file__).resolve().parent.parent

def main():
    folder=ROOT/'web'/'brains'/PACK
    if folder.exists():raise SystemExit('Pack already exists. Publish a new ID rather than overwriting it.')
    if cadence.__version__!='0.74.0':raise SystemExit('Publish a new versioned pack for another Cadence wheel.')
    host=BattleHost();host.handle({'op':'boot','domain':DOMAIN,'seed':0})
    folder.mkdir();(folder/'py').mkdir()
    for name in ['__init__.py','battle.py','life.py','anatomy.py','stores.py']:
        shutil.copy2(ROOT/'mochi'/name,folder/'py'/name)
    wheel=ROOT/'web'/'brains'/'traders-0.74.0-v1'/'cadence_net-0.74.0-py3-none-any.whl'
    shutil.copy2(wheel,folder/wheel.name)
    (folder/'basic.life').write_bytes(host.life.save_bytes())
    hashes={str(p.relative_to(folder)):hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file()}
    manifest={'format':'mochi-battle-pack/1','id':PACK,'domain':DOMAIN,'cadenceVersion':cadence.__version__,'wheel':wheel.name,'host':'py/battle.py','life':'basic.life','spec':SPEC,'modules':[64],'bootstrap':'Fresh library System 1 control; no promoted teacher or battle competence claim. Each pet has a seeded birth and retains its complete subsequent life.','hashes':hashes,'report':host.life.report(),'license':'Cadence wheel GPL-3.0; project host sources retain repository license.'}
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(folder)

if __name__=='__main__':main()
