# Rotations.lol monitoring

Checks [Rotations.lol](https://rotations.lol) service health, ingestion, and data freshness, takes database backups, and sends Discord alerts when check status changes.

## Monitoring modes

| Mode | Watches | Setup |
|---|---|---|
| Linux ingestion | Linux ingestion and email status, site uptime, data freshness, and daily backups. | [Linux monitoring guide](docs/linux.md) |
| Windows ingestion | The ingestion heartbeat, site uptime, data freshness, the optional wake scheduler, and daily backups. | [Windows monitoring and backup guide](docs/operations.md) |

Alert state persists across restarts. Recovery notifications show when a check returns to normal. Only errors mention the configured Discord role.

## Local setup

Use Node 24 and a local Supabase instance.

```sh
cp .env.example .env
npm install
```

Set the local Supabase credentials and any optional checks in `.env`, then start the Windows monitoring entry point.

```sh
npm start
```

The [Linux guide](docs/linux.md) covers its separate configuration and entry point.

## Status endpoints

- `GET /status` returns the state of each check.
- `GET /healthz` returns HTTP 200 for external supervision.

## Deployment and backups

Each mode has its own Docker Compose configuration and persistent state directory. Follow the guide for the ingestion setup you use.

Both monitoring modes use `pg_dump` for backups and require a direct database connection or session pooler on port 5432. Configure retention with `BACKUP_RETENTION_DAYS`.

See the [operations guide](docs/operations.md) for backup restore commands, watchdog checks, and deployment instructions.

## Related projects

- [Ingestion](https://github.com/zandonella/rotations-ingestion) collects the data this service monitors.
- The [web app](https://github.com/zandonella/rotations-lol) displays the catalog and rotations.
