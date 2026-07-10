import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  inventoryLotsTable,
  ledgerEntriesTable,
  thriftScanItemsTable,
  thriftScanSessionsTable,
  watchlistItemsTable,
} from "@workspace/db";
import { toIsoDateTime } from "../lib/date";

const router = Router();

type Recommendation = "BUY" | "MAYBE" | "SKIP" | "RESEARCH_MORE";

const PLACE_SUGGESTIONS = [
  "Goodwill",
  "Salvation Army",
  "Savers",
  "Habitat ReStore",
  "Thrift store",
  "Pawn shop",
  "Antique store",
  "Estate sale",
  "Flea market",
  "Garage sale",
  "Other",
];

const CATEGORY_MULTIPLIER: Record<string, number> = {
  Golf: 2.2,
  Tools: 2.3,
  Electronics: 2.1,
  "Audio Gear": 2.6,
  "Video / Lighting Gear": 2.4,
  Cameras: 2.3,
  "Musical Instruments": 2.5,
  "Sports Gear": 1.9,
  Collectibles: 2.0,
  Toys: 1.8,
  "Books / Media": 1.6,
  Furniture: 1.7,
  Appliances: 1.8,
  "Home Goods": 1.6,
  "Silverware / Metals": 2.2,
  "Jewelry / Watches": 2.2,
  "Designer / Clothing": 2.0,
};

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
}

