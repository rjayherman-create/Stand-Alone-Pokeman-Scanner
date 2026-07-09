type RiskPreference = "Conservative" | "Balanced" | "Aggressive";

export interface BudgetSettings {
  target_budget_amount: number;
  budget_period: "Today" | "This Week" | "Next 2 Weeks" | "This Month";
  preferred_retailers: string[];
  preferred_categories: string[];
  risk_preference: RiskPreference;
  max_cash_tied_up_days: number;
  storage_limit: "Small items only" | "Medium items okay" | "Large items okay";
  selling_channels: "Facebook Marketplace" | "eBay" | "Both";
  minimum_profit_per_item: number;
  minimum_profit_margin_percent: number;
  keep_cash_reserve_percent: number;
}

export interface BudgetInventoryItem {
  id: number;
  retailer?: string | null;
  store_location?: string | null;
  product_name: string;
  category?: string | null;
  price?: number | null;
  current_store_price?: number | null;
  recommendation?: string | null;
  flip_score?: number | null;
  confidence_score?: number | null;
  comp_confidence?: string | null;
  estimated_profit_per_unit?: number | null;
  expected_facebook_sale_price?: number | null;
  profit_margin_percent?: number | null;
  max_quantity?: string | null;
  risk_warning?: string | null;
  risk_notes?: string | null;
  box_condition?: string | null;
  stock_status?: string | null;
  created_at?: Date | string | null;
}

export interface BudgetPlanSelection {
  inventory_item_id: number;
  product_name: string;
  retailer: string;
  store_location: string;
  category: string;
  priority_score: number;
  priority_level: "Must Buy" | "Good Buy" | "Test Buy" | "Watch" | "Skip";
  unit_cost: number;
  suggested_quantity: number;
  total_cost: number;
  expected_sale_price: number;
  estimated_profit_low: number;
  estimated_profit_high: number;
  sell_speed: "Fast" | "Medium" | "Slow" | "Unknown";
  confidence_score: number;
  risk_notes: string;
  action: string;
}

export interface BuiltBudgetPlan {
  recommended_spend: number;
  cash_reserve: number;
  selected_items: BudgetPlanSelection[];
  skipped_items: BudgetPlanSelection[];
  estimated_revenue: number;
  estimated_profit_low: number;
  estimated_profit_high: number;
  average_sell_time_estimate: string;
  risk_summary: string;
  action_plan: string;
  first_store_to_visit: string | null;
  second_store_optional: string | null;
  estimated_spend_by_store: Record<string, number>;
  estimated_profit_by_store: Record<string, number>;
  warnings: string[];
}

