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

// Always expose a health route so Railway can verify the service even before
// a PostgreSQL database is attached.
const apiRouter = Router();
apiRouter.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    app: "pokevault-tracker",
    database: process.env.DATABASE_URL ? "configured" : "not_configured",
  });
});

// The inherited scanner API imports the database at module load time. Load it
// only when DATABASE_URL exists, allowing the PokéVault frontend to deploy as a
// working standalone MVP before Railway Postgres is provisioned.
if (process.env.DATABASE_URL) {
  const { default: scannerRouter } = await import("./routes");
  apiRouter.use(scannerRouter);
} else {
  logger.warn(
    "DATABASE_URL is not configured; serving the PokéVault frontend with database-backed API routes disabled.",
  );
  apiRouter.get("/status", (_req, res) => {
    res.json({
      ok: true,
      mode: "frontend_only",
      message: "Attach Railway PostgreSQL and set DATABASE_URL to enable scanner and inventory APIs.",
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
