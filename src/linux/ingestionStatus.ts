import type { CheckResult } from '../state.ts';
import type { HeartbeatRow } from '../checks/heartbeat.ts';

type Policy = { degradedAfterMin: number; errorAfterMin: number; pollMinutes: number };

export function heartbeatStatus(row: HeartbeatRow | null, policy: Policy, now = Date.now()): CheckResult {
    if (!row) return { status: 'warn', detail: 'No Linux ingestion heartbeat yet.' };
    const last = Date.parse(row.last_run_at);
    const expected = Date.parse(row.next_expected_at);
    if (!Number.isFinite(last) || !Number.isFinite(expected) || last > now + 60_000 || expected <= last) {
        return { status: 'error', detail: 'Linux ingestion heartbeat has invalid timestamps.' };
    }
    // A leftover daily heartbeat must not hide missed half-hour collections.
    const deadline = Math.min(expected, last + policy.pollMinutes * 60_000);
    const lateMin = (now - deadline) / 60_000;
    const context = `Last run ${row.last_run_at}; expected by ${new Date(deadline).toISOString()}.`;
    if (lateMin > policy.errorAfterMin) {
        return { status: 'error', detail: `Linux ingestion is ${Math.floor(lateMin)} min late. ${context} Check the Linux timer, Riot service, and run journal.` };
    }
    if (row.status === 'error') {
        return { status: 'error', detail: `Linux ingestion reported a failed run. ${context} ${row.message ?? 'Check the run journal.'}` };
    }
    if (lateMin > policy.degradedAfterMin) {
        return { status: 'warn', detail: `Linux ingestion is ${Math.floor(lateMin)} min late. ${context}` };
    }
    if (row.status === 'warn') return { status: 'warn', detail: `Linux ingestion reported warnings. ${context} ${row.message ?? ''}` };
    if (row.status !== 'ok') return { status: 'error', detail: 'Linux ingestion heartbeat has an unknown status.' };
    return { status: 'ok', detail: `${context} ${row.message ?? ''}` };
}

export function runnerStatus(value: unknown, policy: Policy, now = Date.now()): CheckResult {
    if (!value || typeof value !== 'object') return { status: 'error', detail: 'Invalid Linux runner status.' };
    const row = value as Record<string, unknown>;
    const updated = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
    if (!Number.isFinite(updated) || updated > now + 60_000) return { status: 'error', detail: 'Invalid Linux runner timestamp.' };
    const ageMin = (now - updated) / 60_000;
    if (row.status === 'error' || row.status === 'interrupted') {
        return { status: 'error', detail: `Linux runner ${row.status} at ${row.updatedAt}. Collection may have failed before a database heartbeat; check its journal.` };
    }
    if (row.status === 'running') {
        if (ageMin > 12) return { status: 'error', detail: 'Linux runner has exceeded its 12-minute job limit.' };
        if (row.lastResult === 'error' || row.lastResult === 'interrupted') {
            return { status: 'error', detail: 'Linux ingestion is retrying after a failed run; recovery requires a completed successful run.' };
        }
        return { status: 'ok', detail: `Linux ingestion running (attempt ${row.attempt ?? 'unknown'}).` };
    }
    if (row.status !== 'ok') return { status: 'error', detail: 'Unknown Linux runner status.' };
    const lateMin = ageMin - policy.pollMinutes;
    if (lateMin > policy.errorAfterMin) return { status: 'error', detail: 'Linux runner has stopped updating; check that the timer is active.' };
    if (lateMin > policy.degradedAfterMin) return { status: 'warn', detail: 'Linux runner is overdue; check the collection timer.' };
    return { status: 'ok', detail: `Linux runner completed successfully at ${row.updatedAt}.` };
}
