import express, { Router, type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Always expose health and status routes so Railway can verify the service
// before PostgreSQL is attached.
const apiRouter = Router();
apiRouter.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    app: "pokevault-tracker",
    database: process.env.DATABASE_URL ? "configured" : "not_configured",
  });
});

apiRouter.get("/status", (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.DATABASE_URL ? "database" : "frontend_only",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    openaiConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    message: process.env.DATABASE_URL
      ? "Database-backed APIs are enabled."
      : "Attach Railway PostgreSQL and set DATABASE_URL to enable scanner and inventory APIs.",
  });
});

// The inherited scanner API imports the database at module load time. Load it
// only when DATABASE_URL exists, allowing the frontend to remain available
// while configuration is incomplete.
if (process.env.DATABASE_URL) {
  const { default: scannerRouter } = await import("./routes");
  apiRouter.use(scannerRouter);
} else {
  logger.warn(
    "DATABASE_URL is not configured; serving the PokéVault frontend with database-backed API routes disabled.",
  );

  // Return a proper JSON error for every disabled API route. Without this,
  // Express's SPA fallback serves index.html and the frontend fails with
  // "Unexpected token '<' ... is not valid JSON".
  apiRouter.use((req, res) => {
    res.status(503).json({
      ok: false,
      error: "database_not_configured",
      message: "DATABASE_URL is not configured for this Railway service.",
      route: `/api${req.path}`,
      nextStep: "Add DATABASE_URL as a Railway reference to the PostgreSQL service, then redeploy.",
    });
  });
}

app.use("/api", apiRouter);

// In production, serve the pre-built PokéVault frontend SPA.
if (process.env.NODE_ENV === "production") {
  const staticDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "pokevault-tracker",
    "dist",
  );

  app.use(express.static(staticDir));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"), (err) => {
      if (err && !res.headersSent) {
        logger.error({ err, staticDir }, "Unable to serve PokéVault index.html");
        res.status(500).send("PokéVault frontend build was not found.");
      }
    });
  });
}

export default app;
