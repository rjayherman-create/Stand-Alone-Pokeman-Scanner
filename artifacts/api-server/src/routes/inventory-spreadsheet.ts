import { Router } from "express";
import { eq, inArray, isNull, or } from "drizzle-orm";
import { actionHistoryTable, db, inventoryItemsTable } from "@workspace/db";
import { performCompLookup } from "../lib/comp-lookup";
import { toIsoDateTime } from "../lib/date";

const router = Router();

type InventoryRow = typeof inventoryItemsTable.$inferSelect;

function serializeItem(item: InventoryRow) {
  return {
    ...item,
    created_at: toIsoDateTime(item.created_at),
    updated_at: toIsoDateTime(item.updated_at),
    deleted_at: item.deleted_at ? toIsoDateTime(item.deleted_at) : null,
  };
}

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

function numberValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const EXPORT_COLUMNS = [
  "id", "created_at", "updated_at", "retailer", "store_location", "source_type", "hunt_mode",
  "product_name", "brand", "category", "subcategory", "item_number", "upc", "gtin", "sku", "dpci", "tcin",
  "costco_item_number", "model_number", "price", "current_store_price", "regular_price", "clearance_price",
  "percent_off", "markdown_code", "stock_status", "visible_quantity_estimate", "box_condition", "sealed_status",
  "recommendation", "flip_score", "confidence_score", "max_quantity", "suggested_quantity",
  "suggested_facebook_list_price", "expected_facebook_sale_price", "estimated_profit_per_unit",
  "profit_margin_percent", "negotiation_floor", "max_buy_price", "suggested_channel", "best_resale_channel",
  "risk_warning", "risk_notes", "one_sentence_reason", "ebay_active_range", "ebay_active_median",
  "ebay_sold_range", "ebay_sold_median", "ebay_active_count", "ebay_sold_count", "amazon_reference_price",
  "amazon_30_day_average", "amazon_90_day_average", "amazon_sales_rank", "comp_confidence", "match_method",
  "match_confidence", "added_to_watchlist", "listing_generated", "bought_status", "listed_status", "sold_status",
  "skipped_status", "research_status", "sold_price", "sold_date", "sale_channel", "final_profit", "user_notes",
  "photo_url", "screenshot_url", "cropped_product_image_url", "cropped_tag_image_url", "source_url",
];

async function logAction(inventoryItemId: number, actionType: string, oldValue: unknown, newValue: unknown, note?: string) {
  await db.insert(actionHistoryTable).values({
    inventory_item_id: inventoryItemId,
    action_type: actionType,
    old_value: oldValue,
    new_value: newValue,
    note: note ?? null,
  });
}

async function getRows(includeDeleted = false) {
  if (includeDeleted) return db.select().from(inventoryItemsTable);
  return db
    .select()
    .from(inventoryItemsTable)
    .where(or(eq(inventoryItemsTable.is_deleted, false), isNull(inventoryItemsTable.is_deleted)));
}

