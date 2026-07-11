/**
 * Outbound email (Phase 3, plan §10.3, account claim). Behind an interface so
 * the transport is swappable. The default dev transport logs the magic link
 * instead of sending it — no credentials in dev scope. Production wires the
 * Resend transport below via build.ts when RESEND_API_KEY is set.
 */
export interface Mailer {
  sendClaimLink(input: { email: string; url: string }): Promise<void>;
}

/** Logs the claim link (dev default). `log` is the Fastify logger's info fn. */
export function createConsoleMailer(log: (msg: string) => void): Mailer {
  return {
    async sendClaimLink({ email, url }) {
      log(`[claim] magic link for ${email}: ${url}`);
    },
  };
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Plain-text and HTML bodies for the claim email. */
function claimBodies(url: string): { text: string; html: string } {
  const text =
    `Claim your prosetype profile by opening this link:\n\n${url}\n\n` +
    `It expires in 30 minutes and can be used once. ` +
    `If you didn't request this, you can ignore this email.`;
  const html =
    `<p>Claim your prosetype profile by opening this link:</p>` +
    `<p><a href="${url}">${url}</a></p>` +
    `<p>It expires in 30 minutes and can be used once. ` +
    `If you didn't request this, you can ignore this email.</p>`;
  return { text, html };
}

/**
 * Resend transport (https://resend.com). Uses the native fetch — no SDK. `from`
 * is the verified sender, e.g. `prosetype <no-reply@prosetype.app>`. Throws on a
 * non-2xx response so the route surfaces the failure rather than silently
 * dropping the link.
 */
export function createResendMailer(opts: { apiKey: string; from: string }): Mailer {
  return {
    async sendClaimLink({ email, url }) {
      const { text, html } = claimBodies(url);
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: opts.from,
          to: email,
          subject: 'Claim your prosetype profile',
          text,
          html,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Resend send failed (${res.status}): ${detail}`);
      }
    },
  };
}
