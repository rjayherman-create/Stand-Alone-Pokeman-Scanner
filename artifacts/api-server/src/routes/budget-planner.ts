import { Router } from "express";
import { eq, inArray, or, isNull, ne } from "drizzle-orm";
import { budgetPlanItemsTable, budgetPlansTable, db, inventoryItemsTable } from "@workspace/db";
import { buildBudgetPlan, normalizeBudgetSettings, type BudgetInventoryItem } from "../lib/budget-planner";
import { toIsoDateTime } from "../lib/date";

const router = Router();

function serializePlan(plan: typeof budgetPlansTable.$inferSelect, items: Array<typeof budgetPlanItemsTable.$inferSelect> = []) {
  return {
    ...plan,
    created_at: toIsoDateTime(plan.created_at),
    updated_at: toIsoDateTime(plan.updated_at),
    items: items.map((item) => ({
      ...item,
      created_at: toIsoDateTime(item.created_at),
      updated_at: toIsoDateTime(item.updated_at),
    })),
  };
}

async function availableInventory(): Promise<BudgetInventoryItem[]> {
  const rows = await db
    .select()
    .from(inventoryItemsTable)
    .where(or(eq(inventoryItemsTable.is_deleted, false), isNull(inventoryItemsTable.is_deleted)));
  return rows.map((row) => ({
    id: row.id,
    retailer: row.retailer,
    store_location: row.store_location,
    product_name: row.product_name,
    category: row.category,
    price: row.price,
    current_store_price: row.current_store_price,
    recommendation: row.recommendation,
    flip_score: row.flip_score,
    confidence_score: row.confidence_score,
    comp_confidence: row.comp_confidence,
    estimated_profit_per_unit: row.estimated_profit_per_unit ?? parseCurrencyValue(row.estimated_profit),
    expected_facebook_sale_price: row.expected_facebook_sale_price,
    profit_margin_percent: row.profit_margin_percent,
    max_quantity: row.max_quantity,
    risk_warning: row.risk_warning,
    risk_notes: row.risk_notes,
    box_condition: row.box_condition,
    stock_status: row.stock_status,
    created_at: row.created_at,
  }));
}

