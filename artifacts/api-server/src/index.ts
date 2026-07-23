import { logger } from "./lib/logger";
import path from "node:path";
import { existsSync } from "node:fs";
import { config as loadDotEnv } from "dotenv";

const cwd = process.cwd();
const envCandidates = [
  path.resolve(cwd, ".env"),
  path.resolve(cwd, ".env.local"),
  path.resolve(cwd, "..", "..", ".env"),
  path.resolve(cwd, "..", "..", ".env.local"),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath });
  }
}

const { default: app } = await import("./app");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
