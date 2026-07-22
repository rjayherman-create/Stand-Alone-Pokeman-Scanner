import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, inventoryItemsTable } from "@workspace/db";

const router = Router();

type Quote = {
  source: string;
  value: number | null;
  listingCount?: number;
  checkedAt: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

async function getEbayToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!response.ok) throw new Error(`eBay token failed (${response.status})`);
  const json = await response.json() as { access_token?: string };
  return json.access_token ?? null;
}

async function ebayQuote(query: string, upc?: string | null): Promise<Quote> {
  const checkedAt = new Date().toISOString();
  try {
    const token = await getEbayToken();
    if (!token) return { source: "eBay active", value: null, checkedAt, confidence: "low", note: "Missing eBay API credentials." };
    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", upc || query);
    url.searchParams.set("limit", "50");
    url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE},deliveryCountry:US");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
      },
    });
    if (!response.ok) throw new Error(`eBay search failed (${response.status})`);
    const json = await response.json() as { itemSummaries?: Array<{ price?: { value?: string }; shippingOptions?: Array<{ shippingCost?: { value?: string } }> }> };
    const prices = (json.itemSummaries ?? []).map(item => {
      const price = Number(item.price?.value);
      const shipping = Number(item.shippingOptions?.[0]?.shippingCost?.value ?? 0);
      return Number.isFinite(price) ? price + (Number.isFinite(shipping) ? shipping : 0) : NaN;
    }).filter(Number.isFinite) as number[];
    return {
      source: "eBay active",
      value: median(prices),
      listingCount: prices.length,
      checkedAt,
      confidence: prices.length >= 8 ? "medium" : "low",
      note: "Median of current fixed-price listings including visible shipping. Active asking prices are not completed sales.",
    };
  } catch (error) {
    return { source: "eBay active", value: null, checkedAt, confidence: "low", note: error instanceof Error ? error.message : "eBay failed" };
  }
}

async function tcgplayerQuote(productId?: string | null): Promise<Quote> {
  const checkedAt = new Date().toISOString();
  const publicKey = process.env.TCGPLAYER_PUBLIC_KEY;
  const privateKey = process.env.TCGPLAYER_PRIVATE_KEY;
  if (!productId || !publicKey || !privateKey) return { source: "TCGplayer", value: null, checkedAt, confidence: "low", note: "Missing TCGplayer product ID or API credentials." };
  try {
    const tokenResponse = await fetch("https://api.tcgplayer.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: publicKey, client_secret: privateKey }),
    });
    if (!tokenResponse.ok) throw new Error(`TCGplayer token failed (${tokenResponse.status})`);
    const tokenJson = await tokenResponse.json() as { access_token?: string };
    const response = await fetch(`https://api.tcgplayer.com/pricing/product/${encodeURIComponent(productId)}`, {
      headers: { Authorization: `bearer ${tokenJson.access_token}` },
    });
    if (!response.ok) throw new Error(`TCGplayer pricing failed (${response.status})`);
    const json = await response.json() as { results?: Array<{ marketPrice?: number | null; midPrice?: number | null }> };
    const values = (json.results ?? []).map(result => Number(result.marketPrice ?? result.midPrice)).filter(Number.isFinite) as number[];
    return { source: "TCGplayer", value: median(values), checkedAt, confidence: values.length ? "high" : "low", note: "Official TCGplayer market pricing." };
  } catch (error) {
    return { source: "TCGplayer", value: null, checkedAt, confidence: "low", note: error instanceof Error ? error.message : "TCGplayer failed" };
  }
}

async function priceChartingQuote(productId?: string | null): Promise<Quote> {
  const checkedAt = new Date().toISOString();
  const token = process.env.PRICECHARTING_TOKEN;
  if (!productId || !token) return { source: "PriceCharting", value: null, checkedAt, confidence: "low", note: "Missing PriceCharting product ID or token." };
  try {
    const url = new URL("https://www.pricecharting.com/api/product");
    url.searchParams.set("t", token);
    url.searchParams.set("id", productId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PriceCharting failed (${response.status})`);
    const json = await response.json() as Record<string, unknown>;
    const cents = Number(json["new-price"] ?? json["cib-price"] ?? json["loose-price"]);
    return { source: "PriceCharting", value: Number.isFinite(cents) ? cents / 100 : null, checkedAt, confidence: "high", note: "Official PriceCharting guide value." };
  } catch (error) {
    return { source: "PriceCharting", value: null, checkedAt, confidence: "low", note: error instanceof Error ? error.message : "PriceCharting failed" };
  }
}

function idsFrom(item: typeof inventoryItemsTable.$inferSelect) {
  const analysis = (item.analysis_json ?? {}) as Record<string, unknown>;
  return {
    tcgplayerId: String(analysis.tcgplayerId ?? analysis.tcgplayer_id ?? "") || null,
    priceChartingId: String(analysis.priceChartingId ?? analysis.pricecharting_id ?? "") || null,
  };
}

router.get("/pokemon/portfolio", async (_req, res) => {
  const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.category, "Pokemon")).orderBy(desc(inventoryItemsTable.updated_at));
  res.json({ items, checkedAt: new Date().toISOString() });
});

router.post("/pokemon/market-check/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id)).limit(1);
  if (!item) return res.status(404).json({ error: "Inventory item not found" });

  const ids = idsFrom(item);
  const quotes = await Promise.all([
    ebayQuote(item.product_name, item.upc),
    tcgplayerQuote(ids.tcgplayerId),
    priceChartingQuote(ids.priceChartingId),
  ]);
  const available = quotes.flatMap(quote => quote.value == null ? [] : [quote.value]);
  const currentValue = median(available);
  const analysis = {
    ...((item.analysis_json ?? {}) as Record<string, unknown>),
    marketQuotes: quotes,
    marketCheckedAt: new Date().toISOString(),
    valuationMethod: "median of available supported sources",
  };

  await db.update(inventoryItemsTable).set({
    normal_retail_estimate: currentValue == null ? item.normal_retail_estimate : money(currentValue),
    ebay_active_median: quotes[0].value ?? item.ebay_active_median,
    ebay_active_count: quotes[0].listingCount ?? item.ebay_active_count,
    analysis_json: analysis,
    updated_at: new Date(),
  }).where(eq(inventoryItemsTable.id, id));

  res.json({
    itemId: id,
    currentValue: currentValue == null ? null : money(currentValue),
    quotes,
    checkedAt: new Date().toISOString(),
    limitations: [
      "Mercari does not provide a supported public market-pricing API, so Mercari comparisons must be entered manually.",
      "eBay Browse provides active listings, not dependable completed-sale history. Do not treat asking prices as sold prices.",
    ],
  });
});

export default router;
