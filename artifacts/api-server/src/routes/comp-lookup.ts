import { Router } from "express";
import { eq } from "drizzle-orm";
import { compLookupResultsTable, db, inventoryItemsTable } from "@workspace/db";
import {
  applyManualComps,
  lookupAmazonComps,
  lookupEbayCompsForModule,
  matchProductForComps,
  performCompLookup,
  type FullCompLookup,
  type ScannedItemForComps,
} from "../lib/comp-lookup";
import { toIsoDateTime } from "../lib/date";

const router = Router();

function asNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scannedItemFromBody(body: Record<string, unknown>): ScannedItemForComps {
  const source = (body.scannedItem ?? body) as Record<string, unknown>;
  return {
    retailer: source.retailer ? String(source.retailer) : "Costco",
    store_location: source.store_location ? String(source.store_location) : "Local Store",
    product_name: source.product_name ? String(source.product_name) : null,
    brand: source.brand ? String(source.brand) : null,
    category: source.category ? String(source.category) : null,
    subcategory: source.subcategory ? String(source.subcategory) : null,
    current_store_price: asNumber(source.current_store_price ?? source.price),
    regular_price: asNumber(source.regular_price),
    clearance_price: asNumber(source.clearance_price),
    percent_off: asNumber(source.percent_off),
    upc: source.upc ? String(source.upc) : null,
    gtin: source.gtin ? String(source.gtin) : null,
    sku: source.sku ? String(source.sku) : null,
    dpci: source.dpci ? String(source.dpci) : null,
    tcin: source.tcin ? String(source.tcin) : null,
    costco_item_number: source.costco_item_number ?? source.item_number ? String(source.costco_item_number ?? source.item_number) : null,
    model_number: source.model_number ? String(source.model_number) : null,
    asin: source.asin ? String(source.asin) : null,
    box_condition: source.box_condition ? String(source.box_condition) : null,
    sealed_status: source.sealed_status ? String(source.sealed_status) : null,
    photo_url: source.photo_url ? String(source.photo_url) : null,
    user_note: source.user_note ? String(source.user_note) : null,
  };
}

function serializeLookup(result: typeof compLookupResultsTable.$inferSelect) {
  return {
    ...result,
    created_at: toIsoDateTime(result.created_at),
  };
}

async function saveLookupRows(
  lookup: FullCompLookup,
  refs: { inventory_item_id?: number | null; quick_scan_result_id?: number | null },
) {
  const rows = [
    {
      source_type: "ebay",
      lookup_status: lookup.ebayData.status,
      match_method: lookup.matchResult.match_method,
      match_confidence: lookup.ebayData.match_confidence,
      matched_title: lookup.ebayData.matched_title,
      matched_identifier: lookup.matchResult.matched_identifier,
      active_low: lookup.ebayData.active_low,
      active_median: lookup.ebayData.active_median,
      active_high: lookup.ebayData.active_high,
      sold_low: lookup.ebayData.sold_low,
      sold_median: lookup.ebayData.sold_median,
      sold_high: lookup.ebayData.sold_high,
      shipping_median: lookup.ebayData.shipping_median,
      notes: lookup.ebayData.notes,
      raw_summary_json: lookup.ebayData,
    },
    {
      source_type: lookup.amazonData.data_source === "keepa" ? "keepa" : "amazon",
      lookup_status: lookup.amazonData.status,
      match_method: lookup.matchResult.match_method,
      match_confidence: lookup.amazonData.match_confidence,
      matched_title: lookup.amazonData.title,
      matched_identifier: lookup.amazonData.asin,
      current_price: lookup.amazonData.current_price,
      avg_30_day: lookup.amazonData.avg_30_day,
      avg_90_day: lookup.amazonData.avg_90_day,
      sales_rank: lookup.amazonData.sales_rank,
      notes: lookup.amazonData.notes,
      raw_summary_json: lookup.amazonData,
    },
  ];

  const inserted = await db
    .insert(compLookupResultsTable)
    .values(rows.map((row) => ({
      inventory_item_id: refs.inventory_item_id ?? null,
      quick_scan_result_id: refs.quick_scan_result_id ?? null,
      ...row,
    })))
    .returning();

  return inserted.map(serializeLookup);
}

async function updateInventoryCompFields(inventoryItemId: number, lookup: FullCompLookup) {
  const comp = lookup.compSummary;
  const profit = lookup.profitSummary;
  await db
    .update(inventoryItemsTable)
    .set({
      ebay_active_median: comp.ebay_active_median,
      ebay_sold_median: comp.ebay_sold_median,
      ebay_active_range: comp.ebay_active_range,
      ebay_sold_range: comp.ebay_sold_range,
      amazon_reference_price: comp.amazon_reference_price,
      amazon_30_day_average: comp.amazon_30_day_average,
      amazon_90_day_average: comp.amazon_90_day_average,
      comp_confidence: comp.comp_confidence,
      suggested_channel: comp.suggested_channel,
      expected_facebook_sale_price: comp.expected_facebook_sale_price,
      suggested_facebook_list_price: comp.suggested_facebook_list_price,
      negotiation_floor: profit.negotiation_floor,
      max_buy_price: profit.max_buy_price,
      facebook_list_price: comp.suggested_facebook_list_price,
      expected_sale_price: comp.expected_facebook_sale_price ? `$${comp.expected_facebook_sale_price}` : null,
      estimated_profit: profit.estimated_net_profit ? `$${profit.estimated_net_profit} est.` : null,
      recommendation: lookup.decision.recommendation === "RESEARCH_MORE" ? "MAYBE" : lookup.decision.recommendation,
      max_quantity: lookup.decision.max_quantity,
      risk_notes: [lookup.decision.risk_warning, ...comp.warning_notes].filter(Boolean).join(" "),
      updated_at: new Date(),
    })
    .where(eq(inventoryItemsTable.id, inventoryItemId));
}

