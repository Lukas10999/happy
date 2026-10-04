import * as React from 'react';
// @ts-expect-error react-test-renderer has no declarations in this workspace.
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ machines: [] as any[], update: vi.fn(), refresh: vi.fn(), alert: vi.fn() }));
vi.hoisted(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
vi.mock('@/sync/storage', () => ({ useAllMachines: () => state.machines }));
vi.mock('@/sync/ops', () => ({ machineUpdateMetadata: state.update }));
vi.mock('@/sync/sync', () => ({ sync: { refreshMachines: state.refresh } }));
vi.mock('@/modal', () => ({ Modal: { alert: state.alert } }));
vi.mock('@/components/Item', () => ({ Item: (props: any) => React.createElement('Item', props, props.rightElement) }));
vi.mock('@/components/ItemGroup', () => ({ ItemGroup: (props: any) => React.createElement('ItemGroup', props, props.children) }));
vi.mock('@/components/Switch', () => ({ Switch: (props: any) => React.createElement('Switch', props) }));
import { SessionRestoreSettings } from './SessionRestoreSettings';
const renderers: Array<ReturnType<typeof create>> = [];
function open() { let renderer!: ReturnType<typeof create>; act(() => { renderer = create(React.createElement(SessionRestoreSettings)); }); renderers.push(renderer); return renderer; }
afterEach(() => { act(() => renderers.splice(0).forEach(r => r.unmount())); vi.clearAllMocks(); });

describe('session restore settings', () => {
  it('defaults on and saves only the chosen machine preference', async () => {
    state.machines = [{ id: 'm1', metadataVersion: 3, metadata: { host: 'host', displayName: 'My machine' } }];
    state.update.mockResolvedValue({}); state.refresh.mockResolvedValue(undefined);
    const renderer = open();
    expect(renderer.root.findByType('Switch').props.value).toBe(true);
    await act(async () => { await renderer.root.findByType('Switch').props.onValueChange(false); });
    expect(state.update).toHaveBeenCalledWith('m1', expect.objectContaining({ autoRestoreSessions: false, displayName: 'My machine' }), 3, 3, ['autoRestoreSessions']);
    expect(renderer.root.findByType('Switch').props.value).toBe(false);
  });
  it('shows a saved off setting and restores it when saving fails', async () => {
    state.machines = [{ id: 'm1', metadataVersion: 3, metadata: { host: 'host', autoRestoreSessions: false } }];
    state.update.mockRejectedValue(new Error('offline'));
    const renderer = open();
    expect(renderer.root.findByType('Switch').props.value).toBe(false);
    await act(async () => { await renderer.root.findByType('Switch').props.onValueChange(true); });
    expect(renderer.root.findByType('Switch').props.value).toBe(false);
    expect(state.alert).toHaveBeenCalled();
  });
});
