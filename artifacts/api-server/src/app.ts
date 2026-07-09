import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import router from "./routes";
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
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production, serve the pre-built frontend SPA.
// The bundle lives at artifacts/api-server/dist/index.mjs, so
// import.meta.dirname resolves to artifacts/api-server/dist/ at runtime.
// Two levels up lands in artifacts/, then into the frontend build output.
if (process.env.NODE_ENV === "production") {
  const staticDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "warehouse-flip-scanner",
    "dist",
    "public",
  );
  app.use(express.static(staticDir));
  // Catch-all: return index.html so client-side routing works
  app.use((_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"), (err) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      }
    });
  });
}

export default app;
