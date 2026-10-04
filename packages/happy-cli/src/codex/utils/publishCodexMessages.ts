import type { SessionEnvelope } from '@slopus/happy-wire';

/** Publish lifecycle state before output, including implicit continuation turns. */
export function publishCodexMessages(
    mapped: { currentTurnId: string | null; envelopes: SessionEnvelope[] },
    handlers: {
        onTurnChanged: (turnId: string | null) => void;
        send: (envelope: SessionEnvelope) => void;
    },
): void {
    handlers.onTurnChanged(mapped.currentTurnId);
    for (const envelope of mapped.envelopes) handlers.send(envelope);
}

/** Coordinate await cleanup with continuations that have no waiting send call. */
export function createCodexTurnFinalizer(getTurn: () => string | null, onIdle: () => void, onMissingAbort: () => void) {
    let waiting = false;
    let completedWhileWaiting = false;
    const finishIfIdle = () => { if (getTurn() === null) onIdle(); };
    return {
        begin: () => { waiting = true; completedWhileWaiting = false; },
        settled: (aborted = false) => {
            if (aborted && !completedWhileWaiting) onMissingAbort();
            waiting = false;
            finishIfIdle();
        },
        completed: () => { if (waiting) completedWhileWaiting = true; else finishIfIdle(); },
    };
}
