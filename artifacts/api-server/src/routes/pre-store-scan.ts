import { Router } from "express";
import multer from "multer";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  preStoreScanItemsTable,
  preStoreScanSessionsTable,
  watchlistItemsTable,
} from "@workspace/db";
import { toIsoDateTime } from "../lib/date";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

type PreStoreItemInput = {
  retailer?: string;
  store_location?: string;
  product_name?: string;
  category?: string | null;
  item_number?: string | null;
  upc?: string | null;
  sku?: string | null;
  dpci?: string | null;
  tcin?: string | null;
  online_price?: number | null;
  in_store_price?: number | null;
  stock_status?: string | null;
  markdown_signal?: string | null;
  data_source?: string | null;
  source_confidence?: string | null;
  ebay_active_median?: number | null;
  ebay_sold_median?: number | null;
  amazon_reference_price?: number | null;
  expected_facebook_sale_price?: number | null;
  distance_to_store?: number | null;
  last_seen_at?: string | null;
};

const CATEGORY_DEMAND: Record<string, number> = {
  LEGO: 14,
  Toys: 10,
  Tools: 12,
  Electronics: 9,
  "Video Games": 10,
  "Small Appliances": 7,
  Seasonal: 6,
  "Outdoor / Patio": 6,
  Collectibles: 8,
};

