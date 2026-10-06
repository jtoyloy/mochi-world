"""Read-only checkpoint size/ZIP payload audit; never edits published packs."""
import argparse
import hashlib
import io
import json
import time
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('samples', nargs='+', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
rows = []
for path in args.samples:
    data = path.read_bytes()
    archive = zipfile.ZipFile(io.BytesIO(data))
    payloads = {name: archive.read(name) for name in archive.namelist()}
    entries = {}
    for name in ('brain.npz', 'shown.npz'):
        inner = zipfile.ZipFile(io.BytesIO(payloads[name]))
        entries[name] = [{ 'name': x.filename, 'rawBytes': x.file_size,
                          'compressedBytes': x.compress_size, 'method': x.compress_type }
                         for x in inner.infolist()]
    output = io.BytesIO()
    started = time.perf_counter()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as dest:
        for name, payload in payloads.items():
            dest.writestr(name, payload)
    elapsed = (time.perf_counter() - started) * 1000
    rebuilt = zipfile.ZipFile(io.BytesIO(output.getvalue()))
    assert all(rebuilt.read(name) == payload for name, payload in payloads.items())
    rows.append({ 'sampleName': path.name, 'sha256': hashlib.sha256(data).hexdigest(),
                  'bytes': len(data), 'outerDeflateBytes': len(output.getvalue()),
                  'outerDeflateMs': elapsed, 'allPayloadsByteIdentical': True,
                  'counters': json.loads(payloads['life.json'])['counters'],
                  'entries': entries,
                  'observedArrayRawBytes': sum(x['rawBytes'] for xs in entries.values() for x in xs) })
result = {'kind': 'read-only real life payload audit; compression candidate not deployed', 'samples': rows}
text = json.dumps(result, indent=2) + '\n'
if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text)
print(text)
