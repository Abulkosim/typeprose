# Deployment

Phase 3 deployment hardening (plan §12): a single-host Docker Compose stack -
Postgres (named volume), one-shot migrations, the Fastify API, the static web
app behind Caddy (automatic HTTPS), and a nightly `pg_dump` backup.

This is the intended production shape from the plan's appendix; it is config,
not a running claim - provision a host with Docker before relying on it.

## First deploy

```sh
cp deploy/.env.example deploy/.env
# edit deploy/.env: set POSTGRES_PASSWORD, DATABASE_URL, CORS_ORIGIN, SITE_ADDRESS
docker compose -f deploy/docker-compose.yml up -d --build
```

Startup order is enforced by health/completion conditions: Postgres becomes
healthy → `migrate` applies Drizzle migrations and exits → `api` starts → `web`
(Caddy) serves the SPA and proxies `/api` to the API.

Seed the corpus once (runs the ingest against the live DB):

```sh
docker compose -f deploy/docker-compose.yml run --rm \
  -e DATABASE_URL="$DATABASE_URL" api pnpm ingest
```

## TLS

Point `SITE_ADDRESS` at a real domain whose DNS resolves to the host; Caddy
provisions and renews certificates automatically. For local testing use
`SITE_ADDRESS=localhost` (Caddy serves a local CA cert) or edit the Caddyfile to
`:80`.

## Backups

`db-backup` writes `pg_dump` gzips to the `backups` volume nightly and prunes
those older than 14 days. Restore with:

```sh
gunzip -c /path/to/prosetype-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose -f deploy/docker-compose.yml exec -T postgres psql "$DATABASE_URL"
```

Copy backups off-host (e.g. a periodic `rsync` of the volume) for real
durability - an on-host dump does not survive host loss.

## Updating

```sh
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

New migrations are applied by the `migrate` step before the API restarts.

## Not included (future work)

- Real email transport for account claim: the API ships a console mailer
  (logs the magic link). Implement `Mailer` in `apps/api/src/mail/` and inject
  it in `build.ts`, then add SMTP/provider env to `.env`.
- Off-host backup shipping, monitoring/alerting, and log aggregation.