router.post("/comp-lookup", async (req, res) => {
  try {
    const inventoryItemId = asNumber(req.body.inventory_item_id);
    const quickScanResultId = asNumber(req.body.quick_scan_result_id);
    const scannedItem = scannedItemFromBody(req.body);
    const lookup = await performCompLookup(scannedItem);
    const saved = await saveLookupRows(lookup, {
      inventory_item_id: inventoryItemId,
      quick_scan_result_id: quickScanResultId,
    });

    if (inventoryItemId) await updateInventoryCompFields(inventoryItemId, lookup);

    res.json({ ...lookup, lookup_results: saved });
  } catch (err) {
    req.log.error({ err }, "Comp lookup failed");
    res.status(500).json({ error: "Comp lookup failed. Try scanning the barcode or entering manual comps." });
  }
});

router.post("/lookup-ebay-comps", async (req, res) => {
  try {
    const scannedItem = scannedItemFromBody(req.body);
    const matchResult = matchProductForComps(scannedItem);
    const ebayData = await lookupEbayCompsForModule(scannedItem, matchResult);
    res.json({ matchResult, ebayData });
  } catch (err) {
    req.log.error({ err }, "eBay comp lookup failed");
    res.status(500).json({ error: "eBay comps unavailable. Try scanning the barcode or entering the model number." });
  }
});

router.post("/lookup-amazon-comps", async (req, res) => {
  try {
    const scannedItem = scannedItemFromBody(req.body);
    const matchResult = matchProductForComps(scannedItem);
    const amazonData = await lookupAmazonComps(scannedItem, matchResult);
    res.json({ matchResult, amazonData });
  } catch (err) {
    req.log.error({ err }, "Amazon comp lookup failed");
    res.status(500).json({ error: "Amazon data source not connected or unavailable. Decision is based on store price and eBay/local comps." });
  }
});

router.post("/manual-comp-entry", async (req, res) => {
  try {
    const inventoryItemId = asNumber(req.body.inventory_item_id);
    const scannedItem = scannedItemFromBody(req.body);
    const manual = {
      manual_ebay_sold_price: asNumber(req.body.manual_ebay_sold_price),
      manual_ebay_active_price: asNumber(req.body.manual_ebay_active_price),
      manual_amazon_price: asNumber(req.body.manual_amazon_price),
      manual_facebook_comp_price: asNumber(req.body.manual_facebook_comp_price),
      manual_notes: req.body.manual_notes ? String(req.body.manual_notes) : null,
    };
    const lookup = applyManualComps(scannedItem, manual);
    const [saved] = await db
      .insert(compLookupResultsTable)
      .values({
        inventory_item_id: inventoryItemId ?? null,
        source_type: "manual",
        lookup_status: "success",
        match_method: lookup.matchResult.match_method,
        match_confidence: lookup.matchResult.match_confidence,
        matched_title: lookup.scannedItem.product_name ?? null,
        matched_identifier: lookup.matchResult.matched_identifier,
        active_median: manual.manual_ebay_active_price,
        sold_median: manual.manual_ebay_sold_price,
        current_price: manual.manual_amazon_price,
        notes: manual.manual_notes,
        raw_summary_json: { manual, lookup },
      })
      .returning();

    if (inventoryItemId) await updateInventoryCompFields(inventoryItemId, lookup);

    res.json({ ...lookup, lookup_result: saved ? serializeLookup(saved) : null });
  } catch (err) {
    req.log.error({ err }, "Manual comp entry failed");
    res.status(500).json({ error: "Manual comp entry failed." });
  }
});

router.post("/recalculate-decision", async (req, res) => {
  try {
    const scannedItem = scannedItemFromBody(req.body);
    const manual = {
      manual_ebay_sold_price: asNumber(req.body.manual_ebay_sold_price),
      manual_ebay_active_price: asNumber(req.body.manual_ebay_active_price),
      manual_amazon_price: asNumber(req.body.manual_amazon_price),
      manual_facebook_comp_price: asNumber(req.body.manual_facebook_comp_price),
      manual_notes: req.body.manual_notes ? String(req.body.manual_notes) : null,
    };
    const lookup =
      manual.manual_ebay_sold_price ||
      manual.manual_ebay_active_price ||
      manual.manual_amazon_price ||
      manual.manual_facebook_comp_price
        ? applyManualComps(scannedItem, manual)
        : await performCompLookup(scannedItem);
    res.json(lookup);
  } catch (err) {
    req.log.error({ err }, "Recalculate decision failed");
    res.status(500).json({ error: "Recalculate decision failed." });
  }
});

router.get("/comp-details/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const item = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, itemId)).limit(1);
    const lookupRows = await db.select().from(compLookupResultsTable).where(eq(compLookupResultsTable.inventory_item_id, itemId));
    res.json({ item: item[0] ?? null, lookup_results: lookupRows.map(serializeLookup) });
  } catch (err) {
    req.log.error({ err }, "Comp details failed");
    res.status(500).json({ error: "Comp details failed." });
  }
});

export default router;
