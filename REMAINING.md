- **Real email transport.** `createResendMailer` (native `fetch`, no SDK) is
wired into `build.ts`; it activates when `RESEND_API_KEY` + `EMAIL_FROM` are
set, else the console mailer logs the link. Config enforces the pair.
- **Domain settled.** `typeprose.com` - placeholders swapped in the web meta
(`index.html`, `sitemap.xml`, `robots.txt`) and `deploy/.env.example`.

## Owner steps (external - I can't do these for you)

1. **Register** `typeprose.com` (confirm it's available). Note: the entire
  `.app` TLD is HSTS-preloaded, so browsers force HTTPS - there is no HTTP
   fallback. Fine here (Caddy auto-provisions TLS), just don't expect `http://`
   to work even for a quick test.
2. **Provision a VPS** with Docker + Compose (Hetzner CX22 / DO basic droplet is
  plenty). Open ports 80 and 443.
3. **Create a Resend account**, verify the `typeprose.com` sending domain (adds
  SPF/DKIM DNS records), and mint an API key.
4. **Point DNS**: an `A` record for `typeprose.com` (and `www` if wanted) at the
  VPS IP. Caddy provisions TLS automatically once it resolves.

