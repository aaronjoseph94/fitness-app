// Owns: drizzle-kit config. drizzle-kit only GENERATES migrations; `wrangler d1 migrations apply` is the only thing that applies them.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
