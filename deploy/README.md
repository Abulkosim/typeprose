# Deployment

Single-host Docker Compose stack: Postgres (named volume), one-shot
migrations, the Fastify API, the static web app behind Caddy (automatic
HTTPS), and a nightly `pg_dump` backup.

The live host already runs this shape (Hetzner; compose project id and
remote path deliberately still use the legacy `prosetype` names — see
`DECISIONS.md`). The steps below are for a fresh host or a rebuild.

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

Canonical host: `typeprose.com` (`CORS_ORIGIN` / `SITE_ADDRESS` in
`deploy/.env.example`).

## Email (Resend)

Account-claim magic links use Resend when both `RESEND_API_KEY` and
`EMAIL_FROM` are set; otherwise the API logs the link (console mailer).
For production: create a Resend account, verify the `typeprose.com`
sending domain (SPF/DKIM), mint an API key, and set both vars in
`deploy/.env`.

## Backups

`db-backup` writes `pg_dump` gzips to the `backups` volume nightly and prunes
those older than 14 days. Restore with:

```sh
gunzip -c /path/to/typeprose-YYYYMMDD-HHMMSS.sql.gz \
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

- Off-host backup shipping, monitoring/alerting, and log aggregation.