function applyQuery(rows: InventoryRow[], query: Record<string, string | undefined>) {
  let result = rows;
  const search = query.search?.trim().toLowerCase();
  if (search) {
    result = result.filter((item) =>
      [item.product_name, item.brand, item.category, item.retailer, item.store_location, item.item_number, item.upc, item.sku, item.user_notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }
  if (query.retailer && query.retailer !== "all") result = result.filter((i) => i.retailer === query.retailer);
  if (query.store && query.store !== "all") result = result.filter((i) => i.store_location === query.store);
  if (query.category && query.category !== "all") result = result.filter((i) => i.category === query.category);
  if (query.recommendation && query.recommendation !== "all") result = result.filter((i) => i.recommendation === query.recommendation);
  if (query.source_type && query.source_type !== "all") result = result.filter((i) => i.source_type === query.source_type);
  if (query.status && query.status !== "all") {
    result = result.filter((i) => {
      if (query.status === "Bought") return i.bought_status;
      if (query.status === "Listed") return i.listed_status;
      if (query.status === "Sold") return i.sold_status;
      if (query.status === "Skipped") return i.skipped_status;
      if (query.status === "Research More") return i.research_status === "Research More" || i.recommendation === "RESEARCH_MORE";
      if (query.status === "Watchlist") return i.added_to_watchlist;
      return true;
    });
  }
  if (query.profit && query.profit !== "all") {
    result = result.filter((i) => {
      const profit = i.estimated_profit_per_unit ?? parseFloat(String(i.estimated_profit ?? "").replace(/[^0-9.-]/g, "")) ?? 0;
      if (query.profit === "0-5") return profit >= 0 && profit <= 5;
      if (query.profit === "5-10") return profit > 5 && profit <= 10;
      if (query.profit === "10-25") return profit > 10 && profit <= 25;
      if (query.profit === "25+") return profit > 25;
      return true;
    });
  }
  if (query.date_range && query.date_range !== "all") {
    const now = new Date();
    const start = new Date(now);
    if (query.date_range === "today") start.setHours(0, 0, 0, 0);
    if (query.date_range === "week") start.setDate(now.getDate() - 7);
    if (query.date_range === "month") start.setMonth(now.getMonth() - 1);
    result = result.filter((i) => new Date(i.created_at).getTime() >= start.getTime());
  }

  const sort = query.sort ?? "date_desc";
  result = [...result].sort((a, b) => {
    const profitA = a.estimated_profit_per_unit ?? parseFloat(String(a.estimated_profit ?? "").replace(/[^0-9.-]/g, "")) ?? 0;
    const profitB = b.estimated_profit_per_unit ?? parseFloat(String(b.estimated_profit ?? "").replace(/[^0-9.-]/g, "")) ?? 0;
    if (sort === "date_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === "profit_desc") return profitB - profitA;
    if (sort === "profit_asc") return profitA - profitB;
    if (sort === "score_desc") return (b.flip_score ?? 0) - (a.flip_score ?? 0);
    if (sort === "score_asc") return (a.flip_score ?? 0) - (b.flip_score ?? 0);
    if (sort === "price_asc") return (a.price ?? a.current_store_price ?? 0) - (b.price ?? b.current_store_price ?? 0);
    if (sort === "price_desc") return (b.price ?? b.current_store_price ?? 0) - (a.price ?? a.current_store_price ?? 0);
    if (sort === "category") return String(a.category ?? "").localeCompare(String(b.category ?? ""));
    if (sort === "retailer") return String(a.retailer ?? "").localeCompare(String(b.retailer ?? ""));
    if (sort === "store") return String(a.store_location ?? "").localeCompare(String(b.store_location ?? ""));
    if (sort === "recommendation") return String(a.recommendation ?? "").localeCompare(String(b.recommendation ?? ""));
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return result;
}

router.get("/inventory-spreadsheet", async (req, res) => {
  try {
    const rows = applyQuery(await getRows(false), req.query as Record<string, string | undefined>);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 100)));
    const start = (page - 1) * pageSize;
    res.json({ rows: rows.slice(start, start + pageSize).map(serializeItem), total: rows.length, page, pageSize });
  } catch (err) {
    req.log.error({ err }, "Spreadsheet list failed");
    res.status(500).json({ error: "Spreadsheet list failed." });
  }
});

router.patch("/inventory-spreadsheet/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const before = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id)).limit(1);
    const patch = { ...req.body, updated_at: new Date() };
    delete patch.id;
    delete patch.created_at;
    const [item] = await db.update(inventoryItemsTable).set(patch).where(eq(inventoryItemsTable.id, id)).returning();
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    await logAction(id, "edited", before[0] ?? null, patch);
    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Spreadsheet update failed");
    res.status(500).json({ error: "Spreadsheet update failed." });
  }
});

router.delete("/inventory-spreadsheet/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [item] = await db
      .update(inventoryItemsTable)
      .set({ is_deleted: true, deleted_at: new Date(), deleted_by: "local-user", updated_at: new Date() })
      .where(eq(inventoryItemsTable.id, id))
      .returning();
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    await logAction(id, "deleted", null, { is_deleted: true });
    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Spreadsheet delete failed");
    res.status(500).json({ error: "Spreadsheet delete failed." });
  }
});

router.post("/inventory-spreadsheet/bulk-delete", async (req, res) => {
  try {
    const ids = parseIds(req.body.ids);
    if (ids.length === 0) {
      res.status(400).json({ error: "No ids provided" });
      return;
    }
    const rows = await db
      .update(inventoryItemsTable)
      .set({ is_deleted: true, deleted_at: new Date(), deleted_by: "local-user", updated_at: new Date() })
      .where(inArray(inventoryItemsTable.id, ids))
      .returning();
    await Promise.all(rows.map((row) => logAction(row.id, "deleted", null, { bulk: true })));
    res.json({ deleted: rows.map(serializeItem) });
  } catch (err) {
    req.log.error({ err }, "Bulk delete failed");
    res.status(500).json({ error: "Bulk delete failed." });
  }
});

router.post("/inventory-spreadsheet/restore/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [item] = await db
      .update(inventoryItemsTable)
      .set({ is_deleted: false, deleted_at: null, deleted_by: null, updated_at: new Date() })
      .where(eq(inventoryItemsTable.id, id))
      .returning();
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    await logAction(id, "restored", null, { is_deleted: false });
    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Restore failed");
    res.status(500).json({ error: "Restore failed." });
  }
});

router.delete("/inventory-spreadsheet/permanent/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Permanent delete failed");
    res.status(500).json({ error: "Permanent delete failed." });
  }
});

router.get("/inventory-trash", async (_req, res) => {
  try {
    const rows = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.is_deleted, true));
    rows.sort((a, b) => new Date(b.deleted_at ?? 0).getTime() - new Date(a.deleted_at ?? 0).getTime());
    res.json(rows.map(serializeItem));
  } catch (err) {
    res.status(500).json({ error: "Trash list failed." });
  }
});

router.post("/inventory-trash/empty", async (_req, res) => {
  try {
    await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.is_deleted, true));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Empty trash failed." });
  }
});

