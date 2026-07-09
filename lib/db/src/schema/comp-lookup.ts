import { jsonb, pgTable, real, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const compLookupResultsTable = pgTable("comp_lookup_results", {
  id: serial("id").primaryKey(),
  inventory_item_id: integer("inventory_item_id"),
  quick_scan_result_id: integer("quick_scan_result_id"),
  source_type: text("source_type").notNull(),
  lookup_status: text("lookup_status").notNull(),
  match_method: text("match_method"),
  match_confidence: integer("match_confidence"),
  matched_title: text("matched_title"),
  matched_identifier: text("matched_identifier"),
  active_low: real("active_low"),
  active_median: real("active_median"),
  active_high: real("active_high"),
  sold_low: real("sold_low"),
  sold_median: real("sold_median"),
  sold_high: real("sold_high"),
  current_price: real("current_price"),
  avg_30_day: real("avg_30_day"),
  avg_90_day: real("avg_90_day"),
  sales_rank: integer("sales_rank"),
  shipping_median: real("shipping_median"),
  notes: text("notes"),
  raw_summary_json: jsonb("raw_summary_json"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type CompLookupResult = typeof compLookupResultsTable.$inferSelect;
