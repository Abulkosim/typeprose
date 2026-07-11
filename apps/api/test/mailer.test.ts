import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsoleMailer, createResendMailer } from '../src/mail/mailer.ts';

describe('createConsoleMailer', () => {
  it('logs the claim link', async () => {
    const lines: string[] = [];
    const mailer = createConsoleMailer((msg) => lines.push(msg));
    await mailer.sendClaimLink({ email: 'ada@example.com', url: 'https://x/claim?token=abc' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ada@example.com');
    expect(lines[0]).toContain('https://x/claim?token=abc');
  });
});

describe('createResendMailer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the Resend API with the sender, recipient, and link', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const mailer = createResendMailer({
      apiKey: 're_test_123',
      from: 'prosetype <no-reply@prosetype.app>',
    });
    await mailer.sendClaimLink({
      email: 'ada@example.com',
      url: 'https://prosetype.app/claim?token=abc',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer re_test_123');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('prosetype <no-reply@prosetype.app>');
    expect(body.to).toBe('ada@example.com');
    expect(body.text).toContain('https://prosetype.app/claim?token=abc');
    expect(body.html).toContain('https://prosetype.app/claim?token=abc');
  });

  it('throws with the status and body on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const mailer = createResendMailer({ apiKey: 're_bad', from: 'x <no-reply@x.com>' });
    await expect(
      mailer.sendClaimLink({ email: 'a@b.com', url: 'https://x/claim?token=z' }),
    ).rejects.toThrow(/429.*rate limited/);
  });
});