function nowIso() {
  return new Date().toISOString();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeSession(row: typeof preStoreScanSessionsTable.$inferSelect) {
  return { ...row, created_at: toIsoDateTime(row.created_at), updated_at: toIsoDateTime(row.updated_at) };
}

function serializeItem(row: typeof preStoreScanItemsTable.$inferSelect) {
  return { ...row, created_at: toIsoDateTime(row.created_at), updated_at: toIsoDateTime(row.updated_at) };
}

function scorePreStoreOpportunity(item: PreStoreItemInput) {
  const buyPrice = numberValue(item.in_store_price ?? item.online_price);
  const expectedSale = numberValue(item.expected_facebook_sale_price ?? item.ebay_sold_median ?? item.ebay_active_median ?? item.amazon_reference_price);
  const estimatedProfit = Math.max(0, expectedSale - buyPrice);
  const margin = buyPrice > 0 ? estimatedProfit / buyPrice : 0;
  const confidence = String(item.source_confidence ?? "medium").toLowerCase();
  const stock = String(item.stock_status ?? "").toLowerCase();
  const markdown = String(item.markdown_signal ?? "").toLowerCase();
  let score = 25;
  score += Math.min(28, estimatedProfit * 2);
  score += Math.min(14, margin * 20);
  score += CATEGORY_DEMAND[item.category ?? ""] ?? 5;
  score += confidence === "high" ? 12 : confidence === "medium" ? 7 : 2;
  score += stock.includes("in stock") || stock.includes("seen") || stock.includes("available") ? 8 : stock.includes("unknown") ? 2 : 0;
  score += markdown.includes(".97") || markdown.includes("clearance") || markdown.includes("markdown") ? 8 : 0;
  score -= Math.min(14, numberValue(item.distance_to_store) / 2);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tripPriority = score >= 80 ? "Must Check" : score >= 60 ? "Check If Nearby" : score >= 45 ? "Watch" : "Skip";
  const recommendation = score >= 80 ? "Strong Buy If Price Matches" : score >= 60 ? "Ready to Check In Store" : score >= 45 ? "Watch Only" : "Skip";
  return {
    pre_store_score: score,
    recommendation,
    trip_priority: tripPriority,
    target_buy_price: buyPrice || null,
    max_quantity: score >= 80 ? "2-4" : score >= 60 ? "1-2" : "0-1",
    expected_facebook_sale_price: expectedSale || null,
    estimated_profit: Math.round(estimatedProfit * 100) / 100,
    reason: score >= 80 ? "Good resale spread and worth verifying in store." : score >= 60 ? "Potential profit exists, but confirm price and stock first." : score >= 45 ? "Watch for a better price or stronger comps." : "Not enough spread or confidence for a trip.",
    risk_notes: confidence === "low" ? "Weak confidence. Do not buy until barcode/model and shelf price are confirmed." : "Confirm price, stock, condition, and exact model in store before buying.",
  };
}

function parsePastedRows(text: string, session: typeof preStoreScanSessionsTable.$inferSelect) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const price = line.match(/\$?\b(\d+(?:\.\d{2})?)\b/);
    const itemNumber = line.match(/\b(?:item|sku|upc|dpci|tcin|#)\s*[:#]?\s*([A-Z0-9-]{4,})/i);
    const product = line.replace(/\$?\b\d+(?:\.\d{2})?\b/g, "").replace(/\b(?:item|sku|upc|dpci|tcin|#)\s*[:#]?\s*[A-Z0-9-]{4,}/ig, "").trim();
    return {
      retailer: session.retailer,
      store_location: firstStoreName(session.selected_stores) ?? "Unknown store",
      product_name: product || line,
      category: session.selected_category ?? "Other",
      item_number: itemNumber?.[1] ?? null,
      online_price: price ? Number(price[1]) : null,
      stock_status: "Unknown",
      markdown_signal: line.toLowerCase().includes("clearance") ? "clearance" : null,
      data_source: "paste_text",
      source_confidence: "medium",
      last_seen_at: nowIso(),
    };
  });
}

function firstStoreName(stores: unknown) {
  const list = Array.isArray(stores) ? stores : [];
  const first = list[0] as Record<string, unknown> | undefined;
  return first ? String(first.store_name ?? first.name ?? first.store_location ?? "") : null;
}

async function insertScoredItems(sessionId: number, rows: PreStoreItemInput[]) {
  const [session] = await db.select().from(preStoreScanSessionsTable).where(eq(preStoreScanSessionsTable.id, sessionId)).limit(1);
  if (!session) return [];
  const values = rows.filter((row) => row.product_name).map((row) => {
    const scored = scorePreStoreOpportunity(row);
    return {
      pre_store_scan_session_id: sessionId,
      retailer: row.retailer ?? session.retailer,
      store_location: row.store_location ?? firstStoreName(session.selected_stores) ?? "Unknown store",
      product_name: String(row.product_name),
      category: row.category ?? session.selected_category ?? null,
      item_number: row.item_number ?? null,
      upc: row.upc ?? null,
      sku: row.sku ?? null,
      dpci: row.dpci ?? null,
      tcin: row.tcin ?? null,
      online_price: row.online_price ?? null,
      in_store_price: row.in_store_price ?? null,
      stock_status: row.stock_status ?? "Unknown",
      markdown_signal: row.markdown_signal ?? null,
      last_seen_at: row.last_seen_at ?? nowIso(),
      data_source: row.data_source ?? "manual",
      source_confidence: row.source_confidence ?? "medium",
      ebay_active_median: row.ebay_active_median ?? null,
      ebay_sold_median: row.ebay_sold_median ?? null,
      amazon_reference_price: row.amazon_reference_price ?? null,
      ...scored,
    };
  });
  const inserted = values.length ? await db.insert(preStoreScanItemsTable).values(values).returning() : [];
  await refreshSessionRollup(sessionId);
  return inserted;
}

async function refreshSessionRollup(sessionId: number) {
  const items = await db.select().from(preStoreScanItemsTable).where(eq(preStoreScanItemsTable.pre_store_scan_session_id, sessionId));
  const must = items.filter((item) => item.trip_priority === "Must Check").length;
  const nearby = items.filter((item) => item.trip_priority === "Check If Nearby").length;
  const watch = items.filter((item) => item.trip_priority === "Watch").length;
  const skip = items.filter((item) => item.trip_priority === "Skip").length;
  const spend = items.filter((item) => ["Must Check", "Check If Nearby"].includes(item.trip_priority)).reduce((sum, item) => sum + numberValue(item.target_buy_price), 0);
  const profit = items.filter((item) => ["Must Check", "Check If Nearby"].includes(item.trip_priority)).reduce((sum, item) => sum + numberValue(item.estimated_profit), 0);
  await db.update(preStoreScanSessionsTable).set({
    total_items_found: items.length,
    must_check_count: must,
    check_if_nearby_count: nearby,
    watch_count: watch,
    skip_count: skip,
    estimated_total_spend: spend,
    estimated_total_profit: profit,
    updated_at: new Date(),
  }).where(eq(preStoreScanSessionsTable.id, sessionId));
}

function buildStoreTripPlan(items: Array<typeof preStoreScanItemsTable.$inferSelect>, settings: Record<string, unknown> = {}) {
  const byStore = new Map<string, Array<typeof preStoreScanItemsTable.$inferSelect>>();
  items.forEach((item) => byStore.set(item.store_location, [...(byStore.get(item.store_location) ?? []), item]));
  const scoredStores = Array.from(byStore.entries()).map(([store, rows]) => ({
    store,
    must_check_count: rows.filter((item) => item.trip_priority === "Must Check").length,
    total_profit: rows.reduce((sum, item) => sum + numberValue(item.estimated_profit), 0),
    total_spend: rows.reduce((sum, item) => sum + numberValue(item.target_buy_price), 0),
    rows,
  })).sort((a, b) => (b.must_check_count - a.must_check_count) || (b.total_profit - a.total_profit));
  const first = scoredStores[0];
  const second = scoredStores[1];
  const buyItems = items.filter((item) => ["Must Check", "Check If Nearby"].includes(item.trip_priority));
  const skipItems = items.filter((item) => item.trip_priority === "Skip");
  return {
    first_store_to_visit: first?.store ?? null,
    second_store_optional: second?.store ?? null,
    items_to_check_by_store: scoredStores.map((store) => ({
      store: store.store,
      estimated_profit: Math.round(store.total_profit * 100) / 100,
      items: store.rows.map((item) => ({
        id: item.id,
        product_name: item.product_name,
        item_number: item.item_number ?? item.upc ?? item.sku ?? item.dpci ?? item.tcin,
        target_price: item.target_buy_price,
        max_quantity: item.max_quantity,
        expected_profit: item.estimated_profit,
        priority: item.trip_priority,
        checklist_status: item.checklist_status,
      })),
    })),
    items_to_buy_if_price_matches: buyItems.map((item) => item.product_name),
    items_to_skip: skipItems.map((item) => ({ product_name: item.product_name, reason: item.reason ?? item.risk_notes })),
    estimated_total_spend: Math.round(buyItems.reduce((sum, item) => sum + numberValue(item.target_buy_price), 0) * 100) / 100,
    estimated_total_profit: Math.round(buyItems.reduce((sum, item) => sum + numberValue(item.estimated_profit), 0) * 100) / 100,
    trip_risk_level: buyItems.some((item) => item.source_confidence === "low") ? "Medium" : "Low",
    notes: [
      "Confirm shelf price, barcode/model, and condition before buying.",
      "Prices may vary by location. Confirm in store before buying.",
      settings.time_available ? `Time available: ${settings.time_available}` : null,
    ].filter(Boolean),
  };
}

router.get("/pre-store-scan", async (_req, res) => {
  const sessions = await db.select().from(preStoreScanSessionsTable);
  sessions.sort((a, b) => b.id - a.id);
  const recent = sessions.slice(0, 12);
  const sessionsWithItems = await Promise.all(recent.map(async (session) => {
    const items = await db.select().from(preStoreScanItemsTable).where(eq(preStoreScanItemsTable.pre_store_scan_session_id, session.id));
    return {
      ...serializeSession(session),
      items: items.map(serializeItem),
      trip_plan: session.trip_plan_json ?? (items.length ? buildStoreTripPlan(items) : null),
    };
  }));
  res.json({ sessions: sessionsWithItems });
});

router.post("/pre-store-scan/start", async (req, res) => {
  const stores = Array.isArray(req.body.selected_stores) ? req.body.selected_stores : [];
  const [session] = await db.insert(preStoreScanSessionsTable).values({
    retailer: String(req.body.retailer ?? "Costco"),
    selected_stores: stores,
    hunt_type: String(req.body.hunt_type ?? "Category Hunt"),
    selected_category: req.body.selected_category ? String(req.body.selected_category) : null,
    search_terms: req.body.search_terms ? String(req.body.search_terms) : null,
    capture_methods_used: req.body.capture_method ? String(req.body.capture_method) : null,
    started_at: nowIso(),
    notes: req.body.notes ? String(req.body.notes) : null,
  }).returning();
  res.status(201).json({ session: serializeSession(session) });
});

router.post("/pre-store-scan/public-check", async (req, res) => {
  res.json({
    status: "no_inventory_visible",
    message: "Online inventory was not publicly available for this store. Upload screenshots, paste text, or enter items manually.",
    compliance: ["No login bypass", "No CAPTCHA bypass", "Public visible data only"],
    session_id: req.body.session_id ?? null,
  });
});

router.post("/pre-store-scan/upload-screenshots", upload.array("images", 8), async (req, res) => {
  const sessionId = Number(req.body.session_id);
  const rows = Array.isArray(req.body.items) ? req.body.items : [];
  const inserted = await insertScoredItems(sessionId, rows as PreStoreItemInput[]);
  res.json({ message: "Screenshots accepted. Add parsed rows manually if OCR is not available.", items: inserted.map(serializeItem) });
});

router.post("/pre-store-scan/paste-text", async (req, res) => {
  const sessionId = Number(req.body.session_id);
  const [session] = await db.select().from(preStoreScanSessionsTable).where(eq(preStoreScanSessionsTable.id, sessionId)).limit(1);
  if (!session) {
    res.status(404).json({ error: "Pre-store session not found" });
    return;
  }
  const rows = parsePastedRows(String(req.body.text ?? ""), session);
  const inserted = await insertScoredItems(sessionId, rows);
  res.status(201).json({ items: inserted.map(serializeItem) });
});

router.post("/pre-store-scan/manual-entry", async (req, res) => {
  const sessionId = Number(req.body.session_id);
  const rows = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const inserted = await insertScoredItems(sessionId, rows as PreStoreItemInput[]);
  res.status(201).json({ items: inserted.map(serializeItem) });
});

router.post("/pre-store-scan/run-comps", async (req, res) => {
  const ids = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number) : [];
  const items = ids.length
    ? await db.select().from(preStoreScanItemsTable).where(inArray(preStoreScanItemsTable.id, ids))
    : await db.select().from(preStoreScanItemsTable).where(eq(preStoreScanItemsTable.pre_store_scan_session_id, Number(req.body.session_id)));
  const updated: Array<typeof preStoreScanItemsTable.$inferSelect> = [];
  for (const item of items) {
    const expected = item.expected_facebook_sale_price ?? item.ebay_sold_median ?? item.ebay_active_median ?? item.amazon_reference_price ?? (item.online_price ? item.online_price * 1.45 : null);
    const scored = scorePreStoreOpportunity({ ...item, expected_facebook_sale_price: expected ?? undefined, source_confidence: item.source_confidence });
    const [row] = await db.update(preStoreScanItemsTable).set({ ...scored, expected_facebook_sale_price: expected, updated_at: new Date() }).where(eq(preStoreScanItemsTable.id, item.id)).returning();
    updated.push(row);
  }
  if (items[0]) await refreshSessionRollup(items[0].pre_store_scan_session_id);
  res.json({ items: updated.map(serializeItem) });
});

router.post("/pre-store-scan/build-trip-plan", async (req, res) => {
  const sessionId = Number(req.body.session_id);
  const items = await db.select().from(preStoreScanItemsTable).where(eq(preStoreScanItemsTable.pre_store_scan_session_id, sessionId));
  const plan = buildStoreTripPlan(items, req.body.settings ?? {});
  const [session] = await db.update(preStoreScanSessionsTable).set({
    completed_at: nowIso(),
    first_store_to_visit: plan.first_store_to_visit,
    second_store_optional: plan.second_store_optional,
    estimated_total_spend: plan.estimated_total_spend,
    estimated_total_profit: plan.estimated_total_profit,
    trip_plan_json: plan,
    updated_at: new Date(),
  }).where(eq(preStoreScanSessionsTable.id, sessionId)).returning();
  res.json({ session: serializeSession(session), plan });
});

router.post("/pre-store-scan/save-to-inventory", async (req, res) => {
  const ids = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number) : [Number(req.body.item_id)];
  const items = await db.select().from(preStoreScanItemsTable).where(inArray(preStoreScanItemsTable.id, ids));
  const inserted = items.length ? await db.insert(inventoryItemsTable).values(items.map((item) => ({
    retailer: item.retailer,
    source_type: "pre_store_scan",
    hunt_mode: "pre_store",
    pre_store_scan_session_id: item.pre_store_scan_session_id,
    store_location: item.store_location,
    product_name: item.product_name,
    category: item.category,
    item_number: item.item_number,
    upc: item.upc,
    sku: item.sku,
    dpci: item.dpci,
    tcin: item.tcin,
    price: item.in_store_price ?? item.online_price,
    current_store_price: item.in_store_price ?? item.online_price,
    stock_status: item.stock_status,
    markdown_code: item.markdown_signal,
    expected_facebook_sale_price: item.expected_facebook_sale_price,
    estimated_profit_per_unit: item.estimated_profit,
    recommendation: item.trip_priority === "Must Check" ? "BUY" : item.trip_priority === "Check If Nearby" ? "MAYBE" : item.trip_priority === "Watch" ? "RESEARCH_MORE" : "SKIP",
    confidence_score: item.pre_store_score,
    max_quantity: item.max_quantity,
    risk_notes: item.risk_notes,
    one_sentence_reason: item.reason,
  }))).returning() : [];
  res.status(201).json({ items: inserted });
});

