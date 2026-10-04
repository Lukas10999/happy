import { readlinkSync } from 'node:fs';

/** Linux PID namespace changes when a container is recreated, unlike host uptime. */
export function currentProcessNamespace(): string | undefined {
    try { return readlinkSync('/proc/self/ns/pid'); }
    catch { return undefined; }
}
