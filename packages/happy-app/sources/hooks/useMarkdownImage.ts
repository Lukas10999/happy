import * as React from 'react';
import { sessionReadFile } from '@/sync/ops';
import { resolveMarkdownImage } from '@/components/markdown/resolveMarkdownImage';

type ImageState = { key: string; uri?: string; failed: boolean };

/** Fetch agent-local images for the message's session. Ignore late RPC results
 * after recycler reuse, navigation, retry, or unmount so images cannot cross chats.
 */
export function useMarkdownImage(url: string, sessionId?: string) {
    const [attempt, setAttempt] = React.useState(0);
    const key = JSON.stringify([sessionId, url, attempt]);
    const [state, setState] = React.useState<ImageState>({ key, failed: false });

    React.useEffect(() => {
        let cancelled = false;
        setState({ key, failed: false });
        resolveMarkdownImage(url, sessionId, sessionReadFile).then(
            uri => { if (!cancelled) setState({ key, uri, failed: false }); },
            () => { if (!cancelled) setState({ key, failed: true }); },
        );
        return () => { cancelled = true; };
    }, [key, url, sessionId]);

    const retry = React.useCallback(() => setAttempt(value => value + 1), []);
    const onError = React.useCallback(() => setState(current =>
        current.key === key ? { key, failed: true } : current
    ), [key]);
    const current = state.key === key ? state : { key, failed: false };
    return { uri: current.uri, failed: current.failed, retry, onError };
}
