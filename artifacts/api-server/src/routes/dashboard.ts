import { Router } from "express";
import { db, inventoryItemsTable } from "@workspace/db";
import { toIsoDateTime } from "../lib/date";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  try {
    const items = await db.select().from(inventoryItemsTable);

    const buy_count = items.filter((i) => i.recommendation === "BUY").length;
    const maybe_count = items.filter((i) => i.recommendation === "MAYBE").length;
    const skip_count = items.filter((i) => i.recommendation === "SKIP").length;
    const photo_scan_count = items.filter((i) => i.source_type === "photo_scan").length;
    const online_check_count = items.filter((i) => i.source_type === "public_web_check").length;
    const screenshot_count = items.filter((i) => i.source_type === "screenshot_upload").length;
    const manual_count = items.filter((i) => i.source_type === "manual").length;

    // Find highest profit item (by flip_score as proxy)
    const buyItems = items
      .filter((i) => i.recommendation === "BUY")
      .sort((a, b) => (b.flip_score ?? 0) - (a.flip_score ?? 0));
    const highest_profit_item = buyItems[0] ?? null;

    // Find cheapest store among BUY items
    const storePrices: Record<string, number[]> = {};
    for (const item of buyItems) {
      if (item.price != null) {
        if (!storePrices[item.store_location]) storePrices[item.store_location] = [];
        storePrices[item.store_location].push(item.price);
      }
    }
    let cheapest_store: string | null = null;
    let lowestAvg = Infinity;
    for (const [store, prices] of Object.entries(storePrices)) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg < lowestAvg) {
        lowestAvg = avg;
        cheapest_store = store;
      }
    }

    const recent_items = [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    res.json({
      total_items: items.length,
      buy_count,
      maybe_count,
      skip_count,
      photo_scan_count,
      online_check_count,
      screenshot_count,
      manual_count,
      highest_profit_item: highest_profit_item
        ? {
            ...highest_profit_item,
            created_at: toIsoDateTime(highest_profit_item.created_at),
            updated_at: toIsoDateTime(highest_profit_item.updated_at),
          }
        : null,
      cheapest_store,
      recent_items: recent_items.map((i) => ({
        ...i,
        created_at: toIsoDateTime(i.created_at),
        updated_at: toIsoDateTime(i.updated_at),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard summary failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/store-comparison", async (req, res) => {
  try {
    const items = await db.select().from(inventoryItemsTable);

    const byItemNumber: Record<string, typeof items> = {};
    for (const item of items) {
      const key = item.item_number ?? item.product_name;
      if (!byItemNumber[key]) byItemNumber[key] = [];
      byItemNumber[key].push(item);
    }

    const stores = ["Lawrence", "Oceanside", "Westbury"];

    const rows = Object.entries(byItemNumber)
      .filter(([, group]) => group.length > 0)
      .map(([key, group]) => {
        const first = group[0];
        const row: Record<string, unknown> = {
          item_number: first.item_number ?? key,
          product_name: first.product_name,
          flip_score: first.flip_score,
          estimated_profit: first.estimated_profit,
        };

        let cheapestStore: string | null = null;
        let lowestPrice = Infinity;

        for (const store of stores) {
          const storeKey = store.toLowerCase();
          const match = group.find((i) => {
            const location = i.store_location;
            if (!location) return false;
            return location.toLowerCase() === storeKey;
          });
          row[`${storeKey}_price`] = match?.price ?? null;
          row[`${storeKey}_stock`] = match?.stock_status ?? null;

          if (match?.price != null && match.stock_status !== "Out of Stock" && match.price < lowestPrice) {
            lowestPrice = match.price;
            cheapestStore = store;
          }
        }

        row.cheapest_store = cheapestStore;
        row.best_action = cheapestStore
          ? `Go to ${cheapestStore} first — lowest price at $${lowestPrice.toFixed(2)}`
          : "Check all stores for current pricing";

        return row;
      });

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Store comparison failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
