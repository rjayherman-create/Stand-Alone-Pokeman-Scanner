import { lookupEbayComps, type EbayCompResult, type EbayUnavailable } from "./ebay";

export const COMP_SETTINGS = {
  comp_lookup_timeout_seconds: 12,
  max_ebay_results: 20,
  min_match_confidence: 70,
  facebook_local_discount_low: 0.7,
  facebook_local_discount_high: 0.85,
  amazon_reference_only: true,
};

const CATEGORY_MIN_PROFIT: Record<string, number> = {
  LEGO: 7,
  Toys: 7,
  Tools: 15,
  "Small Appliances": 15,
  Electronics: 20,
  Seasonal: 10,
  "Sporting Goods": 10,
  Golf: 15,
  "Baby Gear": 15,
  "Home Goods": 10,
  Furniture: 30,
  "Outdoor / Patio": 25,
  "Video Games": 7,
  Collectibles: 10,
  Automotive: 15,
  Other: 10,
};

export interface ScannedItemForComps {
  retailer?: string | null;
  store_location?: string | null;
  product_name?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  current_store_price?: number | null;
  regular_price?: number | null;
  clearance_price?: number | null;
  percent_off?: number | null;
  upc?: string | null;
  gtin?: string | null;
  sku?: string | null;
  dpci?: string | null;
  tcin?: string | null;
  costco_item_number?: string | null;
  model_number?: string | null;
  asin?: string | null;
  box_condition?: string | null;
  sealed_status?: string | null;
  photo_url?: string | null;
  user_note?: string | null;
}

export interface MatchResult {
  match_confidence: number;
  match_method: string;
  matched_title: string | null;
  matched_identifier: string | null;
  matched_brand: string | null;
  matched_category: string | null;
  warning_if_low_confidence: string | null;
}

export interface NormalizedEbayData {
  status: "success" | "unavailable" | "error";
  active_count: number;
  active_low: number | null;
  active_median: number | null;
  active_high: number | null;
  sold_count: number;
  sold_low: number | null;
  sold_median: number | null;
  sold_high: number | null;
  shipping_median: number | null;
  match_confidence: number;
  matched_title: string | null;
  matched_url: string | null;
  search_method: string | null;
  notes: string;
}

export interface AmazonData {
  status: "success" | "unavailable" | "manual_needed" | "error";
  data_source: "keepa" | "amazon_api" | "manual" | "unavailable";
  asin: string | null;
  title: string | null;
  current_price: number | null;
  buy_box_price: number | null;
  avg_30_day: number | null;
  avg_90_day: number | null;
  sales_rank: number | null;
  availability: string | null;
  match_confidence: number;
  notes: string;
}

export interface FacebookEstimate {
  suggested_list_price: number | null;
  expected_sale_low: number | null;
  expected_sale_high: number | null;
  expected_sale_median: number | null;
  negotiation_floor: number | null;
  bundle_offer: string | null;
  local_sale_confidence: number;
  notes: string;
}

export interface CompSummaryV2 {
  ebay_active_range: string | null;
  ebay_active_median: number | null;
  ebay_sold_range: string | null;
  ebay_sold_median: number | null;
  amazon_reference_price: number | null;
  amazon_30_day_average: number | null;
  amazon_90_day_average: number | null;
  suggested_facebook_list_price: number | null;
  expected_facebook_sale_price: number | null;
  suggested_channel: "Facebook Marketplace" | "eBay" | "Research More";
  comp_confidence: "HIGH" | "MEDIUM" | "LOW";
  warning_notes: string[];
}

export interface ProfitSummaryV2 {
  gross_spread: number | null;
  estimated_net_profit: number | null;
  profit_margin_percent: number | null;
  negotiation_floor: number | null;
  max_buy_price: number | null;
  recommended_quantity: string;
  profit_warning: string | null;
}

export interface CompDecision {
  recommendation: "BUY" | "MAYBE" | "SKIP" | "RESEARCH_MORE";
  confidence_score: number;
  one_sentence_reason: string;
  risk_warning: string | null;
  max_quantity: string;
  best_next_action: string;
}

export interface FullCompLookup {
  scannedItem: ScannedItemForComps;
  matchResult: MatchResult;
  ebayData: NormalizedEbayData;
  amazonData: AmazonData;
  facebookEstimate: FacebookEstimate;
  compSummary: CompSummaryV2;
  profitSummary: ProfitSummaryV2;
  decision: CompDecision;
}

