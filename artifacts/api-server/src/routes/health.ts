import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/diagnostics", async (_req, res) => {
  const checks: Record<string, { ok: boolean; detail: string }> = {
    server: { ok: true, detail: "Express API is running" },
    database_url: { ok: Boolean(process.env.DATABASE_URL), detail: process.env.DATABASE_URL ? "DATABASE_URL is configured" : "DATABASE_URL is missing" },
    openai: { ok: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY), detail: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? "OpenAI key is configured" : "OpenAI key is missing" },
    ebay: { ok: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET), detail: process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET ? "eBay credentials are configured" : "eBay credentials are incomplete" },
    tcgplayer: { ok: Boolean(process.env.TCGPLAYER_PUBLIC_KEY && process.env.TCGPLAYER_PRIVATE_KEY), detail: process.env.TCGPLAYER_PUBLIC_KEY && process.env.TCGPLAYER_PRIVATE_KEY ? "TCGplayer credentials are configured" : "TCGplayer credentials are incomplete" },
    pricecharting: { ok: Boolean(process.env.PRICECHARTING_TOKEN), detail: process.env.PRICECHARTING_TOKEN ? "PriceCharting token is configured" : "PriceCharting token is missing" },
  };

  try {
    await db.execute(sql`select 1 as ok`);
    checks.database = { ok: true, detail: "PostgreSQL query succeeded" };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "PostgreSQL query failed" };
  }

  const routes = [
    "GET /api/healthz",
    "GET /api/health",
    "GET /api/diagnostics",
    "GET /api/pokemon/portfolio",
    "POST /api/pokemon/market-check/:id",
    "POST /api/photo-scan",
    "POST /api/screenshot-ocr",
    "POST /api/public-web-check",
  ];

  const requiredOk = checks.server.ok && checks.database_url.ok && checks.database.ok;
  res.status(requiredOk ? 200 : 503).json({
    status: requiredOk ? "ready" : "degraded",
    checkedAt: new Date().toISOString(),
    checks,
    routes,
  });
});

export default router;