function parseCurrencyValue(value: unknown) {
  const parsed = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function recalcAndPersist(planId: number) {
  const [plan] = await db.select().from(budgetPlansTable).where(eq(budgetPlansTable.id, planId)).limit(1);
  if (!plan) return null;
  const settings = normalizeBudgetSettings({
    target_budget_amount: plan.target_budget_amount,
    budget_period: plan.budget_period,
    risk_preference: plan.risk_preference,
    storage_limit: plan.storage_limit,
    selling_channels: plan.selling_channels,
  });
  const built = buildBudgetPlan(await availableInventory(), settings);
  await db.delete(budgetPlanItemsTable).where(eq(budgetPlanItemsTable.budget_plan_id, planId));
  const inserted = built.selected_items.length
    ? await db.insert(budgetPlanItemsTable).values(built.selected_items.map((item) => ({
      budget_plan_id: planId,
      inventory_item_id: item.inventory_item_id,
      priority_level: item.priority_level,
      unit_cost: item.unit_cost,
      suggested_quantity: item.suggested_quantity,
      total_cost: item.total_cost,
      expected_sale_price: item.expected_sale_price,
      estimated_profit_low: item.estimated_profit_low,
      estimated_profit_high: item.estimated_profit_high,
      sell_speed: item.sell_speed,
      confidence_score: item.confidence_score,
      risk_notes: item.risk_notes,
    }))).returning()
    : [];
  const [updated] = await db.update(budgetPlansTable).set({
    recommended_spend: built.recommended_spend,
    cash_reserve: built.cash_reserve,
    estimated_revenue: built.estimated_revenue,
    estimated_profit_low: built.estimated_profit_low,
    estimated_profit_high: built.estimated_profit_high,
    risk_summary: built.risk_summary,
    action_plan: built.action_plan,
    first_store_to_visit: built.first_store_to_visit,
    second_store_optional: built.second_store_optional,
    updated_at: new Date(),
  }).where(eq(budgetPlansTable.id, planId)).returning();
  return { plan: serializePlan(updated, inserted), built };
}

router.get("/budget-planner", async (_req, res) => {
  const plans = await db.select().from(budgetPlansTable).where(ne(budgetPlansTable.status, "archived"));
  plans.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(plans.map((plan) => serializePlan(plan)));
});

router.post("/budget-planner/create", async (req, res) => {
  try {
    const settings = normalizeBudgetSettings(req.body);
    const built = buildBudgetPlan(await availableInventory(), settings);
    const [plan] = await db.insert(budgetPlansTable).values({
      name: String(req.body.name ?? `${settings.budget_period} Buy Plan`),
      target_budget_amount: settings.target_budget_amount,
      budget_period: settings.budget_period,
      recommended_spend: built.recommended_spend,
      cash_reserve: built.cash_reserve,
      estimated_revenue: built.estimated_revenue,
      estimated_profit_low: built.estimated_profit_low,
      estimated_profit_high: built.estimated_profit_high,
      risk_preference: settings.risk_preference,
      storage_limit: settings.storage_limit,
      selling_channels: settings.selling_channels,
      status: "draft",
      risk_summary: built.risk_summary,
      action_plan: built.action_plan,
      first_store_to_visit: built.first_store_to_visit,
      second_store_optional: built.second_store_optional,
    }).returning();

    const items = built.selected_items.length
      ? await db.insert(budgetPlanItemsTable).values(built.selected_items.map((item) => ({
        budget_plan_id: plan.id,
        inventory_item_id: item.inventory_item_id,
        priority_level: item.priority_level,
        unit_cost: item.unit_cost,
        suggested_quantity: item.suggested_quantity,
        total_cost: item.total_cost,
        expected_sale_price: item.expected_sale_price,
        estimated_profit_low: item.estimated_profit_low,
        estimated_profit_high: item.estimated_profit_high,
        sell_speed: item.sell_speed,
        confidence_score: item.confidence_score,
        risk_notes: item.risk_notes,
      }))).returning()
      : [];

    res.status(201).json({ plan: serializePlan(plan, items), built, settings });
  } catch (err) {
    req.log.error({ err }, "Create budget plan failed");
    res.status(500).json({ error: "Create budget plan failed." });
  }
});

router.get("/budget-planner/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [plan] = await db.select().from(budgetPlansTable).where(eq(budgetPlansTable.id, id)).limit(1);
  if (!plan) {
    res.status(404).json({ error: "Budget plan not found" });
    return;
  }
  const items = await db.select().from(budgetPlanItemsTable).where(eq(budgetPlanItemsTable.budget_plan_id, id));
  res.json(serializePlan(plan, items));
});

router.patch("/budget-planner/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [plan] = await db.update(budgetPlansTable).set({ ...req.body, updated_at: new Date() }).where(eq(budgetPlansTable.id, id)).returning();
  if (!plan) {
    res.status(404).json({ error: "Budget plan not found" });
    return;
  }
  const items = await db.select().from(budgetPlanItemsTable).where(eq(budgetPlanItemsTable.budget_plan_id, id));
  res.json(serializePlan(plan, items));
});

router.post("/budget-planner/:id/recalculate", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = await recalcAndPersist(id);
  if (!result) {
    res.status(404).json({ error: "Budget plan not found" });
    return;
  }
  res.json(result);
});

router.post("/budget-planner/:id/add-item", async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  const itemId = Number(req.body.inventory_item_id);
  const rows = await availableInventory();
  const row = rows.find((item) => item.id === itemId);
  if (!row) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  const unitCost = row.current_store_price ?? row.price ?? 0;
  const [item] = await db.insert(budgetPlanItemsTable).values({
    budget_plan_id: planId,
    inventory_item_id: itemId,
    priority_level: "Test Buy",
    unit_cost: unitCost,
    suggested_quantity: 1,
    total_cost: unitCost,
    expected_sale_price: row.expected_facebook_sale_price ?? unitCost * 1.4,
    estimated_profit_low: Math.max(0, (row.estimated_profit_per_unit ?? 0) * 0.8),
    estimated_profit_high: Math.max(0, (row.estimated_profit_per_unit ?? 0) * 1.2),
    sell_speed: "Unknown",
    confidence_score: row.confidence_score ?? row.flip_score ?? 50,
    risk_notes: row.risk_warning ?? row.risk_notes ?? null,
    user_locked: true,
  }).returning();
  res.status(201).json(item);
});

