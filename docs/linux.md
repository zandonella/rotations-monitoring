# Linux ingestion monitoring on the VPS

The monitor stays on the existing cloud Linux VPS alongside the frontend.
The ingestion host runs Riot Client and the collector, not a monitor daemon.
The original `npm start`, `src/index.ts`, `.env`, and `docker-compose.yml` remain
unchanged for the legacy Windows/Pi flow. Linux monitoring uses separate files.

## Architecture

```text
Ingestion host                         Shared Supabase                 VPS
half-hour Linux runner  ------------> linux_ingestion_status <-------- Linux monitor
Linux data processor    ------------> ingestion_heartbeat   <-------- Linux monitor
                                                               site/data checks
                                                               Discord + backups
```

No shared filesystem, SSH polling, or new inbound endpoint on the ingestion
host is required. If the host or its connection goes down, the last database
signals stop advancing and the VPS detects the missed run.

The Linux monitor checks:

- Processing heartbeat every 60 seconds. Warn at more than 5 minutes past the
  expected poll; error at more than 20 minutes. The deadline is capped at
  30 minutes after the last run so a leftover daily deadline cannot hide failure.
- Heartbeat `warn`/`error` immediately, even before its next expected deadline.
- `linux_ingestion_status` every 60 seconds for exhausted retries, interrupted
  jobs, or a running attempt older than 12 minutes. Recovery requires successful
  completion; starting another attempt does not clear an earlier failed run.
- Existing site uptime and active-sale freshness checks every five minutes.
- Existing daily backups when enabled. The Linux entry point makes no Pi/WOL calls.

Alerts/recoveries reuse the original Discord sender and state-change deduplication.
Linux state/backups live under `data-linux/`, separately from the legacy monitor.
`/healthz` is process liveness; `/status` contains ingestion health.

## Database contract

Apply the ingestion repository's Linux-only migration explicitly to the database
used by both collector and VPS monitor:

`linux/migrations/20261002000000_linux_ingestion_status.sql`

This creates a service-role-only table (RLS enabled, no public policies) with one
`runner_id = direct` row. The runner reports `running`, `ok`, `error`, or
`interrupted`, attempt number, timestamp and previous terminal result. Only
operational state is sent; Riot credentials and tokens are never included.
The table has no OG-image dispatch trigger and does not alter the legacy heartbeat.

The runner retains its local JSON/journal for debugging, but the monitor does not
read those files. Status publication is bounded to five seconds and best-effort:
if Supabase is unreachable, ingestion still runs and the VPS observes stale
signals. An outage before the reporter starts is likewise detected by lateness.

## Deployment on the existing VPS

1. Apply the separate Linux status migration during the Linux production rollout.
2. Copy `.env.linux.example` to `.env.linux` and use the same production Supabase
   project, site, Discord destination and backup connection as the existing monitor.
3. Select `npm run start:linux`, or use the separate compose file:
   `docker compose -f docker-compose.linux.yml up -d --build`.
4. Inspect `/status` and confirm `heartbeat`, `linuxRunner`, `siteUp`, and `freshness`.

The Linux compose file publishes loopback port 8081 and stores state/backups under
`data-linux/`; keep `PORT=8080` inside that container. Stop the legacy monitor when
switching the production role, to avoid duplicate Discord alerts and backups.
No changes to the VPS deployment have been made from the lab.

## Testing without running a monitor on the ingestion host

```bash
npm run test:linux
npm run check:linux:local
```

The second command makes one-shot checks of the sibling ingestion lab's guarded
local Supabase and then exits. It starts no server, sends no Discord messages,
and performs no backups. It verifies the same database contract that the VPS
will read after deployment. The local Supabase setup helper applies the Linux
status migration, including after a reset.

The previously installed `rotations-lab-monitor.service` has been stopped and
disabled. Its installer and unit have been removed from this branch. The
half-hour ingestion timer and Riot Client service remain active.

For the coordinated production cutover, follow the ingestion repository’s
`docs/linux-production.md`. Pull both repositories after their Linux branches
are merged into main; stop the old compose service before starting this one.
The new host port is 8081, so update any existing health-check proxy accordingly.