router.post("/inventory-spreadsheet/export-csv", async (req, res) => {
  const rows = applyQuery(await getRows(false), req.body.filters ?? {});
  const columns = Array.isArray(req.body.columns) && req.body.columns.length > 0 ? req.body.columns : EXPORT_COLUMNS;
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => `"${fieldValue(row as Record<string, unknown>, key).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-scanner-inventory-${stamp}.csv"`);
  res.send(csv);
});

router.post("/inventory-spreadsheet/export-excel", async (req, res) => {
  const rows = applyQuery(await getRows(false), req.body.filters ?? {});
  const columns = Array.isArray(req.body.columns) && req.body.columns.length > 0 ? req.body.columns : EXPORT_COLUMNS;
  const htmlRows = rows.map((row) => `<tr>${columns.map((key) => `<td>${fieldValue(row as Record<string, unknown>, key)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html><body><table><thead><tr>${columns.map((key) => `<th>${key}</th>`).join("")}</tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-scanner-inventory-${stamp}.xls"`);
  res.send(html);
});

router.post("/inventory-spreadsheet/recalculate/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id)).limit(1);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const lookup = await performCompLookup({
      retailer: item.retailer,
      store_location: item.store_location,
      product_name: item.product_name,
      brand: item.brand,
      category: item.category,
      subcategory: item.subcategory,
      current_store_price: item.current_store_price ?? item.price,
      regular_price: item.regular_price,
      clearance_price: item.clearance_price,
      percent_off: item.percent_off,
      upc: item.upc,
      gtin: item.gtin,
      sku: item.sku,
      dpci: item.dpci,
      tcin: item.tcin,
      costco_item_number: item.costco_item_number ?? item.item_number,
      model_number: item.model_number,
      box_condition: item.box_condition,
      sealed_status: item.sealed_status,
    });
    const shouldOverwrite = req.body.confirm_overwrite === true || !item.recommendation;
    const patch: Partial<InventoryRow> = {
      ebay_active_range: lookup.compSummary.ebay_active_range,
      ebay_active_median: lookup.compSummary.ebay_active_median,
      ebay_sold_range: lookup.compSummary.ebay_sold_range,
      ebay_sold_median: lookup.compSummary.ebay_sold_median,
      amazon_reference_price: lookup.compSummary.amazon_reference_price,
      amazon_30_day_average: lookup.compSummary.amazon_30_day_average,
      amazon_90_day_average: lookup.compSummary.amazon_90_day_average,
      comp_confidence: lookup.compSummary.comp_confidence,
      match_method: lookup.matchResult.match_method,
      match_confidence: lookup.matchResult.match_confidence,
      suggested_channel: lookup.compSummary.suggested_channel,
      suggested_facebook_list_price: lookup.compSummary.suggested_facebook_list_price,
      expected_facebook_sale_price: lookup.compSummary.expected_facebook_sale_price,
      estimated_profit_per_unit: lookup.profitSummary.estimated_net_profit,
      profit_margin_percent: lookup.profitSummary.profit_margin_percent,
      negotiation_floor: lookup.profitSummary.negotiation_floor,
      max_buy_price: lookup.profitSummary.max_buy_price,
      confidence_score: lookup.decision.confidence_score,
      risk_warning: lookup.decision.risk_warning,
      one_sentence_reason: lookup.decision.one_sentence_reason,
      raw_comp_summary_json: lookup,
      updated_at: new Date(),
    };
    if (shouldOverwrite) {
      patch.recommendation = lookup.decision.recommendation;
      patch.max_quantity = lookup.decision.max_quantity;
    }
    const [updated] = await db.update(inventoryItemsTable).set(patch).where(eq(inventoryItemsTable.id, id)).returning();
    await logAction(id, "recalculated", item, patch, shouldOverwrite ? "Recommendation updated" : "Recommendation preserved");
    res.json({ item: serializeItem(updated), lookup, recommendation_preserved: !shouldOverwrite && !!item.recommendation });
  } catch (err) {
    req.log.error({ err }, "Spreadsheet recalculate failed");
    res.status(500).json({ error: "Recalculate failed." });
  }
});

router.post("/inventory-spreadsheet/update-status/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body.status ?? "");
    const patch: Partial<InventoryRow> = { updated_at: new Date() };
    if (status === "Bought") patch.bought_status = true;
    if (status === "Listed") patch.listed_status = true;
    if (status === "Skipped") patch.skipped_status = true;
    if (status === "Research More") patch.research_status = "Research More";
    if (status === "Sold") {
      patch.sold_status = true;
      patch.sold_price = numberValue(req.body.sold_price);
      patch.sold_date = req.body.sold_date ? String(req.body.sold_date) : new Date().toISOString().slice(0, 10);
      patch.sale_channel = req.body.sale_channel ? String(req.body.sale_channel) : "Facebook Marketplace";
      patch.final_profit = numberValue(req.body.final_profit);
    }
    const [item] = await db.update(inventoryItemsTable).set(patch).where(eq(inventoryItemsTable.id, id)).returning();
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    await logAction(id, `marked_${status.toLowerCase().replace(/\s+/g, "_")}`, null, patch);
    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Status update failed");
    res.status(500).json({ error: "Status update failed." });
  }
});

export default router;