router.post("/budget-planner/:id/remove-item", async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  const itemId = Number(req.body.budget_plan_item_id);
  const [item] = await db.update(budgetPlanItemsTable).set({ user_removed: true, item_status: "Removed", updated_at: new Date() }).where(eq(budgetPlanItemsTable.id, itemId)).returning();
  if (!item || item.budget_plan_id !== planId) {
    res.status(404).json({ error: "Plan item not found" });
    return;
  }
  res.json(item);
});

router.post("/budget-planner/:id/mark-bought", async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  const ids = Array.isArray(req.body.budget_plan_item_ids) ? req.body.budget_plan_item_ids.map(Number) : [Number(req.body.budget_plan_item_id)];
  const items = await db.update(budgetPlanItemsTable).set({ bought_status: true, item_status: "Bought", updated_at: new Date() }).where(inArray(budgetPlanItemsTable.id, ids)).returning();
  const inventoryIds = items.filter((item) => item.budget_plan_id === planId).map((item) => item.inventory_item_id);
  if (inventoryIds.length) {
    await db.update(inventoryItemsTable).set({ bought_status: true, updated_at: new Date() }).where(inArray(inventoryItemsTable.id, inventoryIds));
  }
  res.json({ items });
});

router.delete("/budget-planner/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.update(budgetPlansTable).set({ status: "archived", updated_at: new Date() }).where(eq(budgetPlansTable.id, id));
  res.status(204).send();
});

function planExport(plan: ReturnType<typeof serializePlan>, format: "csv" | "xls" | "html") {
  const columns = ["priority_level", "inventory_item_id", "unit_cost", "suggested_quantity", "total_cost", "expected_sale_price", "estimated_profit_low", "estimated_profit_high", "sell_speed", "confidence_score", "risk_notes", "item_status"];
  if (format === "csv") {
    return [columns.join(","), ...plan.items.map((item) => columns.map((col) => `"${String((item as Record<string, unknown>)[col] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  }
  const rows = plan.items.map((item) => `<tr>${columns.map((col) => `<td>${(item as Record<string, unknown>)[col] ?? ""}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><body><h1>${plan.name}</h1><p>Budget plans are estimates for resale inventory decisions. Profit is not guaranteed.</p><table><thead><tr>${columns.map((col) => `<th>${col}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function planPdf(plan: ReturnType<typeof serializePlan>) {
  const lines = [
    plan.name,
    `Budget: $${plan.target_budget_amount} | Recommended spend: $${plan.recommended_spend} | Cash reserve: $${plan.cash_reserve}`,
    `Estimated profit: $${plan.estimated_profit_low} - $${plan.estimated_profit_high}`,
    "Budget plans are estimates for resale inventory decisions. Profit is not guaranteed.",
    "",
    "Priority | Item | Qty | Total | Sale | Profit | Speed",
    ...plan.items.slice(0, 32).map((item) => [
      item.priority_level,
      `#${item.inventory_item_id}`,
      item.suggested_quantity,
      `$${item.total_cost}`,
      `$${item.expected_sale_price ?? ""}`,
      `$${item.estimated_profit_low}-${item.estimated_profit_high}`,
      item.sell_speed,
    ].join(" | ")),
  ];
  const stream = [
    "BT",
    "/F1 16 Tf",
    "50 760 Td",
    `(${pdfEscape(lines[0])}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1).flatMap((line) => ["0 -16 Td", `(${pdfEscape(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

router.get("/budget-planner/:id/export/:format", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [planRow] = await db.select().from(budgetPlansTable).where(eq(budgetPlansTable.id, id)).limit(1);
  if (!planRow) {
    res.status(404).json({ error: "Budget plan not found" });
    return;
  }
  const items = await db.select().from(budgetPlanItemsTable).where(eq(budgetPlanItemsTable.budget_plan_id, id));
  const plan = serializePlan(planRow, items);
  const format = req.params.format === "excel" ? "xls" : req.params.format === "pdf" ? "pdf" : "csv";
  const stamp = new Date().toISOString().slice(0, 10);
  const body = format === "pdf" ? planPdf(plan) : planExport(plan, format);
  res.setHeader("Content-Type", format === "csv" ? "text/csv" : format === "xls" ? "application/vnd.ms-excel" : "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-budget-plan-${stamp}.${format}"`);
  res.send(body);
});

export default router;
