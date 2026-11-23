import { existsSync } from 'node:fs';
import { z } from 'zod';

// Node 20.12+ can load .env files natively, so no dotenv dependency is needed.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().min(1).default('./data/workbench.db'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(5),
  MAX_FILES: z.coerce.number().int().positive().max(20).default(10),
  MAX_CHARS_PER_DOC: z.coerce.number().int().positive().default(100_000),
  CHUNK_SIZE: z.coerce.number().int().positive().default(4000),
  LLM_PROVIDER: z.enum(['mock']).default('mock'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  MAX_FILE_SIZE_BYTES: parsed.data.MAX_FILE_SIZE_MB * 1024 * 1024,
};

export type Config = typeof config;
