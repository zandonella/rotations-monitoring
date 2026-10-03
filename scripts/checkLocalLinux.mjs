// One-shot contract verification against local Supabase. No server or monitor daemon.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const ingestion = path.resolve(root, '../rotations-ingestion');
const env = parseEnv(fs.readFileSync(path.join(ingestion, '.env.local'), 'utf8'));
const url = new URL(env.SUPABASE_URL);
if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/' || !env.SUPABASE_KEY) {
    throw new Error('The lab monitor requires local ingestion Supabase credentials.');
}
Object.assign(process.env, {
    SUPABASE_URL: url.origin, SUPABASE_KEY: env.SUPABASE_KEY, SUPABASE_DB_URL: '',
    DISCORD_WEBHOOK_URL: '', DISCORD_MENTION_ROLE_ID: '', BACKUP_ENABLED: 'false',
    PI_HEALTH_ENABLED: 'false', WOL_API_IP: '', SITE_URL: 'http://127.0.0.1:55430/health',
    LINUX_POLL_INTERVAL_MINUTES: '30',
    DEGRADED_AFTER_MIN: '5', ERROR_AFTER_MIN: '20',
    HEARTBEAT_CHECK_INTERVAL_SEC: '60', CHECK_INTERVAL_SEC: '300',
});
// Enforce loopback destinations, bounded requests, and no redirects in the lab.
const nativeFetch = globalThis.fetch;
const allowedOrigins = new Set([url.origin, 'http://127.0.0.1:55430']);
globalThis.fetch = (input, init = {}) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!allowedOrigins.has(target.origin)) throw new Error('Lab monitor refused a non-local request.');
    return nativeFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
};
const { checkLinuxHeartbeat, checkLinuxRunner } = await import('../src/linux/checks.ts');
const result = { heartbeat: await checkLinuxHeartbeat(), linuxRunner: await checkLinuxRunner() };
console.log(JSON.stringify(result, null, 2));
if (Object.values(result).some(check => check.status !== 'ok')) process.exitCode = 1;
