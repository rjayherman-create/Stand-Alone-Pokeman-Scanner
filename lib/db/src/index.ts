import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  return databaseUrl;
}

type PgPool = InstanceType<typeof Pool>;

function createDb() {
  return drizzle(getPool(), { schema });
}

type Database = ReturnType<typeof createDb>;

let poolInstance: PgPool | undefined;
let dbInstance: Database | undefined;

function getProxyValue<T extends object>(
  target: T,
  property: PropertyKey,
): unknown {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

export function getPool(): PgPool {
  poolInstance ??= new Pool({ connectionString: requireDatabaseUrl() });
  return poolInstance;
}

export function getDb(): Database {
  dbInstance ??= createDb();
  return dbInstance;
}

export const pool = new Proxy({} as PgPool, {
  get(_target, property) {
    return getProxyValue(getPool(), property);
  },
});

export const db = new Proxy({} as Database, {
  get(_target, property) {
    return getProxyValue(getDb(), property);
  },
});

export * from "./schema";
