import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const resolvedDatabaseUrl =
  process.env.DATABASE_URL
  ?? process.env.DATABASE_PRIVATE_URL
  ?? process.env.POSTGRES_URL
  ?? process.env.POSTGRESQL_URL
  ?? process.env.PGURI;

if (!process.env.DATABASE_URL && resolvedDatabaseUrl) {
  // Normalize provider-specific variable names so all imports share one source.
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

if (!resolvedDatabaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: resolvedDatabaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
