function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

function num(name: string, fallback: number): number {
    const value = process.env[name]?.trim();
    if (!value) return fallback;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`Env var ${name} must be a number, got: ${value}`);
    }
    return parsed;
}

function bool(name: string, fallback: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) return fallback;
    return ['1', 'true', 'yes'].includes(value);
}

export const config = {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseKey: required('SUPABASE_KEY'),
    supabaseDbUrl: process.env.SUPABASE_DB_URL?.trim() ?? '',

    siteUrl: process.env.SITE_URL?.trim() || 'https://rotations.lol',
    wolApiIp: process.env.WOL_API_IP?.trim() ?? '',
    piHealthEnabled: bool('PI_HEALTH_ENABLED', false),

    degradedAfterMin: num('DEGRADED_AFTER_MIN', 5),
    errorAfterMin: num('ERROR_AFTER_MIN', 20),

    heartbeatCheckIntervalSec: num('HEARTBEAT_CHECK_INTERVAL_SEC', 60),
    checkIntervalSec: num('CHECK_INTERVAL_SEC', 300),

    backupEnabled: bool('BACKUP_ENABLED', true),
    backupAtUtc: process.env.BACKUP_AT_UTC?.trim() || '01:00',
    backupRetentionDays: num('BACKUP_RETENTION_DAYS', 14),
    backupDir: 'data/backups',

    stateFile: 'data/state.json',
    port: num('PORT', 8080),
};
