import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Locally DATABASE_URL comes from .env.local; the Docker migrate service sets it in the environment.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
