import * as React from 'react';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { Switch } from './Switch';
import { useAllMachines } from '@/sync/storage';
import type { Machine } from '@/sync/storageTypes';
import { machineUpdateMetadata } from '@/sync/ops';
import { isRigMachine } from '@/sync/rigSessionCreation';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';

function RestoreMachineSetting({ machine }: { machine: Machine }) {
    const saved = machine.metadata?.autoRestoreSessions !== false;
    const [enabled, setEnabled] = React.useState(saved);
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { setEnabled(saved); }, [saved]);
    const update = async (value: boolean) => {
        if (!machine.metadata || saving) return;
        setEnabled(value);
        setSaving(true);
        try {
            await machineUpdateMetadata(machine.id, { ...machine.metadata, autoRestoreSessions: value },
                machine.metadataVersion, 3, ['autoRestoreSessions']);
            void sync.refreshMachines().catch(() => {});
        } catch {
            setEnabled(saved);
            Modal.alert('Could not save setting', 'Please reconnect and try again.');
        } finally { setSaving(false); }
    };
    return <Item
        title={machine.metadata?.displayName || machine.metadata?.host || machine.id}
        subtitle="Restore sessions after restart"
        showChevron={false}
        rightElement={<Switch value={enabled} onValueChange={update} disabled={saving} />}
    />;
}

export function SessionRestoreSettings() {
    const machines = useAllMachines({ includeOffline: true }).filter(machine => machine.metadata && !isRigMachine(machine.metadata));
    if (!machines.length) return null;
    return <ItemGroup title="Session recovery" footer="Reopen previously open Claude and Codex chats when this machine restarts. Closed chats stay closed. No new prompt is sent.">
        {machines.map(machine => <RestoreMachineSetting key={machine.id} machine={machine} />)}
    </ItemGroup>;
}
