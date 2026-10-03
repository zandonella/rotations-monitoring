import assert from 'node:assert/strict';
import test from 'node:test';
import { heartbeatStatus, runnerStatus } from '../src/linux/ingestionStatus.ts';

const policy = { pollMinutes: 30, degradedAfterMin: 5, errorAfterMin: 20 };
const now = Date.parse('2026-10-02T12:32:00Z');
const row = {
    script_name: 'processClientData', status: 'ok' as const, message: null,
    last_run_at: '2026-10-02T12:00:05Z', next_expected_at: '2026-10-02T12:30:00Z',
};

test('Linux heartbeat handles normal polling, late runs, and immediate processing failures', () => {
    assert.equal(heartbeatStatus(row, policy, now).status, 'ok');
    assert.equal(heartbeatStatus(row, policy, now + 4 * 60_000).status, 'warn');
    assert.equal(heartbeatStatus(row, policy, now + 19 * 60_000).status, 'error');
    assert.equal(heartbeatStatus({ ...row, status: 'error' }, policy, now).status, 'error');
    assert.equal(heartbeatStatus({ ...row, status: 'warn' }, policy, now).status, 'warn');
});

test('Linux watchdog cannot be silenced by a leftover daily deadline or malformed heartbeat', () => {
    assert.equal(heartbeatStatus({ ...row, next_expected_at: '2026-10-03T00:00:00Z' }, policy, now + 19 * 60_000).status, 'error');
    assert.equal(heartbeatStatus(null, policy, now).status, 'warn');
    for (const change of [
        { last_run_at: 'invalid' }, { next_expected_at: 'invalid' },
        { last_run_at: '2026-10-03T00:00:00Z' }, { next_expected_at: row.last_run_at },
    ]) assert.equal(heartbeatStatus({ ...row, ...change }, policy, now).status, 'error');
});

test('runner failures before processing are visible and recovery waits for successful completion', () => {
    const run = { status: 'ok', updatedAt: '2026-10-02T12:31:00Z', attempt: 1 };
    assert.equal(runnerStatus(run, policy, now).status, 'ok');
    for (const status of ['error', 'interrupted', 'unknown']) {
        assert.equal(runnerStatus({ ...run, status }, policy, now).status, 'error');
    }
    assert.equal(runnerStatus({ ...run, status: 'running', lastResult: 'error' }, policy, now).status, 'error');
    assert.equal(runnerStatus({ ...run, status: 'running', lastResult: 'ok' }, policy, now).status, 'ok');
    assert.equal(runnerStatus({ ...run, status: 'running' }, policy, now + 12 * 60_000).status, 'error');
    assert.equal(runnerStatus(run, policy, now + 35 * 60_000).status, 'warn');
    assert.equal(runnerStatus(run, policy, now + 50 * 60_000).status, 'error');
    assert.equal(runnerStatus({ ...run, updatedAt: 'invalid' }, policy, now).status, 'error');
});
