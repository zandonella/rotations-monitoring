import http from 'node:http';
import { config } from './config.ts';
import { sendAlert } from './notify.ts';
import { getState, updateCheck, type CheckResult } from './state.ts';
import { checkHeartbeat } from './checks/heartbeat.ts';
import { checkSiteUp } from './checks/siteUp.ts';
import { checkFreshness } from './checks/freshness.ts';
import { checkPiHealth } from './checks/piHealth.ts';
import { runBackup, msUntilNextBackup } from './backup.ts';

const startedAt = Date.now();

async function runCheck(
    name: string,
    title: string,
    fn: () => Promise<CheckResult>,
) {
    let result: CheckResult;
    try {
        result = await fn();
    } catch (error) {
        result = {
            status: 'warn',
            detail: `Check threw unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const { changed, previous } = updateCheck(name, result);
    console.log(`[${name}] ${result.status}: ${result.detail}`);

    if (!changed) return;

    if (result.status === 'ok' && previous !== 'ok') {
        await sendAlert('OK', `Recovered: ${title}`, result.detail);
    } else if (result.status === 'warn') {
        await sendAlert('WARN', `Degraded: ${title}`, result.detail);
    } else if (result.status === 'error') {
        await sendAlert('ERROR', title, result.detail);
    }
}

function scheduleBackup() {
    const delay = msUntilNextBackup();
    console.log(
        `Next backup in ${(delay / 60_000).toFixed(0)} min (daily at ${config.backupAtUtc} UTC).`,
    );

    setTimeout(async () => {
        await runCheck('backup', 'Daily database backup', runBackup);
        scheduleBackup();
    }, delay);
}

function startStatusServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
            return;
        }

        if (req.url === '/status' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify(
                    {
                        now: new Date().toISOString(),
                        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
                        checks: getState(),
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
    });

    server.listen(config.port, () => {
        console.log(`Status server listening on :${config.port}`);
    });
}

async function runWatchdog() {
    await runCheck('heartbeat', 'Daily update watchdog', checkHeartbeat);
}

async function runHealthChecks() {
    await runCheck('siteUp', 'Site uptime', checkSiteUp);
    await runCheck('freshness', 'Data freshness', checkFreshness);
    await runCheck('piHealth', 'Pi WOL scheduler', checkPiHealth);
}

startStatusServer();
scheduleBackup();

await runWatchdog();
await runHealthChecks();

setInterval(runWatchdog, config.heartbeatCheckIntervalSec * 1000);
setInterval(runHealthChecks, config.checkIntervalSec * 1000);
