import { describe, it, expect } from 'vitest';
import { mapCodexMcpMessageToSessionEnvelopes, mapCodexProcessorMessageToSessionEnvelopes } from './sessionProtocolMapper';
import { publishCodexMessages, createCodexTurnFinalizer } from './publishCodexMessages';

describe('Codex continuation activity publication', () => {
    it('publishes busy before continuation output, then idle at completion', () => {
        let currentTurnId: string | null = null;
        const events: string[] = [];
        const handlers = {
            onTurnChanged: (turn: string | null) => { currentTurnId = turn; events.push(turn ? 'busy' : 'idle'); },
            send: (envelope: { ev: { t: string } }) => { events.push(envelope.ev.t); },
        };
        publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'task_started' }, { currentTurnId }), handlers);
        publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'task_complete' }, { currentTurnId }), handlers);
        expect(currentTurnId).toBeNull();
        events.length = 0;
        publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'agent_message', message: 'continuing' }, { currentTurnId }), handlers);
        expect(events[0]).toBe('busy');
        expect(events).toContain('text');
        expect(currentTurnId).not.toBeNull();
        events.length = 0;
        publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'task_complete' }, { currentTurnId }), handlers);
        expect(events[0]).toBe('idle');
        expect(currentTurnId).toBeNull();
    });
});


it('restores busy before a tool starts without task_started', () => {
    const events: string[] = [];
    publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({
        type: 'exec_command_begin', call_id: 'continued-tool', command: ['echo', 'hello'],
    }, { currentTurnId: null }), {
        onTurnChanged: turn => events.push(turn ? 'busy' : 'idle'),
        send: envelope => events.push(envelope.ev.t),
    });
    expect(events).toEqual(['busy', 'turn-start', 'tool-call-start']);
});

it('restores busy for buffered reasoning after task completion', () => {
    const events: string[] = [];
    publishCodexMessages(mapCodexProcessorMessageToSessionEnvelopes({
        type: 'reasoning', id: 'continued-reasoning', message: 'still thinking',
    }, { currentTurnId: null }), {
        onTurnChanged: turn => events.push(turn ? 'busy' : 'idle'),
        send: envelope => events.push(envelope.ev.t),
    });
    expect(events).toEqual(['busy', 'turn-start', 'text']);
});


it('does not idle a continuation arriving before completed-turn await cleanup', async () => {
    let currentTurnId: string | null = 'old-turn';
    let busy = true;
    let ready = 0;
    const finalizer = createCodexTurnFinalizer(() => currentTurnId, () => { busy = false; ready++; }, () => { currentTurnId = null; });
    finalizer.begin();
    const handlers = {
        onTurnChanged: (turn: string | null) => { currentTurnId = turn; busy = turn !== null; },
        send: () => {},
    };
    publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'task_complete' }, { currentTurnId }), handlers);
    finalizer.completed();
    const cleanup = Promise.resolve().then(() => finalizer.settled());
    publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({
        type: 'exec_command_begin', call_id: 'continued', command: ['sleep', '60'],
    }, { currentTurnId }), handlers);
    await cleanup;
    expect(busy).toBe(true);
    expect(ready).toBe(0);
    publishCodexMessages(mapCodexMcpMessageToSessionEnvelopes({ type: 'task_complete' }, { currentTurnId }), handlers);
    finalizer.completed();
    expect(ready).toBe(1);
    expect(busy).toBe(false);
});


it('clears busy when the app-server exits without a terminal event', () => {
    let currentTurnId: string | null = 'crashed';
    let ready = 0;
    const finalizer = createCodexTurnFinalizer(() => currentTurnId, () => { ready++; }, () => { currentTurnId = null; });
    finalizer.begin();
    finalizer.settled(true);
    expect(currentTurnId).toBeNull();
    expect(ready).toBe(1);
});

it('preserves a continuation when the aborted turn did emit its terminal event', () => {
    let currentTurnId: string | null = 'old';
    let ready = 0;
    const finalizer = createCodexTurnFinalizer(() => currentTurnId, () => { ready++; }, () => { currentTurnId = null; });
    finalizer.begin();
    currentTurnId = null;
    finalizer.completed();
    currentTurnId = 'continuation';
    finalizer.settled(true);
    expect(currentTurnId).toBe('continuation');
    expect(ready).toBe(0);
});
