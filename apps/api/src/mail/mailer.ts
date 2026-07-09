/**
 * Outbound email (Phase 3, plan §10.3, account claim). Behind an interface so
 * the transport is swappable. The default dev transport logs the magic link
 * instead of sending it — no SMTP dependency or credentials in dev scope. A
 * real provider is future work: implement `Mailer` and inject it in build.ts.
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
