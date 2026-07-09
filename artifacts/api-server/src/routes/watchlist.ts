import { Router } from "express";
import { db, watchlistItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { toIsoDateTime } from "../lib/date";

const router = Router();

router.get("/watchlist", async (req, res) => {
  try {
    const items = await db.select().from(watchlistItemsTable);
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(items.map(serializeItem));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/watchlist", async (req, res) => {
  try {
    const body = req.body;
    const [item] = await db
      .insert(watchlistItemsTable)
      .values({
        item_number: body.item_number,
        product_name: body.product_name,
        desired_buy_price: body.desired_buy_price ?? null,
        target_resale_price: body.target_resale_price ?? null,
        stores_to_watch: body.stores_to_watch ?? null,
        notes: body.notes ?? null,
        last_seen_price: null,
        last_seen_store: null,
        last_seen_at: null,
      })
      .returning();

    res.status(201).json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Failed to create watchlist item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/watchlist/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body;

    const [item] = await db
      .update(watchlistItemsTable)
      .set({ ...body, updated_at: new Date() })
      .where(eq(watchlistItemsTable.id, id))
      .returning();

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json(serializeItem(item));
  } catch (err) {
    req.log.error({ err }, "Failed to update watchlist item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/watchlist/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(watchlistItemsTable).where(eq(watchlistItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete watchlist item");
    res.status(500).json({ error: "Internal server error" });
  }
});

function serializeItem(item: typeof watchlistItemsTable.$inferSelect) {
  return {
    ...item,
    created_at: toIsoDateTime(item.created_at),
    updated_at: toIsoDateTime(item.updated_at),
  };
}

export default router;
