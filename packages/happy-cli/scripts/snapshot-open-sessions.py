#!/usr/bin/env python3
"""Run inside the OLD agent immediately before an approved upgrade/recreate.
Never run this on startup: it snapshots currently live sessions, not old history.
It writes a separate ID-only manifest; existing session/key state is never edited.
"""
import json
import os
from pathlib import Path
import urllib.request

root = Path(os.environ.get('HAPPY_HOME_DIR', str(Path.home() / '.happy')))
state = json.loads((root / 'daemon.state.json').read_text())
req = urllib.request.Request(f"http://127.0.0.1:{int(state['httpPort'])}/list", data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req, timeout=10) as response:
    children = json.load(response)['children']
active = {child['happySessionId'] for child in children if child.get('happySessionId')}
import time
p = root / 'sessions.json.restore-snapshot'
private_tmp = root / 'sessions.restore-snapshot.tmp'
fd = os.open(private_tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as out:
    json.dump({'ids': sorted(active), 'processNamespace': os.readlink('/proc/self/ns/pid'),
               'capturedAt': int(time.time() * 1000)}, out)
    out.write('\n')
private_tmp.replace(p)
print(f'Snapshotted {len(active)} open session IDs; no processes restarted.')
