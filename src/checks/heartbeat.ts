import { config } from '../config.ts';
import { supabase } from '../supabase.ts';
import type { CheckResult } from '../state.ts';

export type HeartbeatRow = {
    script_name: string;
    last_run_at: string;
    next_expected_at: string;
    status: 'ok' | 'warn' | 'error';
    message: string | null;
};

export async function fetchHeartbeat(): Promise<HeartbeatRow | null> {
    const { data, error } = await supabase
        .from('ingestion_heartbeat')
        .select('*')
        .eq('script_name', 'processClientData')
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to read ingestion_heartbeat: ${error.message}`);
    }

    return data as HeartbeatRow | null;
}

export async function checkHeartbeat(): Promise<CheckResult> {
    let row: HeartbeatRow | null;
    try {
        row = await fetchHeartbeat();
    } catch (error) {
        return {
            status: 'warn',
            detail: error instanceof Error ? error.message : String(error),
        };
    }

    if (!row) {
        return {
            status: 'warn',
            detail: 'No ingestion_heartbeat row found yet. Has processClientData run since the heartbeat change was deployed?',
        };
    }

    const expected = new Date(row.next_expected_at);
    const lateMin = (Date.now() - expected.getTime()) / 60_000;
    const lastRun = new Date(row.last_run_at).toISOString();

    if (lateMin > config.errorAfterMin) {
        return {
            status: 'error',
            detail:
                `Daily update is ${Math.floor(lateMin)} min late ` +
                `(expected by ${expected.toISOString()}, last run ${lastRun}). ` +
                'Check the site and the League PC.',
        };
    }

    if (lateMin > config.degradedAfterMin) {
        return {
            status: 'warn',
            detail:
                `Daily update is ${Math.floor(lateMin)} min late ` +
                `(expected by ${expected.toISOString()}, last run ${lastRun}).`,
        };
    }

    const messageSuffix = row.message ? ` Message: ${row.message}` : '';
    return {
        status: 'ok',
        detail: `Last run ${lastRun} (status: ${row.status}), next expected ${expected.toISOString()}.${messageSuffix}`,
    };
}
