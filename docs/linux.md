# Linux ingestion monitoring

Run the monitor on a separate host from ingestion so it can detect ingestion-host outages. It reads operational status from Supabase and checks the public site. It needs no shared filesystem or inbound connection to the ingestion host.

## Checks

| Check | Behavior |
|---|---|
| Processing heartbeat | Checks every minute, reports heartbeat warnings and errors, and detects late ingestion. Default lateness thresholds are 5 minutes for a warning and 20 minutes for an error. |
| Collection runner | Detects failed or interrupted collection and attempts running for more than 12 minutes. Recovery requires a successful completion. |
| Email delivery | Detects failed or stuck batches and warns when successful ingestion has no following email completion after five minutes. |
| Site and sales | Checks site availability and active-sale freshness every five minutes. |
| Backups | Runs the configured daily database backup when enabled. |

Alerts fire on status changes. Only errors mention the configured Discord role. State and backups persist under `data-linux/`. The Linux entry point does not check or call a wake scheduler.

## Database requirements

The collector and monitor use the same Supabase project. The ingestion repository provides the required migrations.

- `linux/migrations/20261002000000_linux_ingestion_status.sql` adds the private runner status table.
- `supabase/migrations/20261008000000_backend_email_batches.sql` adds the private email status and batching functions.

The monitor reads `ingestion_heartbeat`, `linux_ingestion_status`, and `linux_email_status`. Operational tables require service role access and contain status information rather than Riot credentials.

## Configuration and deployment

Copy `.env.linux.example` to `.env.linux` and configure Supabase, the site URL, Discord, and the backup connection. For the hourly ingestion timer, use `LINUX_POLL_INTERVAL_MINUTES=60`.

For a native process, run the following command.

```sh
npm run start:linux
```

For Docker, keep `PORT=8080` in the container configuration and start the separate Compose service.

```sh
docker compose -f docker-compose.linux.yml up -d --build
curl --fail http://127.0.0.1:8081/status
```

Compose exposes the monitor on loopback port 8081 and persists `data-linux/`. When replacing a Windows monitor, stop that monitor first to avoid duplicate alerts and backups. Update any health-check proxy to use the selected monitor's port.

`GET /healthz` reports process liveness. `GET /status` reports individual check results, including `heartbeat`, `linuxRunner`, `emails`, `siteUp`, and `freshness`.

## Local checks

```sh
npm run test:linux
npm run check:linux:local
```

The contract check reads the sibling ingestion checkout's `.env.local` and checks its loopback Supabase instance. It sends no Discord alerts, performs no backups, and exits after reporting the results. Start the local database using the ingestion repository's setup helper first.

See the [ingestion deployment guide](https://github.com/zandonella/rotations-ingestion/blob/main/docs/linux-production.md) for collector services and the [operations guide](operations.md) for backup and restore commands.
