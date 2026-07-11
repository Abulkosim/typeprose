import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const validEnv = {
  DATABASE_URL: 'postgres://prosetype:prosetype@localhost:5432/prosetype',
  PORT: '4000',
  CORS_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
};

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);
    expect(config).toEqual({
      DATABASE_URL: 'postgres://prosetype:prosetype@localhost:5432/prosetype',
      PORT: 4000,
      CORS_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
    });
  });

  it('defaults PORT to 3001 and NODE_ENV to development', () => {
    const { PORT, ...rest } = validEnv;
    void PORT;
    const config = loadConfig({ ...rest, NODE_ENV: undefined });
    expect(config.PORT).toBe(3001);
    expect(config.NODE_ENV).toBe('development');
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    void DATABASE_URL;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'mysql://nope' })).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow();
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '70000' })).toThrow();
  });

  it('rejects a non-URL CORS_ORIGIN', () => {
    expect(() => loadConfig({ ...validEnv, CORS_ORIGIN: 'not a url' })).toThrow();
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow();
  });

  it('leaves email transport undefined when unset (console mailer default)', () => {
    const config = loadConfig(validEnv);
    expect(config.RESEND_API_KEY).toBeUndefined();
    expect(config.EMAIL_FROM).toBeUndefined();
  });

  it('accepts a Resend key paired with a sender', () => {
    const config = loadConfig({
      ...validEnv,
      RESEND_API_KEY: 're_test_123',
      EMAIL_FROM: 'prosetype <no-reply@prosetype.app>',
    });
    expect(config.RESEND_API_KEY).toBe('re_test_123');
    expect(config.EMAIL_FROM).toBe('prosetype <no-reply@prosetype.app>');
  });

  it('rejects a Resend key with no EMAIL_FROM', () => {
    expect(() => loadConfig({ ...validEnv, RESEND_API_KEY: 're_test_123' })).toThrow(/EMAIL_FROM/);
  });
});
