import { config } from '../config.ts';
import type { CheckResult } from '../state.ts';

const FAILURES_BEFORE_ALERT = 3;

let consecutiveFailures = 0;

export async function checkSiteUp(): Promise<CheckResult> {
    try {
        const response = await fetch(config.siteUrl, {
            signal: AbortSignal.timeout(10_000),
            redirect: 'follow',
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        consecutiveFailures = 0;
        return {
            status: 'ok',
            detail: `${config.siteUrl} responded with HTTP ${response.status}.`,
        };
    } catch (error) {
        consecutiveFailures += 1;
        const message = error instanceof Error ? error.message : String(error);

        if (consecutiveFailures >= FAILURES_BEFORE_ALERT) {
            return {
                status: 'error',
                detail: `${config.siteUrl} unreachable for ${consecutiveFailures} consecutive checks: ${message}`,
            };
        }

        return {
            status: 'ok',
            detail: `Fetch failed (${consecutiveFailures}/${FAILURES_BEFORE_ALERT} before alert): ${message}`,
        };
    }
}