router.post("/pre-store-scan/add-to-watchlist", async (req, res) => {
  const ids = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number) : [Number(req.body.item_id)];
  const items = await db.select().from(preStoreScanItemsTable).where(inArray(preStoreScanItemsTable.id, ids));
  const inserted = items.length ? await db.insert(watchlistItemsTable).values(items.map((item) => ({
    item_number: item.item_number ?? item.upc ?? item.sku ?? item.dpci ?? item.tcin ?? `prestore-${item.id}`,
    product_name: item.product_name,
    desired_buy_price: item.target_buy_price,
    target_resale_price: item.expected_facebook_sale_price,
    stores_to_watch: item.store_location,
    notes: item.risk_notes,
    last_seen_price: item.online_price ?? item.in_store_price,
    last_seen_store: item.store_location,
    last_seen_at: item.last_seen_at,
  }))).returning() : [];
  res.status(201).json({ items: inserted });
});

router.patch("/pre-store-scan/checklist/:id", async (req, res) => {
  const [item] = await db.update(preStoreScanItemsTable).set({
    checklist_status: String(req.body.status ?? "Not checked"),
    checklist_note: req.body.note ? String(req.body.note) : null,
    updated_at: new Date(),
  }).where(eq(preStoreScanItemsTable.id, Number(req.params.id))).returning();
  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  res.json(serializeItem(item));
});

router.get("/pre-store-scan/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [session] = await db.select().from(preStoreScanSessionsTable).where(eq(preStoreScanSessionsTable.id, id)).limit(1);
  if (!session) {
    res.status(404).json({ error: "Pre-store session not found" });
    return;
  }
  const items = await db.select().from(preStoreScanItemsTable).where(eq(preStoreScanItemsTable.pre_store_scan_session_id, id));
  res.json({ session: serializeSession(session), items: items.map(serializeItem), trip_plan: session.trip_plan_json ?? buildStoreTripPlan(items) });
});

export default router;
