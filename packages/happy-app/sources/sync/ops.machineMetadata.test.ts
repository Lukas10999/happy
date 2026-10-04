import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ack: vi.fn(), encrypt: vi.fn(async (value: any) => value), decrypt: vi.fn(async (value: any) => value), request: vi.fn(), state: vi.fn() }));
vi.mock('./apiSocket', () => ({ apiSocket: { emitWithAck: mocks.ack, request: mocks.request } }));
vi.mock('./sync', () => ({ sync: { encryption: { getSessionEncryption: () => ({ encryptRaw: mocks.encrypt, decryptRaw: mocks.decrypt }), getMachineEncryption: () => ({ encryptRaw: mocks.encrypt, decryptRaw: mocks.decrypt }) } } }));
vi.mock('./storage', () => ({ storage: { getState: mocks.state } }));
describe('machine preference conflict handling', () => {
  it('retries the intended restore setting while preserving a concurrent rename', async () => {
    const { machineUpdateMetadata } = await import('./ops');
    mocks.ack.mockResolvedValueOnce({ result: 'version-mismatch', version: 4, metadata: { host: 'host', displayName: 'Renamed', autoRestoreSessions: true } })
      .mockResolvedValueOnce({ result: 'success', version: 5, metadata: 'encrypted' });
    await machineUpdateMetadata('m1', { host: 'host', displayName: 'Old', autoRestoreSessions: false } as any, 3, 3, ['autoRestoreSessions']);
    expect(mocks.ack.mock.calls[1][1]).toMatchObject({ expectedVersion: 4, metadata: { displayName: 'Renamed', autoRestoreSessions: false } });
  });
});

describe('durable explicit archival', () => {
  it('saves archived metadata with conflict retry before deactivating a dead chat', async () => {
    vi.clearAllMocks();
    const { sessionArchive } = await import('./ops');
    mocks.state.mockReturnValue({ sessions: { s1: { metadata: { path: '/project' }, metadataVersion: 1 } } });
    mocks.ack.mockResolvedValueOnce({ result: 'version-mismatch', version: 2, metadata: { path: '/renamed', customField: true } })
      .mockResolvedValueOnce({ result: 'success' });
    mocks.request.mockImplementationOnce(async () => {
      expect(mocks.ack).toHaveBeenCalledTimes(2);
      return { ok: true };
    });
    expect(await sessionArchive('s1')).toEqual({ success: true });
    expect(mocks.ack.mock.calls[1][1]).toMatchObject({ expectedVersion: 2,
      metadata: { path: '/renamed', customField: true, lifecycleState: 'archived' } });
  });
  it('does not report a successful archive if its durable state could not be saved', async () => {
    vi.clearAllMocks();
    const { sessionArchive } = await import('./ops');
    mocks.state.mockReturnValue({ sessions: { s1: { metadata: { path: '/project' }, metadataVersion: 1 } } });
    mocks.ack.mockResolvedValueOnce({ result: 'error' });
    expect((await sessionArchive('s1')).success).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
