import { supabase } from '../supabase.ts';
import type { CheckResult } from '../state.ts';

const SALE_TABLES = ['CatalogSale', 'MythicSale'] as const;

// Two consecutive stale reads (~10 min apart) before warning, to ride out the
// short gap between a sale ending and the refresh run repopulating the tables.
const STALE_READS_BEFORE_ALERT = 2;

let consecutiveStaleReads = 0;

export async function checkFreshness(): Promise<CheckResult> {
    const nowIso = new Date().toISOString();
    const staleTables: string[] = [];

    for (const table of SALE_TABLES) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('IsActive', true)
            .gt('SaleEndAt', nowIso);

        if (error) {
            return {
                status: 'warn',
                detail: `Failed to query ${table}: ${error.message}`,
            };
        }

        if (!count) {
            staleTables.push(table);
        }
    }

    if (staleTables.length === 0) {
        consecutiveStaleReads = 0;
        return {
            status: 'ok',
            detail: 'Active sales present in CatalogSale and MythicSale.',
        };
    }

    consecutiveStaleReads += 1;

    if (consecutiveStaleReads >= STALE_READS_BEFORE_ALERT) {
        return {
            status: 'warn',
            detail:
                `No active sales in ${staleTables.join(', ')} — ` +
                'the site is likely showing "Sale ended, new sale soon!".',
        };
    }

    return {
        status: 'ok',
        detail: `No active sales in ${staleTables.join(', ')} (${consecutiveStaleReads}/${STALE_READS_BEFORE_ALERT} before alert).`,
    };
}
