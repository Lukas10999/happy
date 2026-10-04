# Session recovery

Settings → Session recovery controls automatic recovery per machine. The default is on.
The daemon restores saved open Claude/Codex sessions once it connects after starting,
using their existing Happy IDs and provider history without sending a prompt.
Explicit closes and archived/deleted sessions are excluded. Recovery first reads the
server's machine preference and checks each session's current encrypted metadata.
If those reads fail, recovery skips the affected work rather than guessing.

Previously open sessions keep their key records through long shutdowns. Live sessions
are protected from duplicate starts after a daemon-only restart. Linux PID namespace
identity avoids treating reused PIDs after container recreation as old session owners.

## First upgrade from a version without recovery

Immediately before an **authorized** upgrade, run `snapshot-open-sessions.py` inside
the old agent container, with its normal user and HAPPY_HOME_DIR. Python 3 is required.
It reads the local daemon's session list and writes only session IDs, a timestamp,
and the PID namespace to `sessions.json.restore-snapshot` in the private Happy directory.
It does not alter the existing session/key file or stop any process.

The new daemon consumes this manifest under its exclusive lock. It imports only
currently open IDs, preserves existing explicit close decisions, and then removes
the manifest. Without this one-time snapshot, old records lacking recovery intent
are intentionally not reopened. New/reconnected sessions acquire recovery intent
automatically. Do not run the snapshot as an ordinary startup hook or restore an old
snapshot from backup: it represents the live state immediately before one upgrade.

The frontend and CLI changes should be rolled out together. The updated frontend
persists encrypted archive metadata before HTTP deactivation of a dead session;
older clients only deactivate it and cannot communicate that durable close intent.
