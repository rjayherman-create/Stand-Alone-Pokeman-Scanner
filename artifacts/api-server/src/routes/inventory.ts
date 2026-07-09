import { Router } from "express";
import { db, inventoryItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { toIsoDateTime } from "../lib/date";

const router = Router();

router.get("/inventory/best-buys", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(inventoryItemsTable)
      .orderBy(inventoryItemsTable.flip_score);

    const buys = items
      .filter((i) => i.recommendation === "BUY")
      .sort((a, b) => (b.flip_score ?? 0) - (a.flip_score ?? 0))
      .slice(0, 10);

    res.json(buys.map(serializeItem));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch best buys");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/inventory", async (req, res) => {
  try {
    const { retailer, source_type, store_location, recommendation } = req.query as Record<string, string>;
    let items = await db.select().from(inventoryItemsTable);

    if (retailer) items = items.filter((i) => i.retailer === retailer);
    if (source_type) items = items.filter((i) => i.source_type === source_type);
    if (store_location) items = items.filter((i) => i.store_location === store_location);
    if (recommendation) items = items.filter((i) => i.recommendation === recommendation);

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(items.map(serializeItem));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/inventory", async (req, res) => {
  try {
    const body = req.body;
    const [item] = await db
      .insert(inventoryItemsTable)
      .values({
        retailer: body.retailer ?? "Costco",
        source_type: body.source_type,
        store_location: body.store_location,
        product_name: body.product_name,
        stock_status: body.stock_status ?? "Unknown",
        search_term: body.search_term ?? null,
        viewed_at: body.viewed_at ?? null,
        scan_time: body.scan_time ?? null,
        brand: body.brand ?? null,
        item_number: body.item_number ?? null,
        upc: body.upc ?? null,
        sku: body.sku ?? null,
        dpci: body.dpci ?? null,
        tcin: body.tcin ?? null,
        aisle: body.aisle ?? null,
        price: body.price ?? null,
        regular_price: body.regular_price ?? null,
        clearance_price: body.clearance_price ?? null,
        percent_off: body.percent_off ?? null,
        markdown_code: body.markdown_code ?? null,
        visible_brand: body.visible_brand ?? null,
        category: body.category ?? null,
        box_condition: body.box_condition ?? null,
        normal_retail_estimate: body.normal_retail_estimate ?? null,
        facebook_list_price: body.facebook_list_price ?? null,
        expected_sale_price: body.expected_sale_price ?? null,
        estimated_profit: body.estimated_profit ?? null,
        flip_score: body.flip_score ?? null,
        recommendation: body.recommendation ?? null,
        max_quantity: body.max_quantity ?? null,
        risk_notes: body.risk_notes ?? null,
        listing_title: body.listing_title ?? null,
        listing_description: body.listing_description ?? null,
        photo_url: body.photo_url ?? null,
        screenshot_url: body.screenshot_url ?? null,
        source_url: body.source_url ?? null,
        public_check_status: body.public_check_status ?? null,
        notes_from_image: body.notes_from_image ?? null,
      })
      .returning();

    res.status(201).json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Failed to create inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/inventory/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body;

    const [item] = await db
      .update(inventoryItemsTable)
      .set({
        ...body,
        updated_at: new Date(),
      })
      .where(eq(inventoryItemsTable.id, id))
      .returning();

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Failed to update inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/inventory/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

function serializeItem(item: typeof inventoryItemsTable.$inferSelect) {
  return {
    ...item,
    created_at: toIsoDateTime(item.created_at),
    updated_at: toIsoDateTime(item.updated_at),
  };
}

export { logger };
export default router;
