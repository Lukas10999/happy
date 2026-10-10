import { describe, expect, it } from 'vitest';
import { resolveMarkdownImage } from './resolveMarkdownImage';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrZkAAAAASUVORK5CYII=';
const unavailable = async () => { throw new Error('Unexpected file read'); };

describe('resolveMarkdownImage', () => {
    it('loads the reported workspace screenshot from its own session', async () => {
        const reads: string[][] = [];
        const uri = await resolveMarkdownImage('/workspace/finflow/tasks/2026-10-transfer-review-design/compact-desktop.png', 'finflow-session', async (session, path) => {
            reads.push([session, path]);
            return { success: true, content: png };
        });
        expect(reads).toEqual([['finflow-session', '/workspace/finflow/tasks/2026-10-transfer-review-design/compact-desktop.png']]);
        expect(uri).toBe(`data:image/png;base64,${png}`);
    });
    it.each([
        ['screenshots/preview.png', 'screenshots/preview.png'],
        ['./screenshots/preview%20one.png', './screenshots/preview one.png'],
        ['sandbox:/mnt/data/preview.png', '/mnt/data/preview.png'],
        ['file:///workspace/preview%20one.png', '/workspace/preview one.png'],
    ])('resolves %s through the same workspace-scoped reader', async (url, expectedPath) => {
        let actualPath = '';
        await resolveMarkdownImage(url, 'session', async (_session, path) => {
            actualPath = path;
            return { success: true, content: png };
        });
        expect(actualPath).toBe(expectedPath);
    });
    it.each(['https://example.com/a.png', 'http://example.com/a.png', `data:image/png;base64,${png}`, 'blob:https://example.com/image-id', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E'])('preserves browser-readable image %s', async (url) => {
        expect(await resolveMarkdownImage(url, undefined, unavailable)).toBe(url);
    });
    it('does not reinterpret protocol-relative remote images as local files', async () => {
        expect(await resolveMarkdownImage('//example.com/a.png', undefined, unavailable)).toBe('https://example.com/a.png');
    });
    it('requires a session for local files', async () => {
        await expect(resolveMarkdownImage('/workspace/a.png', undefined, unavailable)).rejects.toThrow();
    });
    it.each(['javascript:alert(1)', 'ftp://example.com/a.png', 'file://other-host/a.png', '/workspace/secrets.env', 'data:text/html;base64,abc', 'sandbox:relative.png'])('rejects unsupported source %s without a file read', async (url) => {
        await expect(resolveMarkdownImage(url, 'session', unavailable)).rejects.toThrow('Unsupported image');
    });
    it('preserves workspace read failures for the retry UI', async () => {
        await expect(resolveMarkdownImage('/other/a.png', 'session', async () => ({ success: false, error: 'Access denied' }))).rejects.toThrow('Access denied');
    });
    it('rejects empty and malformed image responses', async () => {
        for (const content of ['', '<html>not an image</html>']) {
            await expect(resolveMarkdownImage('a.png', 'session', async () => ({ success: true, content }))).rejects.toThrow();
        }
    });
});
