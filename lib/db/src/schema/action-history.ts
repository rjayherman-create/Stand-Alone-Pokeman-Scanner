import { jsonb, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const actionHistoryTable = pgTable("action_history", {
  id: serial("id").primaryKey(),
  inventory_item_id: integer("inventory_item_id").notNull(),
  action_type: text("action_type").notNull(),
  old_value: jsonb("old_value"),
  new_value: jsonb("new_value"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ActionHistory = typeof actionHistoryTable.$inferSelect;
