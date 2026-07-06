import { config } from '../config.ts';
import type { CheckResult } from '../state.ts';
import { fetchHeartbeat } from './heartbeat.ts';

const FAILURES_BEFORE_ALERT = 3;

// A wake timer this close to next_expected_at counts as covering it.
const WAKE_MATCH_WINDOW_MS = 15 * 60_000;

let consecutiveFailures = 0;

function parseWakeTime(value: unknown): Date | null {
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'number' && value > 0) {
        // systemd reports usec since epoch; also tolerate ms and seconds.
        if (value > 1e14) return new Date(value / 1000);
        if (value > 1e11) return new Date(value);
        return new Date(value * 1000);
    }

    return null;
}

export async function checkPiHealth(): Promise<CheckResult> {
    if (!config.piHealthEnabled || !config.wolApiIp) {
        return {
            status: 'ok',
            detail: 'Pi health check disabled (PI_HEALTH_ENABLED=false).',
        };
    }

    let pendingWakes: Date[];
    try {
        const response = await fetch(
            `http://${config.wolApiIp}:3000/health`,
            { signal: AbortSignal.timeout(5_000) },
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as { pending_wakes?: unknown[] };
        pendingWakes = (body.pending_wakes ?? [])
            .map(parseWakeTime)
            .filter((date): date is Date => date !== null);

        consecutiveFailures = 0;
    } catch (error) {
        consecutiveFailures += 1;
        const message = error instanceof Error ? error.message : String(error);

        if (consecutiveFailures >= FAILURES_BEFORE_ALERT) {
            return {
                status: 'warn',
                detail: `Pi WOL scheduler unreachable for ${consecutiveFailures} consecutive checks: ${message}`,
            };
        }

        return {
            status: 'ok',
            detail: `Pi fetch failed (${consecutiveFailures}/${FAILURES_BEFORE_ALERT} before alert): ${message}`,
        };
    }

    // Cross-check: is a wake timer scheduled near the next expected update?
    try {
        const heartbeat = await fetchHeartbeat();
        if (heartbeat) {
            const expected = new Date(heartbeat.next_expected_at);
            if (expected.getTime() > Date.now()) {
                const covered = pendingWakes.some(
                    (wake) =>
                        Math.abs(wake.getTime() - expected.getTime()) <=
                        WAKE_MATCH_WINDOW_MS,
                );

                if (!covered) {
                    return {
                        status: 'warn',
                        detail:
                            `Pi is up but no wake timer covers the next expected update (${expected.toISOString()}). ` +
                            `Pending wakes: ${pendingWakes.map((wake) => wake.toISOString()).join(', ') || 'none'}.`,
                    };
                }
            }
        }
    } catch (error) {
        return {
            status: 'ok',
            detail: `Pi is up; wake cross-check skipped (${error instanceof Error ? error.message : String(error)}).`,
        };
    }

    return {
        status: 'ok',
        detail: `Pi is up. Pending wakes: ${pendingWakes.map((wake) => wake.toISOString()).join(', ') || 'none'}.`,
    };
}
