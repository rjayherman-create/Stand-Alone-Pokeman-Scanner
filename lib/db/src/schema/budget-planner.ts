import { boolean, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

export const budgetPlansTable = pgTable("budget_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  target_budget_amount: real("target_budget_amount").notNull(),
  budget_period: text("budget_period").notNull(),
  recommended_spend: real("recommended_spend").notNull().default(0),
  cash_reserve: real("cash_reserve").notNull().default(0),
  estimated_revenue: real("estimated_revenue").notNull().default(0),
  estimated_profit_low: real("estimated_profit_low").notNull().default(0),
  estimated_profit_high: real("estimated_profit_high").notNull().default(0),
  risk_preference: text("risk_preference").notNull().default("Balanced"),
  storage_limit: text("storage_limit").notNull().default("Medium items okay"),
  selling_channels: text("selling_channels").notNull().default("Facebook Marketplace"),
  status: text("status").notNull().default("draft"),
  risk_summary: text("risk_summary"),
  action_plan: text("action_plan"),
  first_store_to_visit: text("first_store_to_visit"),
  second_store_optional: text("second_store_optional"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const budgetPlanItemsTable = pgTable("budget_plan_items", {
  id: serial("id").primaryKey(),
  budget_plan_id: integer("budget_plan_id").notNull(),
  inventory_item_id: integer("inventory_item_id").notNull(),
  priority_level: text("priority_level").notNull(),
  unit_cost: real("unit_cost").notNull(),
  suggested_quantity: integer("suggested_quantity").notNull().default(1),
  total_cost: real("total_cost").notNull(),
  expected_sale_price: real("expected_sale_price"),
  estimated_profit_low: real("estimated_profit_low").notNull().default(0),
  estimated_profit_high: real("estimated_profit_high").notNull().default(0),
  sell_speed: text("sell_speed").notNull().default("Unknown"),
  confidence_score: integer("confidence_score").notNull().default(0),
  risk_notes: text("risk_notes"),
  user_locked: boolean("user_locked").notNull().default(false),
  user_removed: boolean("user_removed").notNull().default(false),
  bought_status: boolean("bought_status").notNull().default(false),
  item_status: text("item_status").notNull().default("Suggested"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type BudgetPlan = typeof budgetPlansTable.$inferSelect;
export type BudgetPlanItem = typeof budgetPlanItemsTable.$inferSelect;
