import { z } from 'zod';

/** Zod-validated app config from environment variables (plan §12). */
export const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// connection string'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Parse and validate config from an env-shaped record (defaults to process.env).
 * Throws a ZodError listing every invalid/missing variable.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return configSchema.parse(env);
}
