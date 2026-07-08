import type { EbayCompResult, EbayUnavailable } from "./ebay";

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

export function getCategoryMinProfit(category?: string | null): number {
  if (!category) return 10;
  return CATEGORY_MIN_PROFIT[category] ?? 10;
}

export interface ScannedItemInput {
  retailer?: string;
  product_name?: string | null;
  brand?: string | null;
  category?: string | null;
  current_store_price?: number | null;
  regular_price?: number | null;
  clearance_price?: number | null;
  percent_off?: number | null;
  markdown_code?: string | null;
  upc?: string | null;
  gtin?: string | null;
  sku?: string | null;
  dpci?: string | null;
  tcin?: string | null;
  costco_item_number?: string | null;
  model_number?: string | null;
  box_condition?: string | null;
  stock_status?: string | null;
  extraction_confidence?: string | null;
}

export interface CompSummary {
  ebay_active_median: number | null;
  ebay_sold_median: number | null;
  ebay_active_low: number | null;
  ebay_active_high: number | null;
  ebay_active_count: number;
  ebay_match_confidence: number;
  ebay_matched_title: string | null;
  ebay_matched_url: string | null;
  ebay_search_method: string | null;
  ebay_shipping_median: number | null;
  ebay_available: boolean;
  ebay_unavailable_reason?: string;
  amazon_current_price: number | null;
  amazon_30_day_average: number | null;
  amazon_90_day_average: number | null;
  amazon_available: boolean;
  estimated_local_facebook_sale_price: number | null;
  suggested_facebook_list_price: number | null;
  comp_confidence: number;
  comp_notes: string;
}

export interface ProfitSummary {
  store_price: number;
  expected_sale_price: number | null;
  gross_spread: number | null;
  estimated_net_profit: number | null;
  profit_margin_percent: number | null;
  negotiation_floor: number | null;
  max_buy_price: number | null;
  recommended_quantity: string;
  category_min_profit: number;
  meets_minimum: boolean;
}

export interface QuickDecision {
  recommendation: "BUY" | "MAYBE" | "SKIP" | "RESEARCH_MORE";
  confidence_score: number;
  one_sentence_reason: string;
  risk_warning: string | null;
  max_quantity: string;
  best_next_action: string;
}

export function buildCompSummary(
  item: ScannedItemInput,
  ebayData: EbayCompResult | EbayUnavailable,
): CompSummary {
  const storePrice = item.current_store_price ?? item.clearance_price ?? 0;

  let ebayActiveMed: number | null = null;
  let ebayActiveHigh: number | null = null;
  let ebayActiveLow: number | null = null;
  let ebayActiveCount = 0;
  let ebayMatchConf = 0;
  let ebayMatchedTitle: string | null = null;
  let ebayMatchedUrl: string | null = null;
  let ebaySearchMethod: string | null = null;
  let ebayShipping: number | null = null;
  let ebayAvailable = false;
  let ebayReason: string | undefined;

  if (ebayData.ebay_available) {
    ebayAvailable = true;
    ebayActiveMed = ebayData.active_median;
    ebayActiveHigh = ebayData.active_high;
    ebayActiveLow = ebayData.active_low;
    ebayActiveCount = ebayData.active_count;
    ebayMatchConf = ebayData.match_confidence;
    ebayMatchedTitle = ebayData.matched_title;
    ebayMatchedUrl = ebayData.matched_url;
    ebaySearchMethod = ebayData.search_method;
    ebayShipping = ebayData.shipping_median;
  } else {
    ebayReason = ebayData.reason;
  }

  // Estimate local Facebook sale price
  let fbSalePrice: number | null = null;
  let fbListPrice: number | null = null;

  if (ebayActiveMed && ebayActiveMed > 0) {
    const isBulky = /furniture|outdoor|patio/i.test(item.category ?? "");
    const multiplier = isBulky ? 0.65 : 0.75;
    fbSalePrice = Math.round(ebayActiveMed * multiplier * 100) / 100;
    fbListPrice = Math.round(fbSalePrice * 1.1 * 100) / 100;
  } else if (storePrice > 0) {
    // No eBay data — estimate from store price using category
    const category = item.category ?? "Other";
    const multiplierMap: Record<string, number> = {
      LEGO: 1.6, Toys: 1.5, Tools: 1.6, Electronics: 1.5,
      "Small Appliances": 1.5, Seasonal: 1.4, "Sporting Goods": 1.5,
    };
    const mult = multiplierMap[category] ?? 1.5;
    fbSalePrice = Math.round(storePrice * mult * 100) / 100;
    fbListPrice = Math.round(fbSalePrice * 1.1 * 100) / 100;
  }

  // Comp confidence
  let compConf = ebayMatchConf;
  if (!ebayAvailable) {
    compConf = item.extraction_confidence === "high" ? 40 : 25;
  }

  const compNotes = ebayAvailable
    ? `eBay data via ${ebaySearchMethod ?? "title search"}. ${ebayActiveCount} active listings found.`
    : `eBay unavailable: ${ebayReason ?? "unknown"}. Local estimate based on category rules.`;

  return {
    ebay_active_median: ebayActiveMed,
    ebay_sold_median: null,
    ebay_active_low: ebayActiveLow,
    ebay_active_high: ebayActiveHigh,
    ebay_active_count: ebayActiveCount,
    ebay_match_confidence: ebayMatchConf,
    ebay_matched_title: ebayMatchedTitle,
    ebay_matched_url: ebayMatchedUrl,
    ebay_search_method: ebaySearchMethod,
    ebay_shipping_median: ebayShipping,
    ebay_available: ebayAvailable,
    ebay_unavailable_reason: ebayReason,
    amazon_current_price: null,
    amazon_30_day_average: null,
    amazon_90_day_average: null,
    amazon_available: false,
    estimated_local_facebook_sale_price: fbSalePrice,
    suggested_facebook_list_price: fbListPrice,
    comp_confidence: compConf,
    comp_notes: compNotes,
  };
}

