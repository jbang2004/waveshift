import type { Config } from 'drizzle-kit';

export default {
  schema: './db/*.ts',
  out: './db/migrations',
  dialect: 'sqlite',
} satisfies Config; 