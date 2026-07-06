import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import type { CheckResult } from './state.ts';

function pgDump(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('pg_dump', [...args, config.supabaseDbUrl], {
            stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `pg_dump exited with code ${code}: ${stderr.trim()}`,
                    ),
                );
            }
        });
    });
}

function backupTimestamp(date: Date) {
    // Matches mythic-shop-api/backupDatabase.sh: YYYY-MM-DD-HHMMSS
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
        `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
    );
}

function pruneOldBackups(): number {
    const cutoff = Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const file of fs.readdirSync(config.backupDir)) {
        if (!file.endsWith('.sql')) continue;
        const filePath = path.join(config.backupDir, file);
        if (fs.statSync(filePath).mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            pruned += 1;
        }
    }

    return pruned;
}

export async function runBackup(): Promise<CheckResult> {
    if (!config.backupEnabled) {
        return { status: 'ok', detail: 'Backups disabled (BACKUP_ENABLED=false).' };
    }

    if (!config.supabaseDbUrl) {
        return {
            status: 'warn',
            detail: 'SUPABASE_DB_URL is not set; skipping database backup.',
        };
    }

    fs.mkdirSync(config.backupDir, { recursive: true });

    const timestamp = backupTimestamp(new Date());
    const schemaArgs = ['--schema=public', '--schema=auth', '--schema=storage', '--no-owner', '--no-privileges'];
    const schemaFile = path.join(config.backupDir, `prod-schema-${timestamp}.sql`);
    const dataFile = path.join(config.backupDir, `prod-data-${timestamp}.sql`);

    try {
        await pgDump(['--schema-only', ...schemaArgs, `--file=${schemaFile}`]);
        await pgDump(['--data-only', ...schemaArgs, `--file=${dataFile}`]);
    } catch (error) {
        return {
            status: 'warn',
            detail: `Database backup failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const pruned = pruneOldBackups();
    const dataSizeMb = (fs.statSync(dataFile).size / 1024 / 1024).toFixed(1);

    return {
        status: 'ok',
        detail: `Backup completed at ${new Date().toISOString()} (data dump ${dataSizeMb} MB, ${pruned} old file(s) pruned).`,
    };
}

export function msUntilNextBackup(): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec(config.backupAtUtc);
    if (!match) {
        throw new Error(
            `BACKUP_AT_UTC must be HH:MM (UTC), got: ${config.backupAtUtc}`,
        );
    }

    const next = new Date();
    next.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
    if (next.getTime() <= Date.now()) {
        next.setUTCDate(next.getUTCDate() + 1);
    }

    return next.getTime() - Date.now();
}
