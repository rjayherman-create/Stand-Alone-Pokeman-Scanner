const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_TOKEN_URL = `${EBAY_API_BASE}/identity/v1/oauth2/token`;
const EBAY_BROWSE_URL = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search`;
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are not configured.");
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_SCOPE,
    }),
  });

  if (!response.ok) {
    throw new Error(`eBay token request failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

export interface EbayCompResult {
  active_count: number;
  active_low: number | null;
  active_median: number | null;
  active_high: number | null;
  sold_median: number | null;
  match_confidence: number;
  matched_title: string | null;
  matched_url: string | null;
  search_method: string;
  shipping_median: number | null;
  ebay_available: true;
}

export interface EbayUnavailable {
  ebay_available: false;
  reason: string;
}

async function searchEbay(
  query: string,
  searchMethod: string,
  token: string
): Promise<EbayCompResult | null> {
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
  const params = new URLSearchParams({
    q: query,
    limit: "20",
    filter: "buyingOptions:{FIXED_PRICE}",
  });

  const response = await fetch(`${EBAY_BROWSE_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    total?: number;
    itemSummaries?: Array<{
      title?: string;
      price?: { value?: string };
      shippingOptions?: Array<{ shippingCost?: { value?: string } }>;
      itemWebUrl?: string;
    }>;
  };

  const items = data.itemSummaries ?? [];
  if (items.length === 0) return null;

  const prices = items
    .map((i) => parseFloat(i.price?.value ?? "0"))
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? (prices[mid - 1]! + prices[mid]!) / 2
    : prices[mid]!;

  const shippingCosts = items
    .map((i) => parseFloat(i.shippingOptions?.[0]?.shippingCost?.value ?? "0"))
    .filter((p) => p > 0);
  const shippingMedian = shippingCosts.length > 0
    ? shippingCosts.reduce((a, b) => a + b, 0) / shippingCosts.length
    : 0;

  const matchedItem = items[0];

  return {
    ebay_available: true,
    active_count: data.total ?? items.length,
    active_low: prices[0] ?? null,
    active_median: Math.round(median * 100) / 100,
    active_high: prices[prices.length - 1] ?? null,
    sold_median: null,
    match_confidence: searchMethod === "upc" ? 95 : searchMethod === "model" ? 80 : 65,
    matched_title: matchedItem?.title ?? null,
    matched_url: matchedItem?.itemWebUrl ?? null,
    shipping_median: shippingMedian > 0 ? Math.round(shippingMedian * 100) / 100 : 0,
    search_method: searchMethod,
  };
}

export async function lookupEbayComps(item: {
  upc?: string | null;
  gtin?: string | null;
  model_number?: string | null;
  product_name?: string | null;
  brand?: string | null;
  category?: string | null;
}): Promise<EbayCompResult | EbayUnavailable> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      ebay_available: false,
      reason: "eBay API not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to enable eBay comps.",
    };
  }

  let token: string;
  try {
    token = await getEbayToken();
  } catch (err) {
    return { ebay_available: false, reason: "eBay authentication failed." };
  }

  // Priority: UPC/GTIN → model number → brand+title → title
  const searchStrategies: Array<{ query: string; method: string }> = [];

  const identifier = item.upc ?? item.gtin;
  if (identifier) {
    searchStrategies.push({ query: identifier, method: "upc" });
  }
  if (item.model_number) {
    searchStrategies.push({ query: item.model_number, method: "model" });
  }
  if (item.brand && item.product_name) {
    searchStrategies.push({
      query: `${item.brand} ${item.product_name}`.slice(0, 100),
      method: "brand_title",
    });
  }
  if (item.product_name) {
    searchStrategies.push({ query: item.product_name.slice(0, 100), method: "title" });
  }

  for (const strategy of searchStrategies) {
    try {
      const result = await searchEbay(strategy.query, strategy.method, token);
      if (result) return result;
    } catch {
      continue;
    }
  }

  return { ebay_available: false, reason: "No eBay listings found for this item." };
}
