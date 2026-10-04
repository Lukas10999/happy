import type { PersistedSession } from '@/persistence';
import type { SpawnSessionResult } from '@/modules/common/registerCommonHandlers';

type RestoreOptions = {
  machineId: string;
  isReady: () => boolean;
  isEnabled: () => boolean;
  prepare: () => Promise<boolean>;
  canRestore: (sessionId: string, session: PersistedSession) => Promise<boolean>;
  readSessions: () => Record<string, PersistedSession>;
  resume: (sessionId: string) => Promise<SpawnSessionResult>;
  onResult: (sessionId: string, result: SpawnSessionResult) => void;
};

/** Reconnect saved open chats once per daemon boot; never send an agent prompt. */
export function startAutomaticSessionRestore(options: RestoreOptions): () => void {
  let cancelled = false;
  let started = false;
  const eligible = (session: PersistedSession | undefined) => session?.restoreOnRestart === true
    && session.metadata.machineId === options.machineId
    && session.metadata.lifecycleState !== 'archived';
  const timer = setInterval(() => {
    if (cancelled || started || !options.isReady()) return;
    started = true;
    clearInterval(timer);
    void (async () => {
      try { if (!await options.prepare()) return; } catch { return; }
      for (const id of Object.keys(options.readSessions())) {
        if (cancelled || !options.isEnabled()) break;
        // Re-read so an explicit close during a previous resume wins.
        if (!eligible(options.readSessions()[id])) continue;
        let result: SpawnSessionResult;
        try {
          if (!await options.canRestore(id, options.readSessions()[id])) continue;
          if (cancelled || !options.isEnabled() || !eligible(options.readSessions()[id])) continue;
          result = await options.resume(id);
        }
        catch (error) { result = { type: 'error', errorMessage: error instanceof Error ? error.message : 'Session restore failed' }; }
        options.onResult(id, result);
      }
    })();
  }, 1000);
  return () => { cancelled = true; clearInterval(timer); };
}