export const DEFAULT_BUDGET_SETTINGS: Omit<BudgetSettings, "target_budget_amount" | "budget_period" | "preferred_retailers" | "preferred_categories"> = {
  risk_preference: "Balanced",
  max_cash_tied_up_days: 14,
  storage_limit: "Medium items okay",
  selling_channels: "Facebook Marketplace",
  minimum_profit_per_item: 7,
  minimum_profit_margin_percent: 25,
  keep_cash_reserve_percent: 20,
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseQuantity(maxQuantity?: string | null): number {
  if (!maxQuantity) return 1;
  const matches = maxQuantity.match(/\d+/g)?.map(Number) ?? [];
  if (matches.length === 0) return 1;
  return Math.max(1, Math.min(8, matches[matches.length - 1] ?? 1));
}

function isBulky(item: BudgetInventoryItem): boolean {
  return /furniture|outdoor|patio|appliance/i.test(item.category ?? "");
}

export function estimateSellSpeed(item: BudgetInventoryItem): "Fast" | "Medium" | "Slow" | "Unknown" {
  const category = item.category ?? "";
  const damaged = /damaged|open/i.test(item.box_condition ?? "");
  if (damaged || isBulky(item)) return "Slow";
  if (/lego|toy|tool|electronics/i.test(category) && (item.recommendation === "BUY" || (item.flip_score ?? 0) >= 75)) return "Fast";
  if ((item.estimated_profit_per_unit ?? 0) > 0 || item.recommendation === "MAYBE") return "Medium";
  return "Unknown";
}

export function scoreBudgetPriority(item: BudgetInventoryItem, settings: BudgetSettings): BudgetPlanSelection {
  const unitCost = item.current_store_price ?? item.price ?? 0;
  const expectedSale = item.expected_facebook_sale_price ?? unitCost * 1.45;
  const profit = item.estimated_profit_per_unit ?? expectedSale - unitCost;
  const margin = item.profit_margin_percent ?? (unitCost > 0 ? (profit / unitCost) * 100 : 0);
  const confidence =
    item.confidence_score ??
    (item.comp_confidence === "HIGH" ? 85 : item.comp_confidence === "MEDIUM" ? 70 : item.comp_confidence === "LOW" ? 45 : item.flip_score ?? 50);
  const speed = estimateSellSpeed(item);
  const category = item.category ?? "Other";

  let score = 0;
  score += Math.min(30, (item.flip_score ?? 50) * 0.3);
  score += Math.min(22, Math.max(0, profit) * 1.5);
  score += Math.min(15, Math.max(0, margin) * 0.3);
  score += Math.min(15, confidence * 0.15);
  score += speed === "Fast" ? 10 : speed === "Medium" ? 5 : speed === "Slow" ? -8 : 0;
  score += settings.preferred_retailers.includes(item.retailer ?? "") ? 4 : settings.preferred_retailers.length ? -6 : 0;
  score += settings.preferred_categories.includes(category) ? 4 : settings.preferred_categories.length ? -6 : 0;
  score += item.recommendation === "BUY" ? 8 : item.recommendation === "MAYBE" ? 2 : item.recommendation === "SKIP" ? -25 : 0;
  if (unitCost > settings.target_budget_amount * 0.4) score -= 10;
  if (isBulky(item) && settings.storage_limit !== "Large items okay") score -= 14;
  if (profit < settings.minimum_profit_per_item) score -= 20;
  if (margin < settings.minimum_profit_margin_percent) score -= 15;
  if (confidence < 60) score -= 12;

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const priority_level =
    bounded >= 82 ? "Must Buy" :
    bounded >= 70 ? "Good Buy" :
    bounded >= 55 ? "Test Buy" :
    bounded >= 40 ? "Watch" :
    "Skip";

  const riskNotes: string[] = [];
  if (confidence < 70) riskNotes.push("Low confidence. Scan barcode or check comps before buying.");
  if (speed === "Slow") riskNotes.push("May tie up cash longer than desired.");
  if (isBulky(item)) riskNotes.push("Bulky inventory may be harder to store or move.");
  if (profit < settings.minimum_profit_per_item) riskNotes.push("Profit may be too thin after negotiation.");

  return {
    inventory_item_id: item.id,
    product_name: item.product_name,
    retailer: item.retailer ?? "Other",
    store_location: item.store_location ?? "Unknown store",
    category,
    priority_score: bounded,
    priority_level,
    unit_cost: money(unitCost),
    suggested_quantity: 1,
    total_cost: money(unitCost),
    expected_sale_price: money(expectedSale),
    estimated_profit_low: money(Math.max(0, profit * 0.8)),
    estimated_profit_high: money(Math.max(0, profit * 1.2)),
    sell_speed: speed,
    confidence_score: Math.round(confidence),
    risk_notes: riskNotes.join(" "),
    action: priority_level === "Skip" ? "Skip" : priority_level === "Watch" ? "Research More" : "Buy",
  };
}

function riskQuantityCap(settings: BudgetSettings): number {
  if (settings.risk_preference === "Conservative") return 2;
  if (settings.risk_preference === "Aggressive") return 6;
  return 4;
}

function reservePercent(settings: BudgetSettings): number {
  if (settings.keep_cash_reserve_percent > 0) return settings.keep_cash_reserve_percent;
  if (settings.risk_preference === "Conservative") return 30;
  if (settings.risk_preference === "Aggressive") return 10;
  return 20;
}

export function buildBudgetPlan(items: BudgetInventoryItem[], settings: BudgetSettings): BuiltBudgetPlan {
  const reserve = money(settings.target_budget_amount * (reservePercent(settings) / 100));
  const usableBudget = money(Math.max(0, settings.target_budget_amount - reserve));
  const scored = items
    .filter((item) => !["SKIP"].includes(item.recommendation ?? "") || settings.risk_preference === "Aggressive")
    .map((item) => scoreBudgetPriority(item, settings))
    .sort((a, b) => b.priority_score - a.priority_score);

  const selected: BudgetPlanSelection[] = [];
  const skipped: BudgetPlanSelection[] = [];
  const spendByStore: Record<string, number> = {};
  const profitByStore: Record<string, number> = {};
  const categorySpend: Record<string, number> = {};
  let spend = 0;
  const cap = riskQuantityCap(settings);

  for (const candidate of scored) {
    if (candidate.priority_level === "Skip" || candidate.priority_level === "Watch") {
      skipped.push({ ...candidate, action: candidate.priority_level === "Watch" ? "Watch" : "Skip" });
      continue;
    }

    let desiredQty = Math.min(cap, parseQuantity(items.find((i) => i.id === candidate.inventory_item_id)?.max_quantity));
    if (settings.risk_preference === "Conservative") desiredQty = Math.min(desiredQty, candidate.priority_level === "Must Buy" ? 2 : 1);
    if (candidate.priority_level === "Test Buy") desiredQty = 1;
    if (candidate.sell_speed === "Slow") desiredQty = 1;

    const maxSingleItemSpend = candidate.confidence_score >= 85 ? usableBudget : usableBudget * 0.4;
    desiredQty = Math.min(desiredQty, Math.max(1, Math.floor(maxSingleItemSpend / candidate.unit_cost)));

    if (settings.budget_period !== "Today" && categorySpend[candidate.category] > usableBudget * 0.6 && !/lego|tools/i.test(candidate.category)) {
      skipped.push({ ...candidate, action: "Skip", risk_notes: `${candidate.risk_notes} Too much budget is already in ${candidate.category}.`.trim() });
      continue;
    }

    const affordableQty = Math.floor((usableBudget - spend) / candidate.unit_cost);
    const qty = Math.max(0, Math.min(desiredQty, affordableQty));
    if (qty <= 0) {
      skipped.push({ ...candidate, action: "Skip", risk_notes: "Does not fit remaining usable budget." });
      continue;
    }

    const totalCost = money(candidate.unit_cost * qty);
    const planItem = {
      ...candidate,
      suggested_quantity: qty,
      total_cost: totalCost,
      estimated_profit_low: money(candidate.estimated_profit_low * qty),
      estimated_profit_high: money(candidate.estimated_profit_high * qty),
    };
    selected.push(planItem);
    spend = money(spend + totalCost);
    spendByStore[planItem.store_location] = money((spendByStore[planItem.store_location] ?? 0) + totalCost);
    profitByStore[planItem.store_location] = money((profitByStore[planItem.store_location] ?? 0) + planItem.estimated_profit_low);
    categorySpend[planItem.category] = money((categorySpend[planItem.category] ?? 0) + totalCost);
  }

  const estimatedRevenue = money(selected.reduce((sum, item) => sum + item.expected_sale_price * item.suggested_quantity, 0));
  const profitLow = money(selected.reduce((sum, item) => sum + item.estimated_profit_low, 0));
  const profitHigh = money(selected.reduce((sum, item) => sum + item.estimated_profit_high, 0));
  const warnings: string[] = [];
  if (spend > usableBudget) warnings.push(`You are $${money(spend - usableBudget)} over your usable budget. Reduce quantity or lower cash reserve.`);
  if (selected.some((item) => item.confidence_score < 70)) warnings.push("This plan includes low-confidence items. Scan barcode or check comps before buying.");
  if (selected.filter((item) => item.sell_speed === "Slow").length > 0) warnings.push("Several items may take more than 2 weeks to sell.");
  if (selected.some((item) => /bulky|storage/i.test(item.risk_notes))) warnings.push("This plan includes bulky items that may be harder to store or move.");
  if (selected.some((item) => item.estimated_profit_low < settings.minimum_profit_per_item)) warnings.push("Profit may be too thin after negotiation.");

  const stores = Object.entries(spendByStore).sort((a, b) => b[1] - a[1]);
  const firstStore = stores[0]?.[0] ?? null;
  const secondStore = stores[1]?.[0] ?? null;
  const actionPlan = firstStore
    ? `Go to ${firstStore} first. It has the strongest selected deals. ${secondStore ? `Then check ${secondStore} only if you still have cash left.` : "Keep the remaining cash as reserve."}`
    : "No strong buy plan yet. Add comps or scan more items before spending.";

  return {
    recommended_spend: money(spend),
    cash_reserve: reserve,
    selected_items: selected,
    skipped_items: [...skipped, ...scored.filter((item) => !selected.some((s) => s.inventory_item_id === item.inventory_item_id) && !skipped.some((s) => s.inventory_item_id === item.inventory_item_id))],
    estimated_revenue: estimatedRevenue,
    estimated_profit_low: profitLow,
    estimated_profit_high: profitHigh,
    average_sell_time_estimate: selected.some((item) => item.sell_speed === "Slow") ? "Medium to Slow" : selected.every((item) => item.sell_speed === "Fast") ? "Fast: 1-3 days" : "Medium: 4-10 days",
    risk_summary: warnings[0] ?? "Balanced plan with cash reserve preserved. Profit is estimated, not guaranteed.",
    action_plan: actionPlan,
    first_store_to_visit: firstStore,
    second_store_optional: secondStore,
    estimated_spend_by_store: spendByStore,
    estimated_profit_by_store: profitByStore,
    warnings,
  };
}

export function normalizeBudgetSettings(input: Record<string, unknown>): BudgetSettings {
  return {
    target_budget_amount: Number(input.target_budget_amount ?? 300),
    budget_period: (input.budget_period as BudgetSettings["budget_period"]) ?? "This Week",
    preferred_retailers: Array.isArray(input.preferred_retailers) ? input.preferred_retailers.map(String) : [],
    preferred_categories: Array.isArray(input.preferred_categories) ? input.preferred_categories.map(String) : [],
    risk_preference: (input.risk_preference as RiskPreference) ?? DEFAULT_BUDGET_SETTINGS.risk_preference,
    max_cash_tied_up_days: Number(input.max_cash_tied_up_days ?? DEFAULT_BUDGET_SETTINGS.max_cash_tied_up_days),
    storage_limit: (input.storage_limit as BudgetSettings["storage_limit"]) ?? DEFAULT_BUDGET_SETTINGS.storage_limit,
    selling_channels: (input.selling_channels as BudgetSettings["selling_channels"]) ?? DEFAULT_BUDGET_SETTINGS.selling_channels,
    minimum_profit_per_item: Number(input.minimum_profit_per_item ?? DEFAULT_BUDGET_SETTINGS.minimum_profit_per_item),
    minimum_profit_margin_percent: Number(input.minimum_profit_margin_percent ?? DEFAULT_BUDGET_SETTINGS.minimum_profit_margin_percent),
    keep_cash_reserve_percent: Number(input.keep_cash_reserve_percent ?? DEFAULT_BUDGET_SETTINGS.keep_cash_reserve_percent),
  };
}
