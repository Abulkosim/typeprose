# Remaining work — deployment

The product is code-complete through Phase 2 (+ the Phase 3 batch). What's left
is standing it up on a real host. Everything below is **infrastructure and
external accounts** — the code side of email is now done.

## Done (2026-07-11)

- **Real email transport.** `createResendMailer` (native `fetch`, no SDK) is
  wired into `build.ts`; it activates when `RESEND_API_KEY` + `EMAIL_FROM` are
  set, else the console mailer logs the link. Config enforces the pair.
- **Domain settled.** `prosetype.app` — placeholders swapped in the web meta
  (`index.html`, `sitemap.xml`, `robots.txt`) and `deploy/.env.example`.

## Owner steps (external — I can't do these for you)

1. **Register `prosetype.app`** (confirm it's available). Note: the entire
   `.app` TLD is HSTS-preloaded, so browsers force HTTPS — there is no HTTP
   fallback. Fine here (Caddy auto-provisions TLS), just don't expect `http://`
   to work even for a quick test.
2. **Provision a VPS** with Docker + Compose (Hetzner CX22 / DO basic droplet is
   plenty). Open ports 80 and 443.
3. **Create a Resend account**, verify the `prosetype.app` sending domain (adds
   SPF/DKIM DNS records), and mint an API key.
4. **Point DNS**: an `A` record for `prosetype.app` (and `www` if wanted) at the
   VPS IP. Caddy provisions TLS automatically once it resolves.

## Deploy (on the host, once the above is ready)

```sh
git clone https://github.com/Abulkosim/prosetype.git && cd prosetype
cp deploy/.env.example deploy/.env
# edit deploy/.env: POSTGRES_PASSWORD (+ matching DATABASE_URL), and the
# RESEND_API_KEY / EMAIL_FROM lines. CORS_ORIGIN/SITE_ADDRESS already = prosetype.app
docker compose -f deploy/docker-compose.yml up -d --build
# seed the corpus once against the live DB:
docker compose -f deploy/docker-compose.yml run --rm api pnpm ingest
```

Then smoke-test: load https://prosetype.app, type a run, and claim a profile to
confirm the Resend email actually arrives. See `deploy/README.md` for restore
and update procedures.

## Hardening (after first deploy)

- **Off-host backups.** The nightly `pg_dump` lives in an on-host volume and
  dies with the host. Ship it somewhere (rsync/S3/Backblaze on a cron).
- **Monitoring / alerting.** No uptime check or log aggregation yet. Even a
  simple external ping on `/api/v1/healthz` + Caddy access logs would do.
