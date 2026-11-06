# Monitoring setup and operations

See the [Linux ingestion monitoring guide](linux.md) for monitoring Linux collectors and email delivery.

Watchdog, health checks, and daily database backups for [rotations.lol](https://rotations.lol). Runs as a single always-on container on the VPS and alerts through a configured Discord webhook. Notifications are sent only when check status changes; only errors mention `DISCORD_MENTION_ROLE_ID`; warnings and recovery notifications do not mention the role.

## What it does

| Check | Cadence | Alert |
|---|---|---|
| The daily update watchdog reads the `ingestion_heartbeat` row written by ingestion. | 60s | Warns after 5 minutes late and reports an error with a role mention after 20 minutes. |
| Site uptime checks request `SITE_URL`. | 5 min | Reports an error with a role mention after 3 consecutive failures. |
| Data freshness checks active `CatalogSale` and `MythicSale` rows. | 5 min | Warns after 2 consecutive empty reads. |
| The scheduler check requests its health endpoint and checks for the next expected wake timer. | 5 min | Warns after 3 consecutive failures or a missing wake timer. |
| Daily backups save `public`, `auth`, and `storage` schema and data dumps in `data/backups/` for the configured retention period. | daily at `BACKUP_AT_UTC` | Warns if a backup fails. |

Every alert fires once per state change; a recovery message is sent when a check returns to OK. Alert state persists in `data/state.json`, so container restarts don't re-ping.

- `GET /status` returns a JSON snapshot of all check states.
- `GET /healthz` returns HTTP 200 for external supervision.

## Setup

Requires Node 24+ locally (native TypeScript), or just Docker on the VPS.

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

To update the service, run `git pull` followed by `docker compose up -d --build`.

### Tailscale prerequisite

The Pi check needs the VPS on the same tailnet as the Pi. Until then leave `PI_HEALTH_ENABLED=false`. The check reports a disabled state without alerts.

### Pi `/health` endpoint

The schedule-wake Flask app on the Pi exposes `GET /health` returning `{"ok": true, "pending_wakes": [<ISO timestamps>]}` built from `systemctl list-timers pc-wake-*`. With that in place, set `PI_HEALTH_ENABLED=true` here.

## Restoring a backup

```bash
psql "$SUPABASE_DB_URL" -f data/backups/prod-schema-<ts>.sql   # structure (fresh project only)
psql "$SUPABASE_DB_URL" -f data/backups/prod-data-<ts>.sql     # rows
```

## Verifying the watchdog

Use a local development database for this check.

1. Set the local heartbeat row's `next_expected_at` to 30 minutes ago and check for warning and error notifications.
2. Restore the row and check for a recovery message.
3. Run `docker compose restart` while in an alert state and confirm that no duplicate mention is sent.

## Related

- The [ingestion pipeline](https://github.com/zandonella/rotations-ingestion) writes the heartbeat.
- The [web application](https://github.com/zandonella/rotations-lol) displays catalog and rotation data.
