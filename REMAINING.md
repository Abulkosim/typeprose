# REMAINING — deploy steps

## Owner steps (external - I can't do these for you)

1. **Register** `typeprose.com` (confirm it's available).
2. **Provision a VPS** with Docker + Compose (Hetzner CX22 / DO basic droplet is
  plenty). Open ports 80 and 443.
3. **Create a Resend account**, verify the `typeprose.com` sending domain (adds
  SPF/DKIM DNS records), and mint an API key.
4. **Point DNS**: an `A` record for `typeprose.com` (and `www` if wanted) at the
  VPS IP. Caddy provisions TLS automatically once it resolves.
