import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('persistent outage escalation produces one error transition, including across monitor restart', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-escalation-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.mock.module('../src/config.ts', { namedExports: { config: { stateFile: path.join(root, 'state.json') } } });
    const { updateCheck } = await import('../src/state.ts');
    let errorTransitions = 0;
    for (const status of [...Array(6).fill('warn'), ...Array(12).fill('error')]) {
        const result = updateCheck('heartbeat', { status, detail: 'CommunityDragon outage; collection continues.' });
        if (result.changed && status === 'error') errorTransitions++;
    }
    assert.equal(errorTransitions, 1);
    const restarted = await import('../src/state.ts?restart-test');
    assert.equal(restarted.updateCheck('heartbeat', { status: 'error', detail: 'Still unavailable.' }).changed, false);
    assert.equal(restarted.updateCheck('heartbeat', { status: 'ok', detail: 'Recovered.' }).changed, true);
});
