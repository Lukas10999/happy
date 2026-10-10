const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { replacements, patchSource, patchVirtualizedLists } = require('./fix-virtualized-list-stale-frame-offset.cjs');

for (const layout of ['isolated', 'hoisted', 'nested']) test(`patches the dependency React Native resolves in a ${layout} install`, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-pnpm-patch-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = path.join(dir, 'node_modules');
    const store = layout === 'isolated' ? path.join(root, '.pnpm/react-native@0.83.1/node_modules') : root;
    const native = path.join(store, 'react-native');
    const dependency = path.join(layout === 'nested' ? path.join(native, 'node_modules') : store, '@react-native/virtualized-lists');
    fs.mkdirSync(native, { recursive: true });
    fs.mkdirSync(path.join(dependency, 'Lists'), { recursive: true });
    fs.writeFileSync(path.join(native, 'package.json'), '{"name":"react-native"}');
    fs.writeFileSync(path.join(dependency, 'package.json'), '{"name":"@react-native/virtualized-lists"}');
    if (layout === 'isolated') fs.symlinkSync(native, path.join(root, 'react-native'), 'dir');
    const file = path.join(dependency, 'Lists/ListMetricsAggregator.js');
    const upstream = replacements.map(([before]) => before).join('\n');
    fs.writeFileSync(file, upstream);
    assert.deepEqual(patchVirtualizedLists([root]), { installed: 1, changed: 1 });
    assert.equal(fs.readFileSync(file, 'utf8'), patchSource(upstream));
    assert.deepEqual(patchVirtualizedLists([root]), { installed: 1, changed: 0 });
    fs.writeFileSync(file, 'upstream changed');
    assert.throws(() => patchVirtualizedLists([root]), /Unexpected VirtualizedList/);
});

test('fails closed when React Native has no resolvable list dependency', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-pnpm-missing-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'react-native'));
    fs.writeFileSync(path.join(dir, 'react-native/package.json'), '{}');
    assert.throws(() => patchVirtualizedLists([dir]), /without @react-native\/virtualized-lists/);
});
