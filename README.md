# rotations-monitor

Watchdog, health checks, and daily database backups for [rotations.lol](https://rotations.lol). Runs as a single always-on container on the VPS and alerts through the existing Discord webhook.

## What it does

| Check | Cadence | Alert |
|---|---|---|
| **Daily update watchdog** — reads the `ingestion_heartbeat` row written by `processClientData.ts` | 60s | `next_expected_at` + 5 min late → yellow warn; + 20 min → red error with role ping |
| **Site uptime** — `GET SITE_URL` | 5 min | 3 consecutive failures → red error with role ping |
| **Data freshness** — active rows in `CatalogSale` / `MythicSale` | 5 min | 2 consecutive empty reads → warn ("Sale ended" banner is showing) |
| **Pi WOL scheduler** — `GET http://WOL_API_IP:3000/health` over Tailscale, cross-checks a wake timer covers `next_expected_at` | 5 min | 3 consecutive failures or missing wake timer → warn |
| **Daily backup** — `pg_dump` schema + data dumps of `public,auth,storage` to `data/backups/`, pruned after `BACKUP_RETENTION_DAYS` | daily at `BACKUP_AT_UTC` | failure → warn |

Every alert fires once per state change; a recovery message is sent when a check returns to OK. Alert state persists in `data/state.json`, so container restarts don't re-ping.

- `GET /status` — JSON snapshot of all check states
- `GET /healthz` — plain 200 for external supervision

## Setup

Requires Node 24+ locally (native TypeScript), or just Docker on the VPS.

```bash
cp .env.example .env   # fill in values
npm install
npm start              # local run
```

`SUPABASE_DB_URL` must be the **direct connection / session pooler** string (port 5432) from the Supabase dashboard — the transaction pooler (6543) doesn't support pg_dump.

## Deploy on the VPS

```bash
git clone <this repo> && cd rotations-monitor
cp .env.example .env   # fill in values
docker compose up -d --build
curl localhost:8080/status
```

Update: `git pull && docker compose up -d --build`.

### Tailscale prerequisite

The Pi check needs the VPS on the same tailnet as the Pi (`100.99.1.41`). Until then leave `PI_HEALTH_ENABLED=false` — the check reports OK/disabled and nothing alerts.

### Pi `/health` endpoint

The schedule-wake Flask app on the Pi exposes `GET /health` returning `{"ok": true, "pending_wakes": [<ISO timestamps>]}` built from `systemctl list-timers pc-wake-*`. With that in place, set `PI_HEALTH_ENABLED=true` here.

## Restoring a backup

```bash
psql "$SUPABASE_DB_URL" -f data/backups/prod-schema-<ts>.sql   # structure (fresh project only)
psql "$SUPABASE_DB_URL" -f data/backups/prod-data-<ts>.sql     # rows
```

## Verifying the watchdog

1. Set the heartbeat row's `next_expected_at` to 30 min ago (Supabase table editor) → within a minute a yellow degradation embed arrives, followed by a red ping.
2. Restore the row (or wait for the next real run) → recovery message.
3. `docker compose restart` while in an alert state → no duplicate ping.

## Related

- Ingestion (writes the heartbeat): `mythic-shop-api` / rotations-ingestion
- Frontend: [rotations-lol](https://github.com/zandonella/rotations-lol)
