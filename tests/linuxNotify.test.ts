import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAlert } from '../src/notify.ts';

test('monitor mentions staff only on errors', async t => {
    const keys = ['DISCORD_WEBHOOK_URL', 'DISCORD_MENTION_ROLE_ID'];
    const previous = { ...process.env };
    Object.assign(process.env, { DISCORD_WEBHOOK_URL: 'https://discord.invalid/test', DISCORD_MENTION_ROLE_ID: ' 123 ' });
    t.after(() => {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
    const payloads: any[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
        payloads.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
    });
    for (const level of ['WARN', 'ERROR', 'OK'] as const) await sendAlert(level, 'Health check', 'Details');
    assert.equal(payloads[1].content, '<@&123>');
    assert.deepEqual(payloads[1].allowed_mentions, { parse: [], roles: ['123'] });
    for (const payload of [payloads[0], payloads[2]]) {
        assert.equal(payload.content, undefined);
        assert.deepEqual(payload.allowed_mentions, { parse: [] });
    }
});