function money(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function range(low: number | null, high: number | null): string | null {
  if (low == null || high == null) return null;
  return `$${Math.round(low)}-$${Math.round(high)}`;
}

function storePrice(item: ScannedItemForComps): number {
  return item.current_store_price ?? item.clearance_price ?? 0;
}

function categoryMinProfit(category?: string | null): number {
  return CATEGORY_MIN_PROFIT[category ?? ""] ?? 10;
}

export function matchProductForComps(scannedItem: ScannedItemForComps): MatchResult {
  const title = scannedItem.product_name ?? null;
  const brand = scannedItem.brand ?? null;
  const category = scannedItem.category ?? null;

  const exactIdentifier =
    scannedItem.upc ??
    scannedItem.gtin ??
    scannedItem.asin ??
    scannedItem.model_number ??
    scannedItem.dpci ??
    scannedItem.tcin ??
    scannedItem.sku ??
    scannedItem.costco_item_number ??
    null;

  let match_method = "title_similarity";
  let match_confidence = title ? 60 : 20;
  let matched_identifier = exactIdentifier;

  if (scannedItem.upc || scannedItem.gtin) {
    match_method = "upc_gtin";
    match_confidence = 95;
  } else if (scannedItem.asin) {
    match_method = "asin";
    match_confidence = 90;
  } else if (scannedItem.model_number) {
    match_method = "model_number";
    match_confidence = 84;
  } else if (scannedItem.dpci || scannedItem.tcin) {
    match_method = "target_identifier";
    match_confidence = 80;
  } else if (scannedItem.sku || scannedItem.costco_item_number) {
    match_method = "retailer_item_number";
    match_confidence = 74;
  } else if (brand && title) {
    match_method = "brand_exact_title";
    match_confidence = 72;
  } else if (title && category) {
    match_method = "keywords_category";
    match_confidence = 62;
  }

  return {
    match_confidence,
    match_method,
    matched_title: title,
    matched_identifier,
    matched_brand: brand,
    matched_category: category,
    warning_if_low_confidence:
      match_confidence < COMP_SETTINGS.min_match_confidence
        ? "Match is based on weak title/category data. Scan barcode, model number, or side of box."
        : null,
  };
}

function normalizeEbayData(data: EbayCompResult | EbayUnavailable): NormalizedEbayData {
  if (!data.ebay_available) {
    return {
      status: "unavailable",
      active_count: 0,
      active_low: null,
      active_median: null,
      active_high: null,
      sold_count: 0,
      sold_low: null,
      sold_median: null,
      sold_high: null,
      shipping_median: null,
      match_confidence: 0,
      matched_title: null,
      matched_url: null,
      search_method: null,
      notes: data.reason,
    };
  }

  return {
    status: "success",
    active_count: data.active_count,
    active_low: data.active_low,
    active_median: data.active_median,
    active_high: data.active_high,
    sold_count: data.sold_median ? data.active_count : 0,
    sold_low: null,
    sold_median: data.sold_median,
    sold_high: null,
    shipping_median: data.shipping_median,
    match_confidence: data.match_confidence,
    matched_title: data.matched_title,
    matched_url: data.matched_url,
    search_method: data.search_method,
    notes: data.sold_median
      ? "eBay sold median available from configured source."
      : "eBay Browse API active listings available. Sold/completed data not available from this source.",
  };
}

export async function lookupEbayCompsForModule(
  scannedItem: ScannedItemForComps,
  matchResult = matchProductForComps(scannedItem),
): Promise<NormalizedEbayData> {
  const ebayData = await lookupEbayComps({
    upc: scannedItem.upc ?? scannedItem.gtin,
    gtin: scannedItem.gtin,
    model_number: scannedItem.model_number,
    product_name: scannedItem.product_name,
    brand: scannedItem.brand,
    category: scannedItem.category,
  });

  const normalized = normalizeEbayData(ebayData);
  normalized.match_confidence = Math.min(
    Math.max(normalized.match_confidence, normalized.status === "success" ? matchResult.match_confidence : 0),
    95,
  );
  return normalized;
}

export async function lookupAmazonComps(
  scannedItem: ScannedItemForComps,
  matchResult = matchProductForComps(scannedItem),
): Promise<AmazonData> {
  if (process.env.KEEPA_API_KEY) {
    return {
      status: "manual_needed",
      data_source: "keepa",
      asin: scannedItem.asin ?? null,
      title: scannedItem.product_name ?? null,
      current_price: null,
      buy_box_price: null,
      avg_30_day: null,
      avg_90_day: null,
      sales_rank: null,
      availability: null,
      match_confidence: matchResult.match_confidence,
      notes: "Keepa key is configured, but live Keepa lookup is not implemented in this local build yet. Enter manual Amazon price if needed.",
    };
  }

  if (process.env.AMAZON_API_ENABLED === "true" && process.env.AMAZON_CREATORS_API_KEY) {
    return {
      status: "manual_needed",
      data_source: "amazon_api",
      asin: scannedItem.asin ?? null,
      title: scannedItem.product_name ?? null,
      current_price: null,
      buy_box_price: null,
      avg_30_day: null,
      avg_90_day: null,
      sales_rank: null,
      availability: null,
      match_confidence: matchResult.match_confidence,
      notes: "Approved Amazon API is configured, but product lookup needs provider-specific implementation. Enter manual Amazon price if needed.",
    };
  }

  return {
    status: "manual_needed",
    data_source: "unavailable",
    asin: scannedItem.asin ?? null,
    title: null,
    current_price: null,
    buy_box_price: null,
    avg_30_day: null,
    avg_90_day: null,
    sales_rank: null,
    availability: null,
    match_confidence: 0,
    notes: "Amazon data source not connected. Use eBay comps and manual Amazon price if needed.",
  };
}

export function estimateFacebookPrice(
  scannedItem: ScannedItemForComps,
  ebayData: NormalizedEbayData,
  amazonData: AmazonData,
): FacebookEstimate {
  const base = ebayData.sold_median ?? ebayData.active_median ?? null;
  const price = storePrice(scannedItem);
  const category = scannedItem.category ?? "Other";
  const isLego = /lego|toy/i.test(category);
  const isBulky = /furniture|outdoor|patio|appliance/i.test(category);
  const isNiche = /collectible|golf|automotive/i.test(category);
  const damaged = /damaged|open/i.test(scannedItem.box_condition ?? "");

  let expectedMedian: number | null = null;
  if (base) {
    let localFactor = isLego ? 0.82 : 0.76;
    if (isBulky) localFactor -= 0.1;
    if (isNiche) localFactor -= 0.06;
    if (damaged) localFactor -= 0.12;
    expectedMedian = money(base * localFactor);
  } else if (price > 0) {
    const multiplier = isLego ? 1.45 : 1.35;
    expectedMedian = money(price * multiplier);
  }

  const expectedLow = expectedMedian ? money(expectedMedian * 0.92) : null;
  const expectedHigh = expectedMedian ? money(expectedMedian * 1.08) : null;
  const list = expectedHigh ? Math.ceil(expectedHigh / 5) * 5 : null;
  const floor = expectedMedian ? money(expectedMedian * 0.85) : null;

  return {
    suggested_list_price: list,
    expected_sale_low: expectedLow,
    expected_sale_high: expectedHigh,
    expected_sale_median: expectedMedian,
    negotiation_floor: floor,
    bundle_offer: list ? `2 for $${Math.max(1, Math.round(list * 2 * 0.9))}` : null,
    local_sale_confidence: ebayData.status === "success" ? Math.min(85, ebayData.match_confidence) : 45,
    notes: amazonData.current_price
      ? "Amazon price used as a reference ceiling only. Facebook estimate is discounted from eBay/local resale assumptions."
      : "Facebook estimate uses eBay comps when available and local discount rules.",
  };
}

export function buildCompSummary(
  scannedItem: ScannedItemForComps,
  ebayData: NormalizedEbayData,
  amazonData: AmazonData,
  facebookEstimate: FacebookEstimate,
  matchResult = matchProductForComps(scannedItem),
): CompSummaryV2 {
  const warnings: string[] = [];
  const amazonReference = amazonData.current_price ?? amazonData.buy_box_price ?? null;
  const confidenceScore = Math.min(matchResult.match_confidence, ebayData.match_confidence || matchResult.match_confidence);

  if (matchResult.match_confidence < COMP_SETTINGS.min_match_confidence) {
    warnings.push("Match is based on title only. Scan barcode or model number.");
  }
  if (amazonReference && ebayData.status !== "success") {
    warnings.push("Amazon looks high, but resale comps are weak. Do not rely on Amazon price alone.");
  }
  if (ebayData.status === "success" && !ebayData.sold_median) {
    warnings.push("Active listings may be inflated. Confirm sold comps before buying multiples.");
  }
  if (/furniture|outdoor|patio|appliance/i.test(scannedItem.category ?? "")) {
    warnings.push("Profit may disappear if shipping is needed. Prefer Facebook local pickup.");
  }
  if (ebayData.active_count >= 50 && !ebayData.sold_median) {
    warnings.push("Market may be flooded. Buy only one test item or skip.");
  }

  const compConfidence =
    ebayData.status !== "success"
      ? "LOW"
      : confidenceScore >= 80 && ebayData.status === "success"
      ? "HIGH"
      : confidenceScore >= 70 || ebayData.status === "success"
        ? "MEDIUM"
        : "LOW";

  return {
    ebay_active_range: range(ebayData.active_low, ebayData.active_high),
    ebay_active_median: ebayData.active_median,
    ebay_sold_range: range(ebayData.sold_low, ebayData.sold_high),
    ebay_sold_median: ebayData.sold_median,
    amazon_reference_price: amazonReference,
    amazon_30_day_average: amazonData.avg_30_day,
    amazon_90_day_average: amazonData.avg_90_day,
    suggested_facebook_list_price: facebookEstimate.suggested_list_price,
    expected_facebook_sale_price: facebookEstimate.expected_sale_median,
    suggested_channel: compConfidence === "LOW" || ebayData.status !== "success" ? "Research More" : "Facebook Marketplace",
    comp_confidence: compConfidence,
    warning_notes: warnings,
  };
}

export function calculateProfit(
  scannedItem: ScannedItemForComps,
  facebookEstimate: FacebookEstimate,
  ebayData: NormalizedEbayData,
): ProfitSummaryV2 {
  const price = storePrice(scannedItem);
  const sale = facebookEstimate.expected_sale_median;
  const gross = sale == null ? null : money(sale - price);
  const ebayNet = ebayData.active_median ? money(ebayData.active_median * 0.85 - price - (ebayData.shipping_median ?? 0)) : null;
  const net = gross;
  const minProfit = categoryMinProfit(scannedItem.category);
  const margin = net != null && price > 0 ? Math.round((net / price) * 100) : null;
  const maxBuy = sale != null ? money(sale - minProfit) : null;

  let quantity = "0";
  if (net != null && net >= minProfit * 2) quantity = "2-4";
  else if (net != null && net >= minProfit) quantity = "1-2";
  else if (net != null && net > 0) quantity = "1 test";

  return {
    gross_spread: gross,
    estimated_net_profit: net,
    profit_margin_percent: margin,
    negotiation_floor: facebookEstimate.negotiation_floor,
    max_buy_price: maxBuy,
    recommended_quantity: quantity,
    profit_warning:
      ebayNet != null && ebayNet < (net ?? 0)
        ? "eBay fees and shipping reduce profit. Prefer Facebook local pickup."
        : null,
  };
}

export function makeCompDecision(
  scannedItem: ScannedItemForComps,
  matchResult: MatchResult,
  ebayData: NormalizedEbayData,
  amazonData: AmazonData,
  compSummary: CompSummaryV2,
  profitSummary: ProfitSummaryV2,
): CompDecision {
  const minProfit = categoryMinProfit(scannedItem.category);
  const profit = profitSummary.estimated_net_profit ?? 0;
  const confidence = compSummary.comp_confidence === "HIGH" ? 86 : compSummary.comp_confidence === "MEDIUM" ? 72 : 48;

  if (matchResult.match_confidence < COMP_SETTINGS.min_match_confidence || ebayData.status !== "success") {
    return {
      recommendation: "RESEARCH_MORE",
      confidence_score: Math.min(confidence, 62),
      one_sentence_reason: "Product identity or eBay comps are not strong enough for a confident buy decision.",
      risk_warning: ebayData.status !== "success" ? "eBay comps unavailable. Try scanning the barcode or entering the model number." : matchResult.warning_if_low_confidence,
      max_quantity: "0",
      best_next_action: "Scan barcode/model number or enter manual comps before buying.",
    };
  }

  if (amazonData.current_price && !ebayData.sold_median && profit < minProfit * 1.5) {
    return {
      recommendation: "SKIP",
      confidence_score: confidence,
      one_sentence_reason: "Amazon looks higher, but eBay resale comps do not support enough realistic local profit.",
      risk_warning: "Amazon looks high, but resale comps are weak. Do not rely on Amazon price alone.",
      max_quantity: "0",
      best_next_action: "Skip unless manual sold comps prove demand.",
    };
  }

  if (profit < minProfit || profit <= 0) {
    return {
      recommendation: "SKIP",
      confidence_score: confidence,
      one_sentence_reason: `Expected profit is below the $${minProfit} category minimum.`,
      risk_warning: compSummary.warning_notes[0] ?? null,
      max_quantity: "0",
      best_next_action: "Leave it. Not enough margin after realistic resale pricing.",
    };
  }

  if (compSummary.comp_confidence === "MEDIUM" || profit < minProfit * 2 || compSummary.warning_notes.length > 0) {
    return {
      recommendation: "MAYBE",
      confidence_score: confidence,
      one_sentence_reason: "Profit exists, but comps or spread are not strong enough for multiples.",
      risk_warning: compSummary.warning_notes[0] ?? "Buy only one test item until sold comps are confirmed.",
      max_quantity: "1 test",
      best_next_action: "Buy 1 test item, list locally, then return for more only if it sells fast.",
    };
  }

  return {
    recommendation: "BUY",
    confidence_score: confidence,
    one_sentence_reason: `Realistic Facebook resale supports about $${Math.round(profit)} profit per unit.`,
    risk_warning: compSummary.warning_notes[0] ?? null,
    max_quantity: profitSummary.recommended_quantity,
    best_next_action: `List on Facebook Marketplace at $${compSummary.suggested_facebook_list_price ?? "market"} and take local pickup.`,
  };
}

export async function performCompLookup(scannedItem: ScannedItemForComps): Promise<FullCompLookup> {
  const matchResult = matchProductForComps(scannedItem);
  const [ebayData, amazonData] = await Promise.all([
    lookupEbayCompsForModule(scannedItem, matchResult),
    lookupAmazonComps(scannedItem, matchResult),
  ]);
  const facebookEstimate = estimateFacebookPrice(scannedItem, ebayData, amazonData);
  const compSummary = buildCompSummary(scannedItem, ebayData, amazonData, facebookEstimate, matchResult);
  const profitSummary = calculateProfit(scannedItem, facebookEstimate, ebayData);
  const decision = makeCompDecision(scannedItem, matchResult, ebayData, amazonData, compSummary, profitSummary);
  return { scannedItem, matchResult, ebayData, amazonData, facebookEstimate, compSummary, profitSummary, decision };
}

export function applyManualComps(
  scannedItem: ScannedItemForComps,
  manual: {
    manual_ebay_sold_price?: number | null;
    manual_ebay_active_price?: number | null;
    manual_amazon_price?: number | null;
    manual_facebook_comp_price?: number | null;
    manual_notes?: string | null;
  },
): FullCompLookup {
  const matchResult = matchProductForComps(scannedItem);
  const ebayData: NormalizedEbayData = {
    status: manual.manual_ebay_sold_price || manual.manual_ebay_active_price ? "success" : "unavailable",
    active_count: manual.manual_ebay_active_price ? 1 : 0,
    active_low: manual.manual_ebay_active_price ?? null,
    active_median: manual.manual_ebay_active_price ?? null,
    active_high: manual.manual_ebay_active_price ?? null,
    sold_count: manual.manual_ebay_sold_price ? 1 : 0,
    sold_low: manual.manual_ebay_sold_price ?? null,
    sold_median: manual.manual_ebay_sold_price ?? null,
    sold_high: manual.manual_ebay_sold_price ?? null,
    shipping_median: 0,
    match_confidence: 80,
    matched_title: scannedItem.product_name ?? null,
    matched_url: null,
    search_method: "manual",
    notes: manual.manual_notes ?? "Manual eBay comp entry.",
  };
  const amazonData: AmazonData = {
    status: manual.manual_amazon_price ? "success" : "manual_needed",
    data_source: manual.manual_amazon_price ? "manual" : "unavailable",
    asin: scannedItem.asin ?? null,
    title: scannedItem.product_name ?? null,
    current_price: manual.manual_amazon_price ?? null,
    buy_box_price: manual.manual_amazon_price ?? null,
    avg_30_day: null,
    avg_90_day: null,
    sales_rank: null,
    availability: null,
    match_confidence: manual.manual_amazon_price ? 75 : 0,
    notes: manual.manual_amazon_price ? "Manual Amazon reference price." : "Amazon data source not connected.",
  };
  let facebookEstimate = estimateFacebookPrice(scannedItem, ebayData, amazonData);
  if (manual.manual_facebook_comp_price) {
    facebookEstimate = {
      ...facebookEstimate,
      expected_sale_low: money(manual.manual_facebook_comp_price * 0.95),
      expected_sale_high: money(manual.manual_facebook_comp_price * 1.05),
      expected_sale_median: manual.manual_facebook_comp_price,
      suggested_list_price: Math.ceil(manual.manual_facebook_comp_price / 5) * 5,
      negotiation_floor: money(manual.manual_facebook_comp_price * 0.85),
      notes: "Facebook estimate based on manual local comp entry.",
    };
  }
  const compSummary = buildCompSummary(scannedItem, ebayData, amazonData, facebookEstimate, matchResult);
  const profitSummary = calculateProfit(scannedItem, facebookEstimate, ebayData);
  const decision = makeCompDecision(scannedItem, matchResult, ebayData, amazonData, compSummary, profitSummary);
  return { scannedItem, matchResult, ebayData, amazonData, facebookEstimate, compSummary, profitSummary, decision };
}
