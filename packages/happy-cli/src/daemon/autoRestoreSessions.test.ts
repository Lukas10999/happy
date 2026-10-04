import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAutomaticSessionRestore } from './autoRestoreSessions';
import type { PersistedSession } from '@/persistence';

function session(overrides: Partial<PersistedSession> = {}): PersistedSession {
  return { encryptionKey: 'test-only', encryptionVariant: 'dataKey', seq: 1, metadataVersion: 1,
    agentStateVersion: 1, savedAt: 1, restoreOnRestart: true,
    metadata: { path: '/project', machineId: 'machine-1', flavor: 'codex', codexThreadId: 'thread-1' },
    ...overrides } as PersistedSession;
}
afterEach(() => vi.useRealTimers());

describe('automatic session restoration', () => {
  it('waits for readiness and resumes only saved open sessions from this machine once', async () => {
    vi.useFakeTimers();
    let ready = false;
    const resume = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'open' });
    const sessions = { open: session(), closed: session({ restoreOnRestart: false }),
      legacy: session({ restoreOnRestart: undefined }),
      foreign: session({ metadata: { path: '/project', machineId: 'other', flavor: 'codex' } as any }),
      archived: session({ metadata: { path: '/project', machineId: 'machine-1', lifecycleState: 'archived' } as any }) };
    const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => ready, isEnabled: () => true,
      prepare: async () => true, canRestore: async () => true, readSessions: () => sessions, resume, onResult: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000);
    expect(resume).not.toHaveBeenCalled();
    ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(resume.mock.calls).toEqual([['open']]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not restore when the saved setting is off', async () => {
    vi.useFakeTimers();
    const resume = vi.fn();
    const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => true, isEnabled: () => false,
      prepare: async () => true, canRestore: async () => true, readSessions: () => ({ open: session() }), resume, onResult: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000);
    expect(resume).not.toHaveBeenCalled(); stop();
  });

  it('continues after a failed session and reports the result without retrying it', async () => {
    vi.useFakeTimers();
    const resume = vi.fn().mockRejectedValueOnce(new Error('missing directory')).mockResolvedValueOnce({ type: 'success', sessionId: 'second' });
    const onResult = vi.fn();
    const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => true, isEnabled: () => true,
      prepare: async () => true, canRestore: async () => true, readSessions: () => ({ first: session(), second: session() }), resume, onResult });
    await vi.advanceTimersByTimeAsync(1000);
    expect(resume.mock.calls).toEqual([['first'], ['second']]);
    expect(onResult).toHaveBeenCalledWith('first', expect.objectContaining({ type: 'error' }));
    expect(onResult).toHaveBeenCalledWith('second', { type: 'success', sessionId: 'second' }); stop();
  });

  it.each(['shutdown', 'disabled', 'closed'] as const)('honors %s while a prior session is starting', async (reason) => {
    vi.useFakeTimers();
    let enabled = true;
    let resolve!: (value: any) => void;
    const resume = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const sessions = { first: session(), second: session() };
    const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => true, isEnabled: () => enabled,
      prepare: async () => true, canRestore: async () => true, readSessions: () => sessions, resume, onResult: vi.fn() });
    await vi.advanceTimersByTimeAsync(1000);
    if (reason === 'shutdown') stop();
    if (reason === 'disabled') enabled = false;
    if (reason === 'closed') sessions.second.restoreOnRestart = false;
    resolve({ type: 'success', sessionId: 'first' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume.mock.calls).toEqual([['first']]); stop();
  });
});

it('fails closed if authoritative preparation fails', async () => {
  vi.useFakeTimers();
  const resume = vi.fn();
  const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => true, isEnabled: () => true,
    prepare: async () => { throw new Error('offline'); }, canRestore: async () => true,
    readSessions: () => ({ open: session() }), resume, onResult: vi.fn() });
  await vi.advanceTimersByTimeAsync(2000);
  expect(resume).not.toHaveBeenCalled(); stop();
});
it('does not reopen a remotely archived or deleted chat', async () => {
  vi.useFakeTimers();
  const resume = vi.fn();
  const stop = startAutomaticSessionRestore({ machineId: 'machine-1', isReady: () => true, isEnabled: () => true,
    prepare: async () => true, canRestore: async () => false,
    readSessions: () => ({ open: session() }), resume, onResult: vi.fn() });
  await vi.advanceTimersByTimeAsync(2000);
  expect(resume).not.toHaveBeenCalled(); stop();
});
