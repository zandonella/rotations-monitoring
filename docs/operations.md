# Windows ingestion monitoring and backups

See the [Linux ingestion monitoring guide](linux.md) for monitoring Linux collectors and email delivery.

Watchdog, health checks, and daily database backups for [rotations.lol](https://rotations.lol). Runs as a single always-on container on the VPS and alerts through a configured Discord webhook. Notifications are sent only when check status changes; only errors mention `DISCORD_MENTION_ROLE_ID`; warnings and recovery notifications do not mention the role.

## What it does

| Check | Cadence | Alert |
|---|---|---|
| The daily update watchdog reads the `ingestion_heartbeat` row written by ingestion. | 60s | Warns after 5 minutes late and reports an error with a role mention after 20 minutes. |
| Site uptime checks request `SITE_URL`. | 5 min | Reports an error with a role mention after 3 consecutive failures. |
| Data freshness checks active `CatalogSale` and `MythicSale` rows. | 5 min | Warns after 2 consecutive empty reads. |
| The scheduler check requests its health endpoint and checks for the next expected wake timer. | 5 min | Warns after 3 consecutive request failures, or immediately when a reachable scheduler has no matching future wake timer. |
| Daily backups save `public`, `auth`, and `storage` schema and data dumps in `data/backups/` for the configured retention period. | daily at `BACKUP_AT_UTC` | Warns if a backup fails. |

Every alert fires once per state change; a recovery message is sent when a check returns to OK. Alert state persists in `data/state.json`, so container restarts don't re-ping.

- `GET /status` returns a JSON snapshot of all check states.
- `GET /healthz` returns HTTP 200 for external supervision.

## Setup

Use Node 24 for a native process or Docker for container deployment. Configure local Supabase for development.

```bash
cp .env.example .env   # fill in values
npm install
npm start              # local run
```

`SUPABASE_DB_URL` must be the **direct connection / session pooler** string (port 5432) from the Supabase dashboard. The transaction pooler on port 6543 does not support pg_dump.

## Deploy on the VPS

```bash
git clone https://github.com/zandonella/rotations-monitoring.git
cd rotations-monitoring
cp .env.example .env   # fill in values
docker compose up -d --build
curl localhost:8080/status
```

To update the service, update its checkout to the intended revision and run `docker compose up -d --build`.

### Tailscale prerequisite

The Pi check needs the VPS on the same tailnet as the Pi. Until then leave `PI_HEALTH_ENABLED=false`. The check reports a disabled state without alerts.

### Pi `/health` endpoint

The schedule-wake Flask app on the Pi exposes `GET /health` returning `{"ok": true, "pending_wakes": [<ISO timestamps>]}` built from `systemctl list-timers pc-wake-*`. Set `WOL_API_IP` to your scheduler address and enable `PI_HEALTH_ENABLED` when it is reachable.

## Restoring a backup

Choose a prepared empty restore target and confirm the schema and data files belong to the same backup. Set `RESTORE_DB_URL` to that target, `SCHEMA_BACKUP` to the schema file, and `DATA_BACKUP` to the data file. Windows backups live in `data/backups/`; Linux backups live in `data-linux/backups/`.

```bash
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_BACKUP"
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$DATA_BACKUP"
```

## Verifying the watchdog

Use a local development database for this check.

1. Set the local heartbeat row's `next_expected_at` to 30 minutes ago and check for warning and error notifications.
2. Restore the row and check for a recovery message.
3. Run `docker compose restart` while in an alert state and confirm that no duplicate mention is sent.

## Related

- The [ingestion pipeline](https://github.com/zandonella/rotations-ingestion) writes the heartbeat.
- The [web application](https://github.com/zandonella/rotations-lol) displays catalog and rotation data.
