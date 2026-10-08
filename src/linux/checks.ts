import { config } from '../config.ts';
import { supabase } from '../supabase.ts';
import { heartbeatStatus, runnerStatus, emailStatus } from './ingestionStatus.ts';
import type { CheckResult } from '../state.ts';

const pollMinutes = Number(process.env.LINUX_POLL_INTERVAL_MINUTES || 60);
if (!Number.isSafeInteger(pollMinutes) || pollMinutes < 1 || pollMinutes > 60 || 60 % pollMinutes !== 0) {
    throw new Error('LINUX_POLL_INTERVAL_MINUTES must be a positive divisor of 60.');
}
const policy = { degradedAfterMin: config.degradedAfterMin, errorAfterMin: config.errorAfterMin, pollMinutes };

export async function checkLinuxHeartbeat(): Promise<CheckResult> {
    const { data, error } = await supabase.from('ingestion_heartbeat')
        .select('*').eq('script_name', 'processClientData')
        .maybeSingle().abortSignal(AbortSignal.timeout(10_000));
    if (error) return { status: 'warn', detail: 'Cannot read the Linux processing heartbeat from Supabase.' };
    return heartbeatStatus(data, policy);
}

export async function checkLinuxRunner(): Promise<CheckResult> {
    const { data, error } = await supabase.from('linux_ingestion_status')
        .select('status,attempt,updated_at,last_result').eq('runner_id', 'direct')
        .maybeSingle().abortSignal(AbortSignal.timeout(10_000));
    if (error) return { status: 'warn', detail: 'Cannot read Linux run status from Supabase. Check connectivity and the Linux-only status migration.' };
    if (!data) return { status: 'warn', detail: 'No Linux run status reported yet. Check the ingestion runner.' };
    return runnerStatus({
        status: data.status, attempt: data.attempt, updatedAt: data.updated_at, lastResult: data.last_result,
    }, policy);
}

export async function checkLinuxEmails(): Promise<CheckResult> {
    const results = await Promise.all([
        supabase.from('linux_email_status').select('status,updated_at').eq('runner_id', 'direct').maybeSingle().abortSignal(AbortSignal.timeout(10_000)),
        supabase.from('ingestion_heartbeat').select('last_run_at').eq('script_name', 'processClientData').maybeSingle().abortSignal(AbortSignal.timeout(10_000)),
    ]);
    if (results.some(result => result.error)) return { status: 'warn', detail: 'Cannot read hourly email status.' };
    return emailStatus(results[0].data, results[1].data?.last_run_at ?? null);
}
