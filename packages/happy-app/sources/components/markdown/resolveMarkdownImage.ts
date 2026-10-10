type ReadFile = (sessionId: string, path: string) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
}>;

const mimeTypes: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
    svg: 'image/svg+xml', ico: 'image/x-icon', apng: 'image/apng',
};

/** Local paths belong to the session's agent, never to the browser's origin.
 * Keep access checks in the existing encrypted, workspace-scoped readFile RPC.
 */
export async function resolveMarkdownImage(url: string, sessionId: string | undefined, readFile: ReadFile): Promise<string> {
    const source = url.trim();
    if (/^https?:\/\//i.test(source) || /^data:image\/[a-z\d.+-]+[;,]/i.test(source) || /^blob:/i.test(source)) {
        return source;
    }
    if (source.startsWith('//')) {
        return `https:${source}`;
    }

    let path = source;
    if (source.startsWith('sandbox:/')) {
        path = source.slice('sandbox:'.length);
    } else if (source.startsWith('file:///')) {
        path = source.slice('file://'.length);
    } else if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
        throw new Error('Unsupported image source');
    }
    try {
        path = decodeURIComponent(path);
    } catch {
        throw new Error('Unsupported image path');
    }
    const extension = path.match(/\.([a-z]+)$/i)?.[1].toLowerCase();
    const mimeType = extension ? mimeTypes[extension] : undefined;
    if (!mimeType || path.includes('\0') || path.startsWith('//')) {
        throw new Error('Unsupported image path');
    }
    if (!sessionId) {
        throw new Error('Local images require a session');
    }
    const response = await readFile(sessionId, path);
    if (!response.success) {
        throw new Error(response.error || 'Failed to read image');
    }
    const content = response.content;
    if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length % 4 !== 0) {
        throw new Error('Invalid image content');
    }
    return `data:${mimeType};base64,${content}`;
}