export function calculateProfit(
  item: ScannedItemInput,
  comp: CompSummary
): ProfitSummary {
  const storePrice = item.current_store_price ?? item.clearance_price ?? 0;
  const salePrice = comp.estimated_local_facebook_sale_price;
  const minProfit = getCategoryMinProfit(item.category);

  const grossSpread = salePrice ? Math.round((salePrice - storePrice) * 100) / 100 : null;
  const netProfit = grossSpread; // FB local: $0 fees, $0 shipping
  const marginPct = salePrice && storePrice > 0
    ? Math.round((grossSpread! / storePrice) * 100)
    : null;
  const negotiationFloor = salePrice ? Math.round(salePrice * 0.85 * 100) / 100 : null;
  const maxBuyPrice = salePrice ? Math.round((salePrice - minProfit) * 100) / 100 : null;

  let recommendedQty = "1 (test)";
  if (netProfit && netProfit >= minProfit * 2) {
    recommendedQty = "2–4";
  } else if (netProfit && netProfit >= minProfit) {
    recommendedQty = "1–2";
  }

  return {
    store_price: storePrice,
    expected_sale_price: salePrice,
    gross_spread: grossSpread,
    estimated_net_profit: netProfit,
    profit_margin_percent: marginPct,
    negotiation_floor: negotiationFloor,
    max_buy_price: maxBuyPrice,
    recommended_quantity: recommendedQty,
    category_min_profit: minProfit,
    meets_minimum: !!(netProfit && netProfit >= minProfit),
  };
}

export function makeQuickDecision(
  item: ScannedItemInput,
  comp: CompSummary,
  profit: ProfitSummary
): QuickDecision {
  const isBulky = /furniture|outdoor|patio/i.test(item.category ?? "");
  const isDamaged = item.box_condition === "damaged";
  const isOpen = item.box_condition === "open_box";
  const noProductName = !item.product_name;

  // RESEARCH_MORE conditions
  if (noProductName || (!item.current_store_price && !item.clearance_price)) {
    return {
      recommendation: "RESEARCH_MORE",
      confidence_score: 20,
      one_sentence_reason: "Product identity or price could not be determined from the image.",
      risk_warning: "Scan the barcode, model number, or front of the box for a better match.",
      max_quantity: "0",
      best_next_action: "Try a closer photo of the price tag or barcode.",
    };
  }

  if (!comp.ebay_available && comp.comp_confidence < 40) {
    return {
      recommendation: "RESEARCH_MORE",
      confidence_score: comp.comp_confidence,
      one_sentence_reason: "eBay comps unavailable and product identity is uncertain.",
      risk_warning: "eBay comps unavailable. Try scanning the barcode or entering the model number.",
      max_quantity: "1",
      best_next_action: "Scan barcode or model number label for a better comp lookup.",
    };
  }

  // SKIP conditions
  if (!profit.meets_minimum || (profit.estimated_net_profit ?? 0) <= 0) {
    return {
      recommendation: "SKIP",
      confidence_score: Math.max(60, comp.comp_confidence),
      one_sentence_reason: `Not enough spread — estimated profit $${profit.estimated_net_profit?.toFixed(0) ?? "0"} is below the $${profit.category_min_profit} minimum for ${item.category ?? "this category"}.`,
      risk_warning: isDamaged ? "Damaged box further reduces resale value." : null,
      max_quantity: "0",
      best_next_action: "Leave it. Not enough margin after realistic resale pricing.",
    };
  }

  // MAYBE conditions
  const isThinSpread = profit.estimated_net_profit !== null && profit.estimated_net_profit < profit.category_min_profit * 2;
  if (isBulky || isDamaged || isOpen || isThinSpread || comp.comp_confidence < 70) {
    let reason = "Profit exists but ";
    if (isBulky) reason += "item is bulky — storage and transport risk is high.";
    else if (isDamaged) reason += "damaged box will reduce resale value.";
    else if (isOpen) reason += "open box item carries return risk.";
    else if (comp.comp_confidence < 70) reason += "comp confidence is medium — verify demand before buying more.";
    else reason += "spread is thin — buy 1 test unit first.";

    return {
      recommendation: "MAYBE",
      confidence_score: comp.comp_confidence,
      one_sentence_reason: reason,
      risk_warning: isBulky ? "Storage and transport risk. Consider buying only if you have a buyer." : null,
      max_quantity: "1",
      best_next_action: "Buy 1 test unit, list it, then return for more if it sells fast.",
    };
  }

  // BUY
  const qty = profit.recommended_quantity;
  const reason = `${item.category ?? "Item"} with $${profit.estimated_net_profit?.toFixed(0) ?? "—"} estimated profit per unit — strong ${comp.ebay_available ? "eBay comps" : "category signal"} and good local demand.`;

  return {
    recommendation: "BUY",
    confidence_score: comp.comp_confidence,
    one_sentence_reason: reason,
    risk_warning: comp.ebay_available
      ? `Watch for local saturation if ${item.retailer ?? "this retailer"} has multiple locations nearby.`
      : "eBay comps not available — based on store markup analysis and category rules.",
    max_quantity: qty,
    best_next_action: `Buy ${qty} units now. List on Facebook Marketplace at $${comp.suggested_facebook_list_price?.toFixed(0) ?? "—"}.`,
  };
}