function numberValue(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function intValue(value: unknown, fallback = 1) {
  return Math.max(1, Math.round(numberValue(value, fallback)));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeScanId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `TS-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function serializeSession(row: typeof thriftScanSessionsTable.$inferSelect) {
  return { ...row, created_at: toIsoDateTime(row.created_at), updated_at: toIsoDateTime(row.updated_at) };
}

function serializeItem(row: typeof thriftScanItemsTable.$inferSelect) {
  return { ...row, created_at: toIsoDateTime(row.created_at), updated_at: toIsoDateTime(row.updated_at) };
}

function buildRisks(input: Record<string, unknown>) {
  const condition = String(input.condition ?? input.item_condition ?? "").toLowerCase();
  const category = String(input.category ?? "").toLowerCase();
  const notes = [
    input.visible_damage,
    input.missing_parts,
    input.user_notes,
    input.notes,
    input.product_name,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
  const risks = new Set<string>();

  if (condition.includes("parts") || notes.includes("untested")) risks.add("Untested electronics or unknown function. Test power and core functions before listing.");
  if (notes.includes("power cord") || notes.includes("charger")) risks.add("Missing power cord or charger can lower sell-through and sale price.");
  if (notes.includes("remote")) risks.add("No remote warning. Confirm buyers can use it without original remote.");
  if (notes.includes("broken") || notes.includes("hinge") || notes.includes("button")) risks.add("Broken hinges/buttons reduce value and buyer pool.");
  if (notes.includes("water")) risks.add("Water damage risk. Avoid unless value is strong for parts.");
  if (notes.includes("bulky") || category.includes("furniture") || category.includes("appliance")) risks.add("Heavy or bulky item. Confirm transport, storage, and local buyer demand.");
  if (category.includes("designer") || category.includes("jewelry")) risks.add("Counterfeit risk. Verify markings, serials, and authenticity before buying.");
  if (category.includes("baby") || notes.includes("car seat")) risks.add("Safety-sensitive item. Check recall and resale rules before buying.");
  if (category.includes("golf") && (notes.includes("shaft") || notes.includes("grip"))) risks.add("Golf condition risk. Inspect shafts, grips, heads, and matching set completeness.");
  if (notes.includes("missing")) risks.add("Missing parts warning. Compare completed sold listings for incomplete units.");

  if (!risks.size) risks.add("Confirm exact model, condition, included accessories, and buyer demand before committing.");
  return Array.from(risks).join(" ");
}

function identifyItem(input: Record<string, unknown>) {
  const hint = String(input.manual_hint ?? input.product_name ?? input.notes ?? "").trim();
  const modelMatch = hint.match(/\b(?:model|mod|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._-]{2,})/i) ?? hint.match(/\b([A-Z]{2,}[- ]?\d{2,}[A-Z0-9-]*)\b/);
  const modelNumber = textOrNull(input.model_number) ?? modelMatch?.[1] ?? null;
  const brand = textOrNull(input.brand) ?? hint.split(/\s+/).find((word) => /^[A-Z][A-Za-z0-9&'-]{2,}$/.test(word)) ?? null;
  return {
    product_name: (textOrNull(input.product_name) ?? hint) || "Untitled thrift find",
    brand,
    model_number: modelNumber,
    serial_number: textOrNull(input.serial_number),
    category: textOrNull(input.category) ?? "Other",
    subcategory: textOrNull(input.subcategory),
    condition: textOrNull(input.condition ?? input.item_condition) ?? "Used good",
    estimated_retail_type: String(input.condition ?? "").toLowerCase().includes("new") ? "new_or_open_box" : "used",
    confidence_score: modelNumber ? 78 : hint.length > 8 ? 62 : 45,
    low_confidence_tip: modelNumber ? null : "Scan the brand label, model number, or back plate for a better match.",
  };
}

function lookupThriftComps(input: Record<string, unknown>) {
  const price = numberValue(input.negotiated_price ?? input.asking_price);
  const category = String(input.category ?? "Other");
  const multiplier = CATEGORY_MULTIPLIER[category] ?? 1.8;
  const model = textOrNull(input.model_number);
  const brand = textOrNull(input.brand);
  const baseSale = numberValue(input.expected_facebook_sale_price, price ? price * multiplier : 45);
  const soldLow = Math.max(5, baseSale * 0.8);
  const soldHigh = Math.max(soldLow + 5, baseSale * 1.25);
  const activeLow = Math.max(5, baseSale * 0.95);
  const activeHigh = Math.max(activeLow + 7, baseSale * 1.55);
  return {
    search_priority: model ? "Exact model number" : brand ? "Brand + product type" : "Manual search terms",
    ebay_sold_range: `$${roundMoney(soldLow)}-$${roundMoney(soldHigh)}`,
    ebay_active_range: `$${roundMoney(activeLow)}-$${roundMoney(activeHigh)}`,
    expected_facebook_sale_price: roundMoney(baseSale),
    suggested_list_price: roundMoney(baseSale * 1.18),
    suggested_channel: category === "Audio Gear" || category === "Cameras" ? "eBay + Facebook Marketplace" : "Facebook Marketplace",
    comp_notes: model
      ? "Model number found. Prioritize used sold comps before active listings."
      : "Manual comp estimate. Add brand/model photos for stronger matching.",
  };
}

function buildDecision(input: Record<string, unknown>) {
  const identified = identifyItem(input);
  const comps = lookupThriftComps({ ...input, ...identified });
  const buyPrice = numberValue(input.negotiated_price ?? input.asking_price);
  const quantity = intValue(input.quantity, 1);
  const expected = comps.expected_facebook_sale_price;
  const estimatedProfit = roundMoney((expected - buyPrice) * quantity);
  const margin = buyPrice > 0 ? estimatedProfit / (buyPrice * quantity) : 0;
  const riskNotes = buildRisks({ ...input, ...identified });
  const hasHighRisk = /Safety-sensitive|Counterfeit|Water damage|Untested/i.test(riskNotes);
  const confidence = Math.max(30, Math.min(95, numberValue(input.confidence_score, identified.confidence_score) + (identified.model_number ? 8 : 0) - (hasHighRisk ? 12 : 0)));
  const maxBuyPrice = roundMoney(expected * 0.45);
  let recommendation: Recommendation = "RESEARCH_MORE";
  if (buyPrice > 0 && estimatedProfit >= 30 && margin >= 0.65 && confidence >= 55 && !hasHighRisk) recommendation = "BUY";
  else if (buyPrice > 0 && estimatedProfit >= 15 && margin >= 0.35 && !/Safety-sensitive/i.test(riskNotes)) recommendation = "MAYBE";
  else if (buyPrice > maxBuyPrice * 1.25 || /Safety-sensitive/i.test(riskNotes)) recommendation = "SKIP";

  return {
    ...identified,
    ...comps,
    asking_price: buyPrice || null,
    negotiated_price: nullableNumber(input.negotiated_price),
    quantity,
    max_buy_price: maxBuyPrice,
    estimated_profit: estimatedProfit,
    recommendation,
    confidence_score: Math.round(confidence),
    risk_notes: riskNotes,
    one_sentence_reason:
      recommendation === "BUY"
        ? "Used resale spread is strong enough after condition risk."
        : recommendation === "MAYBE"
          ? "There is potential profit, but verify model, condition, and missing parts first."
          : recommendation === "SKIP"
            ? "Risk or price is too high for the expected used resale range."
            : "Need stronger model, condition, or sold-comp evidence before buying.",
  };
}

async function refreshSessionRollup(sessionId: number) {
  const items = await db.select().from(thriftScanItemsTable).where(eq(thriftScanItemsTable.thrift_scan_session_id, sessionId));
  await db.update(thriftScanSessionsTable).set({
    total_items_scanned: items.length,
    buy_count: items.filter((item) => item.recommendation === "BUY").length,
    maybe_count: items.filter((item) => item.recommendation === "MAYBE").length,
    skip_count: items.filter((item) => item.recommendation === "SKIP").length,
    research_more_count: items.filter((item) => item.recommendation === "RESEARCH_MORE").length,
    estimated_total_profit: roundMoney(items.reduce((sum, item) => sum + numberValue(item.estimated_profit), 0)),
    updated_at: new Date(),
  }).where(eq(thriftScanSessionsTable.id, sessionId));
}

async function createThriftItem(body: Record<string, unknown>) {
  const decision = buildDecision(body);
  const scanDate = body.scan_timestamp ? new Date(String(body.scan_timestamp)) : new Date();
  const scanId = String(body.scan_id ?? makeScanId(scanDate));
  const rawSessionId = body.thrift_scan_session_id ?? body.session_id;
  const sessionId = rawSessionId ? Number(rawSessionId) : null;
  const [item] = await db.insert(thriftScanItemsTable).values({
    thrift_scan_session_id: sessionId,
    store_name: textOrNull(body.store_name),
    store_address: textOrNull(body.store_address),
    city: textOrNull(body.city),
    state: textOrNull(body.state),
    zip: textOrNull(body.zip),
    gps_latitude: nullableNumber(body.gps_latitude),
    gps_longitude: nullableNumber(body.gps_longitude),
    scan_timestamp: String(body.scan_timestamp ?? scanDate.toISOString()),
    timezone: textOrNull(body.timezone),
    scan_id: scanId,
    original_photo_url: textOrNull(body.original_photo_url),
    stamped_photo_url: textOrNull(body.stamped_photo_url),
    full_item_photo_url: textOrNull(body.full_item_photo_url ?? body.original_photo_url),
    brand_logo_photo_url: textOrNull(body.brand_logo_photo_url),
    model_number_photo_url: textOrNull(body.model_number_photo_url),
    price_tag_photo_url: textOrNull(body.price_tag_photo_url),
    condition_photo_url: textOrNull(body.condition_photo_url),
    receipt_photo_url: textOrNull(body.receipt_photo_url),
    asking_price: nullableNumber(body.asking_price),
    negotiated_price: nullableNumber(body.negotiated_price),
    quantity: intValue(body.quantity, 1),
    product_name: decision.product_name,
    brand: decision.brand,
    model_number: decision.model_number,
    serial_number: textOrNull(body.serial_number),
    category: decision.category,
    subcategory: decision.subcategory,
    condition: decision.condition,
    visible_damage: textOrNull(body.visible_damage),
    missing_parts: textOrNull(body.missing_parts),
    included_accessories: textOrNull(body.included_accessories),
    estimated_retail_type: decision.estimated_retail_type,
    ebay_active_range: decision.ebay_active_range,
    ebay_sold_range: decision.ebay_sold_range,
    expected_facebook_sale_price: decision.expected_facebook_sale_price,
    suggested_list_price: decision.suggested_list_price,
    max_buy_price: decision.max_buy_price,
    estimated_profit: decision.estimated_profit,
    recommendation: decision.recommendation,
    suggested_channel: decision.suggested_channel,
    confidence_score: decision.confidence_score,
    risk_notes: decision.risk_notes,
    user_notes: textOrNull(body.user_notes ?? body.notes),
  }).returning();
  if (sessionId) await refreshSessionRollup(sessionId);
  return item;
}

async function saveInventoryFromThrift(item: typeof thriftScanItemsTable.$inferSelect) {
  const [existing] = item.inventory_item_id
    ? await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, item.inventory_item_id)).limit(1)
    : [];
  if (existing) return existing;

  const [inventory] = await db.insert(inventoryItemsTable).values({
    retailer: "Secondhand",
    source_type: "thrift_scan",
    hunt_mode: "thrift",
    thrift_scan_session_id: item.thrift_scan_session_id,
    store_location: item.store_name ?? item.store_address ?? "Thrift location",
    product_name: item.product_name,
    brand: item.brand,
    model_number: item.model_number,
    category: item.category,
    subcategory: item.subcategory,
    price: item.negotiated_price ?? item.asking_price,
    current_store_price: item.negotiated_price ?? item.asking_price,
    stock_status: "Found in store",
    facebook_list_price: item.suggested_list_price,
    expected_facebook_sale_price: item.expected_facebook_sale_price,
    suggested_facebook_list_price: item.suggested_list_price,
    max_buy_price: item.max_buy_price,
    estimated_profit_per_unit: item.estimated_profit,
    recommendation: item.recommendation,
    confidence_score: item.confidence_score,
    risk_notes: item.risk_notes,
    best_resale_channel: item.suggested_channel,
    one_sentence_reason: item.recommendation === "BUY" ? "Thrift scan shows enough used resale spread after condition risk." : "Review comps and condition before buying.",
    photo_url: item.stamped_photo_url ?? item.original_photo_url,
    original_photo_url: item.original_photo_url,
    stamped_photo_url: item.stamped_photo_url,
    receipt_photo_url: item.receipt_photo_url,
    store_name: item.store_name,
    store_address: item.store_address,
    gps_latitude: item.gps_latitude,
    gps_longitude: item.gps_longitude,
    scan_timestamp: item.scan_timestamp,
    scan_id: item.scan_id,
    thrift_condition: item.condition,
    missing_parts: item.missing_parts,
    visible_damage: item.visible_damage,
    included_accessories: item.included_accessories,
    user_notes: item.user_notes,
  }).returning();
  await db.update(thriftScanItemsTable).set({ inventory_item_id: inventory.id, updated_at: new Date() }).where(eq(thriftScanItemsTable.id, item.id));
  return inventory;
}

router.get("/thrift-scan", async (_req, res) => {
  const sessions = await db.select().from(thriftScanSessionsTable);
  const items = await db.select().from(thriftScanItemsTable);
  sessions.sort((a, b) => b.id - a.id);
  items.sort((a, b) => b.id - a.id);
  res.json({ sessions: sessions.map(serializeSession), items: items.slice(0, 50).map(serializeItem) });
});

router.post("/thrift-scan/start", async (req, res) => {
  const [session] = await db.insert(thriftScanSessionsTable).values({
    store_name: textOrNull(req.body.store_name),
    store_address: textOrNull(req.body.store_address),
    city: textOrNull(req.body.city),
    state: textOrNull(req.body.state),
    zip: textOrNull(req.body.zip),
    gps_latitude: nullableNumber(req.body.gps_latitude),
    gps_longitude: nullableNumber(req.body.gps_longitude),
    place_confidence: Math.round(numberValue(req.body.place_confidence, req.body.store_name ? 70 : 35)),
    user_confirmed_location: Boolean(req.body.user_confirmed_location),
    started_at: String(req.body.started_at ?? nowIso()),
    notes: textOrNull(req.body.notes),
  }).returning();
  res.status(201).json({ session: serializeSession(session), nearby_places: PLACE_SUGGESTIONS });
});

router.post("/thrift-scan/location", async (req, res) => {
  const sessionId = req.body.session_id ? Number(req.body.session_id) : null;
  const patch = {
    store_name: textOrNull(req.body.store_name),
    store_address: textOrNull(req.body.store_address),
    city: textOrNull(req.body.city),
    state: textOrNull(req.body.state),
    zip: textOrNull(req.body.zip),
    gps_latitude: nullableNumber(req.body.gps_latitude),
    gps_longitude: nullableNumber(req.body.gps_longitude),
    place_confidence: Math.round(numberValue(req.body.place_confidence, req.body.store_name ? 70 : 35)),
    user_confirmed_location: Boolean(req.body.user_confirmed_location),
    updated_at: new Date(),
  };
  if (!sessionId) {
    const [session] = await db.insert(thriftScanSessionsTable).values({ ...patch, started_at: nowIso() }).returning();
    res.status(201).json({ session: serializeSession(session), nearby_places: PLACE_SUGGESTIONS });
    return;
  }
  const [session] = await db.update(thriftScanSessionsTable).set(patch).where(eq(thriftScanSessionsTable.id, sessionId)).returning();
  if (!session) {
    res.status(404).json({ error: "Thrift scan session not found" });
    return;
  }
  res.json({ session: serializeSession(session), nearby_places: PLACE_SUGGESTIONS });
});

router.post("/thrift-scan/photo", async (req, res) => {
  res.json({
    scan_id: String(req.body.scan_id ?? makeScanId()),
    photo_type: String(req.body.photo_type ?? "full_item_photo"),
    original_photo_url: textOrNull(req.body.original_photo_url),
    stamped_photo_url: textOrNull(req.body.stamped_photo_url ?? req.body.original_photo_url),
    message: "Photo received. Browser-created stamped image is ready for scan storage.",
  });
});

router.post("/thrift-scan/identify", async (req, res) => {
  res.json({ identification: identifyItem(req.body) });
});

router.post("/thrift-scan/lookup-comps", async (req, res) => {
  res.json({ comps: lookupThriftComps(req.body) });
});

router.post("/thrift-scan/decision", async (req, res) => {
  res.json({ decision: buildDecision(req.body) });
});

router.post("/thrift-scan/save-to-inventory", async (req, res) => {
  const itemId = req.body.thrift_scan_item_id ? Number(req.body.thrift_scan_item_id) : null;
  const [item] = itemId ? await db.select().from(thriftScanItemsTable).where(eq(thriftScanItemsTable.id, itemId)).limit(1) : [await createThriftItem(req.body)];
  if (!item) {
    res.status(404).json({ error: "Thrift scan item not found" });
    return;
  }
  const inventory = await saveInventoryFromThrift(item);
  res.status(201).json({ item: serializeItem({ ...item, inventory_item_id: inventory.id }), inventory_item: inventory });
});

router.post("/thrift-scan/add-to-watchlist", async (req, res) => {
  const item = req.body.thrift_scan_item_id
    ? (await db.select().from(thriftScanItemsTable).where(eq(thriftScanItemsTable.id, Number(req.body.thrift_scan_item_id))).limit(1))[0]
    : await createThriftItem(req.body);
  if (!item) {
    res.status(404).json({ error: "Thrift scan item not found" });
    return;
  }
  const [watchlist] = await db.insert(watchlistItemsTable).values({
    item_number: item.model_number ?? item.scan_id,
    product_name: item.product_name,
    desired_buy_price: item.max_buy_price,
    target_resale_price: item.expected_facebook_sale_price,
    stores_to_watch: item.store_name ?? item.store_address,
    notes: item.risk_notes,
    last_seen_price: item.negotiated_price ?? item.asking_price,
    last_seen_store: item.store_name ?? item.store_address,
    last_seen_at: item.scan_timestamp,
  }).returning();
  res.status(201).json({ item: serializeItem(item), watchlist_item: watchlist });
});

router.post("/thrift-scan/record-purchase", async (req, res) => {
  const item = req.body.thrift_scan_item_id
    ? (await db.select().from(thriftScanItemsTable).where(eq(thriftScanItemsTable.id, Number(req.body.thrift_scan_item_id))).limit(1))[0]
    : await createThriftItem(req.body);
  if (!item) {
    res.status(404).json({ error: "Thrift scan item not found" });
    return;
  }
  const inventory = await saveInventoryFromThrift(item);
  const quantity = intValue(req.body.quantity_bought ?? item.quantity, 1);
  const unitPrice = numberValue(req.body.unit_purchase_price ?? item.negotiated_price ?? item.asking_price);
  const salesTax = numberValue(req.body.sales_tax_total);
  const totalPurchase = roundMoney(numberValue(req.body.total_purchase_price, unitPrice * quantity + salesTax));
  const [lot] = await db.insert(inventoryLotsTable).values({
    inventory_item_id: inventory.id,
    product_name: item.product_name,
    retailer: "Secondhand",
    store_location: item.store_name ?? item.store_address ?? "Thrift location",
    category: item.category,
    purchase_date: String(req.body.purchase_date ?? today()),
    quantity_bought: quantity,
    quantity_sold: 0,
    quantity_remaining: quantity,
    unit_purchase_price: unitPrice,
    sales_tax_total: salesTax,
    total_purchase_price: totalPurchase,
    average_unit_cost: quantity ? roundMoney(totalPurchase / quantity) : totalPurchase,
    expected_sale_price: item.expected_facebook_sale_price,
    estimated_profit: item.estimated_profit,
    receipt_photo_url: textOrNull(req.body.receipt_photo_url ?? item.receipt_photo_url),
    payment_method: String(req.body.payment_method ?? "Cash"),
    status: "Bought",
    notes: textOrNull(req.body.notes ?? item.user_notes),
  }).returning();
  const [entry] = await db.insert(ledgerEntriesTable).values({
    entry_date: lot.purchase_date,
    entry_type: "purchase",
    inventory_item_id: inventory.id,
    inventory_lot_id: lot.id,
    description: `Thrift purchase: ${item.product_name}`,
    retailer: lot.retailer,
    store_location: lot.store_location,
    product_name: item.product_name,
    category: item.category,
    quantity,
    money_out: totalPurchase,
    money_in: 0,
    net_amount: -totalPurchase,
    status: "Bought",
    notes: lot.notes,
  }).returning();
  await db.update(inventoryItemsTable).set({ bought_status: true, updated_at: new Date() }).where(eq(inventoryItemsTable.id, inventory.id));
  res.status(201).json({ item: serializeItem(item), inventory_item: inventory, lot, entry });
});

router.get("/thrift-scan/:id", async (req, res) => {
  const [session] = await db.select().from(thriftScanSessionsTable).where(eq(thriftScanSessionsTable.id, Number(req.params.id))).limit(1);
  if (!session) {
    res.status(404).json({ error: "Thrift scan session not found" });
    return;
  }
  const items = await db.select().from(thriftScanItemsTable).where(eq(thriftScanItemsTable.thrift_scan_session_id, session.id));
  res.json({ session: serializeSession(session), items: items.map(serializeItem) });
});

export default router;
