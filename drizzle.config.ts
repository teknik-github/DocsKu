import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// For `pnpm db:generate` / `pnpm db:migrate`; DATABASE_URL comes from .env.local. (The app also migrates itself at startup.)
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
