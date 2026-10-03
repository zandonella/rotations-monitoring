import assert from 'node:assert/strict';
import test from 'node:test';

test('VPS runner check reads the remote database contract, including pre-processing failures', async t => {
    let response: { data: unknown; error: unknown } = { data: null, error: null };
    t.mock.module('../src/config.ts', {
        namedExports: { config: { degradedAfterMin: 5, errorAfterMin: 20 } },
    });
    t.mock.module('../src/supabase.ts', {
        namedExports: { supabase: { from(table: string) {
            assert.equal(table, 'linux_ingestion_status');
            const query = {
                select() { return query; },
                eq(column: string, value: string) {
                    assert.equal(column, 'runner_id'); assert.equal(value, 'direct'); return query;
                },
                maybeSingle() { return query; },
                abortSignal(signal: AbortSignal) { assert.ok(signal); return Promise.resolve(response); },
            };
            return query;
        } } },
    });
    const { checkLinuxRunner } = await import('../src/linux/checks.ts');
    assert.equal((await checkLinuxRunner()).status, 'warn');
    response = { data: null, error: { message: 'unavailable' } };
    assert.equal((await checkLinuxRunner()).status, 'warn');
    for (const status of ['ok', 'error', 'interrupted']) {
        response = { data: { status, attempt: 3, updated_at: new Date().toISOString(), last_result: status }, error: null };
        assert.equal((await checkLinuxRunner()).status, status === 'ok' ? 'ok' : 'error');
    }
});
