import { Router } from "express";
import { eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  db,
  expenseTransactionsTable,
  inventoryItemsTable,
  inventoryLotsTable,
  ledgerEntriesTable,
  saleTransactionsTable,
} from "@workspace/db";
import { toIsoDateTime } from "../lib/date";

const router = Router();

type Lot = typeof inventoryLotsTable.$inferSelect;
type Sale = typeof saleTransactionsTable.$inferSelect;
type Expense = typeof expenseTransactionsTable.$inferSelect;
type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;

function numberValue(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown, fallback = 1) {
  return Math.max(0, Math.round(numberValue(value, fallback)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateDiffDays(start?: string | null, end?: string | null) {
  if (!start) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end ?? today()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function serializeRow<T extends { created_at: Date; updated_at: Date }>(row: T) {
  return {
    ...row,
    created_at: toIsoDateTime(row.created_at),
    updated_at: toIsoDateTime(row.updated_at),
  };
}

function calculateLedgerProfit(input: {
  quantity_sold: number;
  sold_price_per_unit: number;
  total_cost_basis: number;
  platform_fee: number;
  shipping_cost: number;
  packaging_cost: number;
  delivery_gas_cost: number;
  other_expense: number;
}) {
  const total_sold_price = input.quantity_sold * input.sold_price_per_unit;
  const saleExpenses = input.platform_fee + input.shipping_cost + input.packaging_cost + input.delivery_gas_cost + input.other_expense;
  const net_sale_proceeds = total_sold_price - saleExpenses;
  const gross_profit = total_sold_price - input.total_cost_basis;
  const net_profit = net_sale_proceeds - input.total_cost_basis;
  const profit_margin_percent = total_sold_price > 0 ? (net_profit / total_sold_price) * 100 : 0;
  const roi_percent = input.total_cost_basis > 0 ? (net_profit / input.total_cost_basis) * 100 : 0;
  return {
    total_sold_price: roundMoney(total_sold_price),
    net_sale_proceeds: roundMoney(net_sale_proceeds),
    gross_profit: roundMoney(gross_profit),
    net_profit: roundMoney(net_profit),
    profit_margin_percent: roundMoney(profit_margin_percent),
    roi_percent: roundMoney(roi_percent),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function loadAccountingData() {
  const [entries, lots, sales, expenses] = await Promise.all([
    db.select().from(ledgerEntriesTable).where(or(eq(ledgerEntriesTable.is_deleted, false), isNull(ledgerEntriesTable.is_deleted))),
    db.select().from(inventoryLotsTable).where(or(eq(inventoryLotsTable.is_deleted, false), isNull(inventoryLotsTable.is_deleted))),
    db.select().from(saleTransactionsTable).where(or(eq(saleTransactionsTable.is_deleted, false), isNull(saleTransactionsTable.is_deleted))),
    db.select().from(expenseTransactionsTable).where(or(eq(expenseTransactionsTable.is_deleted, false), isNull(expenseTransactionsTable.is_deleted))),
  ]);
  entries.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime() || b.id - a.id);
  lots.sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime() || b.id - a.id);
  sales.sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime() || b.id - a.id);
  expenses.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime() || b.id - a.id);
  return { entries, lots, sales, expenses };
}

function buildSummary(lots: Lot[], sales: Sale[], expenses: Expense[]) {
  const activeLots = lots.filter((lot) => lot.quantity_remaining > 0 && !["Returned", "Kept", "Donated"].includes(lot.status));
  const totalSpent = lots.reduce((sum, lot) => sum + lot.total_purchase_price, 0);
  const totalSales = sales.reduce((sum, sale) => sum + sale.total_sold_price, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalNetProfit = sales.reduce((sum, sale) => sum + sale.net_profit, 0) - totalExpenses;
  const currentCashTiedUp = activeLots.reduce((sum, lot) => sum + lot.average_unit_cost * lot.quantity_remaining, 0);
  const unsoldInventoryValue = activeLots.reduce((sum, lot) => sum + (lot.expected_sale_price ?? lot.listed_price ?? lot.average_unit_cost) * lot.quantity_remaining, 0);
  const soldQty = sales.reduce((sum, sale) => sum + sale.quantity_sold, 0);
  const avgRoi = sales.length ? sales.reduce((sum, sale) => sum + sale.roi_percent, 0) / sales.length : 0;
  const avgDaysToSell = sales.length ? sales.reduce((sum, sale) => {
    const lot = lots.find((candidate) => candidate.id === sale.inventory_lot_id);
    return sum + dateDiffDays(lot?.purchase_date, sale.sale_date);
  }, 0) / sales.length : 0;
  const mostProfitable = [...sales].sort((a, b) => b.net_profit - a.net_profit)[0];
  const biggestLoss = [...sales].sort((a, b) => a.net_profit - b.net_profit)[0];
  const storePerformance = groupPerformance(lots, sales, "store");
  const categoryPerformance = groupPerformance(lots, sales, "category");
  return {
    total_spent: roundMoney(totalSpent),
    total_sales: roundMoney(totalSales),
    total_expenses: roundMoney(totalExpenses),
    total_net_profit: roundMoney(totalNetProfit),
    current_cash_tied_up: roundMoney(currentCashTiedUp),
    unsold_inventory_value: roundMoney(unsoldInventoryValue),
    estimated_unrealized_profit: roundMoney(unsoldInventoryValue - currentCashTiedUp),
    unsold_items: activeLots.reduce((sum, lot) => sum + lot.quantity_remaining, 0),
    average_roi: roundMoney(avgRoi),
    average_days_to_sell: roundMoney(avgDaysToSell),
    average_days_held: activeLots.length ? roundMoney(activeLots.reduce((sum, lot) => sum + dateDiffDays(lot.purchase_date), 0) / activeLots.length) : 0,
    sold_quantity: soldQty,
    oldest_unsold_item: activeLots.sort((a, b) => dateDiffDays(b.purchase_date) - dateDiffDays(a.purchase_date))[0]?.product_name ?? null,
    best_store: storePerformance.sort((a, b) => b.net_profit - a.net_profit)[0]?.store ?? null,
    worst_store: storePerformance.sort((a, b) => a.net_profit - b.net_profit)[0]?.store ?? null,
    best_category: categoryPerformance.sort((a, b) => b.net_profit - a.net_profit)[0]?.category ?? null,
    worst_category: categoryPerformance.sort((a, b) => a.net_profit - b.net_profit)[0]?.category ?? null,
    most_profitable_item: mostProfitable ? lots.find((lot) => lot.id === mostProfitable.inventory_lot_id)?.product_name ?? `Sale #${mostProfitable.id}` : null,
    biggest_loss: biggestLoss && biggestLoss.net_profit < 0 ? lots.find((lot) => lot.id === biggestLoss.inventory_lot_id)?.product_name ?? `Sale #${biggestLoss.id}` : null,
    store_performance: storePerformance,
    category_performance: categoryPerformance,
  };
}

function groupPerformance(lots: Lot[], sales: Sale[], mode: "store" | "category") {
  const rows = new Map<string, {
    retailer: string;
    store: string;
    category: string;
    total_spent: number;
    total_sold: number;
    net_profit: number;
    items_bought: number;
    items_sold: number;
    items_unsold: number;
    days_total: number;
    day_count: number;
    categories: Map<string, number>;
  }>();
  for (const lot of lots) {
    const key = mode === "store" ? `${lot.retailer}||${lot.store_location}` : (lot.category ?? "Uncategorized");
    const row = rows.get(key) ?? {
      retailer: lot.retailer,
      store: lot.store_location,
      category: lot.category ?? "Uncategorized",
      total_spent: 0,
      total_sold: 0,
      net_profit: 0,
      items_bought: 0,
      items_sold: 0,
      items_unsold: 0,
      days_total: 0,
      day_count: 0,
      categories: new Map<string, number>(),
    };
    row.total_spent += lot.total_purchase_price;
    row.items_bought += lot.quantity_bought;
    row.items_sold += lot.quantity_sold;
    row.items_unsold += lot.quantity_remaining;
    row.days_total += dateDiffDays(lot.purchase_date);
    row.day_count += 1;
    row.categories.set(lot.category ?? "Uncategorized", (row.categories.get(lot.category ?? "Uncategorized") ?? 0) + lot.quantity_bought);
    rows.set(key, row);
  }
  for (const sale of sales) {
    const lot = lots.find((candidate) => candidate.id === sale.inventory_lot_id);
    if (!lot) continue;
    const key = mode === "store" ? `${lot.retailer}||${lot.store_location}` : (lot.category ?? "Uncategorized");
    const row = rows.get(key);
    if (!row) continue;
    row.total_sold += sale.total_sold_price;
    row.net_profit += sale.net_profit;
  }
  return Array.from(rows.values()).map((row) => {
    const roi = row.total_spent > 0 ? (row.net_profit / row.total_spent) * 100 : 0;
    const sellThrough = row.items_bought > 0 ? (row.items_sold / row.items_bought) * 100 : 0;
    return {
      retailer: row.retailer,
      store: row.store,
      category: row.category,
      total_spent: roundMoney(row.total_spent),
      total_sold: roundMoney(row.total_sold),
      net_profit: roundMoney(row.net_profit),
      roi_percent: roundMoney(roi),
      items_bought: row.items_bought,
      items_sold: row.items_sold,
      items_unsold: row.items_unsold,
      average_days_held: row.day_count ? roundMoney(row.days_total / row.day_count) : 0,
      best_category: Array.from(row.categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      sell_through_rate: roundMoney(sellThrough),
      recommendation: roi > 35 && sellThrough > 50 ? "Buy more" : roi < 0 ? "Avoid" : sellThrough < 30 ? "Too slow" : roi < 20 ? "Only buy deeper clearance" : "Keep testing",
      notes: "",
    };
  });
}

router.get("/accounting-ledger", async (req, res) => {
  try {
    const { entries, lots, sales, expenses } = await loadAccountingData();
    let filteredEntries = entries;
    const type = String(req.query.type ?? "all");
    const search = String(req.query.search ?? "").trim().toLowerCase();
    if (type !== "all") filteredEntries = filteredEntries.filter((entry) => entry.entry_type === type);
    if (search) {
      filteredEntries = filteredEntries.filter((entry) =>
        [entry.product_name, entry.description, entry.retailer, entry.store_location, entry.category, entry.notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }
    res.json({
      entries: filteredEntries.map(serializeRow),
      lots: lots.map((lot) => ({ ...serializeRow(lot), days_held: dateDiffDays(lot.purchase_date), cash_tied_up: roundMoney(lot.average_unit_cost * lot.quantity_remaining) })),
      sales: sales.map((sale) => ({ ...serializeRow(sale), days_held: dateDiffDays(lots.find((lot) => lot.id === sale.inventory_lot_id)?.purchase_date, sale.sale_date) })),
      expenses: expenses.map(serializeRow),
      summary: buildSummary(lots, sales, expenses),
    });
  } catch (err) {
    req.log.error({ err }, "Accounting ledger load failed");
    res.status(500).json({ error: "Accounting ledger load failed." });
  }
});

router.get("/accounting-ledger/summary", async (_req, res) => {
  const { lots, sales, expenses } = await loadAccountingData();
  res.json(buildSummary(lots, sales, expenses));
});

router.post("/accounting-ledger/purchase", async (req, res) => {
  try {
    const inventoryItemId = req.body.inventory_item_id ? Number(req.body.inventory_item_id) : null;
    const [item] = inventoryItemId ? await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, inventoryItemId)).limit(1) : [];
    const quantity = intValue(req.body.quantity_bought, 1) || 1;
    const unitPrice = numberValue(req.body.unit_purchase_price ?? req.body.purchase_price_paid ?? item?.current_store_price ?? item?.price);
    const salesTax = numberValue(req.body.sales_tax_total ?? req.body.sales_tax_paid);
    const totalPurchase = numberValue(req.body.total_purchase_price, unitPrice * quantity + salesTax);
    const averageUnitCost = totalPurchase / quantity;
    const [lot] = await db.insert(inventoryLotsTable).values({
      inventory_item_id: inventoryItemId,
      product_name: String(req.body.product_name ?? item?.product_name ?? "Untitled item"),
      retailer: String(req.body.retailer ?? item?.retailer ?? "Costco"),
      store_location: String(req.body.store_location ?? item?.store_location ?? "Unknown"),
      category: req.body.category ?? item?.category ?? null,
      purchase_date: String(req.body.purchase_date ?? today()),
      quantity_bought: quantity,
      quantity_sold: 0,
      quantity_remaining: quantity,
      unit_purchase_price: unitPrice,
      sales_tax_total: salesTax,
      total_purchase_price: totalPurchase,
      average_unit_cost: averageUnitCost,
      expected_sale_price: numberValue(req.body.expected_sale_price ?? item?.expected_facebook_sale_price, 0) || null,
      estimated_profit: numberValue(req.body.estimated_profit ?? item?.estimated_profit_per_unit, 0) || null,
      receipt_photo_url: req.body.receipt_photo_url ? String(req.body.receipt_photo_url) : null,
      payment_method: String(req.body.payment_method ?? "Cash"),
      status: "Bought",
      notes: req.body.notes ? String(req.body.notes) : null,
    }).returning();
    const [entry] = await db.insert(ledgerEntriesTable).values({
      entry_date: lot.purchase_date,
      entry_type: "purchase",
      inventory_item_id: lot.inventory_item_id,
      inventory_lot_id: lot.id,
      description: `Purchase: ${lot.product_name}`,
      retailer: lot.retailer,
      store_location: lot.store_location,
      product_name: lot.product_name,
      category: lot.category,
      quantity,
      money_out: totalPurchase,
      money_in: 0,
      net_amount: -totalPurchase,
      status: "Bought",
      notes: lot.notes,
    }).returning();
    if (inventoryItemId) {
      await db.update(inventoryItemsTable).set({ bought_status: true, updated_at: new Date() }).where(eq(inventoryItemsTable.id, inventoryItemId));
    }
    res.status(201).json({ lot: serializeRow(lot), entry: serializeRow(entry) });
  } catch (err) {
    req.log.error({ err }, "Record purchase failed");
    res.status(500).json({ error: "Record purchase failed." });
  }
});

router.post("/accounting-ledger/sale", async (req, res) => {
  try {
    const lotId = Number(req.body.inventory_lot_id);
    const [lot] = await db.select().from(inventoryLotsTable).where(eq(inventoryLotsTable.id, lotId)).limit(1);
    if (!lot) {
      res.status(404).json({ error: "Inventory lot not found" });
      return;
    }
    const quantity = Math.min(intValue(req.body.quantity_sold, 1) || 1, lot.quantity_remaining);
    if (quantity <= 0) {
      res.status(400).json({ error: "No remaining quantity to sell" });
      return;
    }
    const totalCostBasis = lot.average_unit_cost * quantity;
    const profit = calculateLedgerProfit({
      quantity_sold: quantity,
      sold_price_per_unit: numberValue(req.body.sold_price_per_unit),
      total_cost_basis: totalCostBasis,
      platform_fee: numberValue(req.body.platform_fee),
      shipping_cost: numberValue(req.body.shipping_cost),
      packaging_cost: numberValue(req.body.packaging_cost),
      delivery_gas_cost: numberValue(req.body.delivery_gas_cost),
      other_expense: numberValue(req.body.other_expense),
    });
    const [sale] = await db.insert(saleTransactionsTable).values({
      inventory_lot_id: lot.id,
      inventory_item_id: lot.inventory_item_id,
      sale_date: String(req.body.sale_date ?? today()),
      quantity_sold: quantity,
      sold_price_per_unit: numberValue(req.body.sold_price_per_unit),
      total_sold_price: profit.total_sold_price,
      sale_channel: String(req.body.sale_channel ?? "Facebook Marketplace"),
      platform_fee: numberValue(req.body.platform_fee),
      shipping_charged_to_buyer: numberValue(req.body.shipping_charged_to_buyer),
      shipping_cost: numberValue(req.body.shipping_cost),
      packaging_cost: numberValue(req.body.packaging_cost),
      delivery_gas_cost: numberValue(req.body.delivery_gas_cost),
      other_expense: numberValue(req.body.other_expense),
      net_sale_proceeds: profit.net_sale_proceeds,
      gross_profit: profit.gross_profit,
      net_profit: profit.net_profit,
      profit_margin_percent: profit.profit_margin_percent,
      roi_percent: profit.roi_percent,
      buyer_payment_method: String(req.body.buyer_payment_method ?? "Cash"),
      sale_screenshot_url: req.body.sale_screenshot_url ? String(req.body.sale_screenshot_url) : null,
      buyer_notes: req.body.buyer_notes ? String(req.body.buyer_notes) : null,
      notes: req.body.notes ? String(req.body.notes) : null,
    }).returning();
    const quantitySold = lot.quantity_sold + quantity;
    const quantityRemaining = Math.max(0, lot.quantity_remaining - quantity);
    const status = quantityRemaining === 0 ? (profit.net_profit < 0 ? "Lost Money" : "Sold") : "Partially Sold";
    const [updatedLot] = await db.update(inventoryLotsTable).set({
      quantity_sold: quantitySold,
      quantity_remaining: quantityRemaining,
      status,
      updated_at: new Date(),
    }).where(eq(inventoryLotsTable.id, lot.id)).returning();
    const [entry] = await db.insert(ledgerEntriesTable).values({
      entry_date: sale.sale_date,
      entry_type: "sale",
      inventory_item_id: sale.inventory_item_id,
      inventory_lot_id: lot.id,
      sale_transaction_id: sale.id,
      description: `Sale: ${lot.product_name}`,
      retailer: lot.retailer,
      store_location: lot.store_location,
      product_name: lot.product_name,
      category: lot.category,
      quantity,
      money_out: profit.total_sold_price - profit.net_sale_proceeds,
      money_in: profit.total_sold_price,
      net_amount: profit.net_profit,
      status,
      notes: sale.notes,
    }).returning();
    if (lot.inventory_item_id) {
      await db.update(inventoryItemsTable).set({
        listed_status: true,
        sold_status: quantityRemaining === 0,
        sold_price: sale.sold_price_per_unit,
        sold_date: sale.sale_date,
        sale_channel: sale.sale_channel,
        final_profit: sale.net_profit,
        updated_at: new Date(),
      }).where(eq(inventoryItemsTable.id, lot.inventory_item_id));
    }
    res.status(201).json({ sale: serializeRow(sale), lot: serializeRow(updatedLot), entry: serializeRow(entry) });
  } catch (err) {
    req.log.error({ err }, "Record sale failed");
    res.status(500).json({ error: "Record sale failed." });
  }
});

router.post("/accounting-ledger/expense", async (req, res) => {
  try {
    const amount = numberValue(req.body.amount);
    const [expense] = await db.insert(expenseTransactionsTable).values({
      expense_date: String(req.body.expense_date ?? today()),
      expense_type: String(req.body.expense_type ?? "Other"),
      amount,
      related_inventory_item_id: req.body.related_inventory_item_id ? Number(req.body.related_inventory_item_id) : null,
      related_inventory_lot_id: req.body.related_inventory_lot_id ? Number(req.body.related_inventory_lot_id) : null,
      related_store: req.body.related_store ? String(req.body.related_store) : null,
      notes: req.body.notes ? String(req.body.notes) : null,
      receipt_photo_url: req.body.receipt_photo_url ? String(req.body.receipt_photo_url) : null,
    }).returning();
    const [entry] = await db.insert(ledgerEntriesTable).values({
      entry_date: expense.expense_date,
      entry_type: "expense",
      inventory_item_id: expense.related_inventory_item_id,
      inventory_lot_id: expense.related_inventory_lot_id,
      expense_transaction_id: expense.id,
      description: `Expense: ${expense.expense_type}`,
      store_location: expense.related_store,
      quantity: 1,
      money_out: amount,
      money_in: 0,
      net_amount: -amount,
      status: "Expense",
      notes: expense.notes,
    }).returning();
    res.status(201).json({ expense: serializeRow(expense), entry: serializeRow(entry) });
  } catch (err) {
    req.log.error({ err }, "Record expense failed");
    res.status(500).json({ error: "Record expense failed." });
  }
});

router.post("/accounting-ledger/return", async (req, res) => {
  try {
    const lotId = Number(req.body.inventory_lot_id);
    const [lot] = await db.select().from(inventoryLotsTable).where(eq(inventoryLotsTable.id, lotId)).limit(1);
    if (!lot) {
      res.status(404).json({ error: "Inventory lot not found" });
      return;
    }
    const quantity = Math.min(intValue(req.body.quantity_returned, lot.quantity_remaining) || 1, lot.quantity_remaining);
    const returnAmount = numberValue(req.body.return_amount, lot.average_unit_cost * quantity);
    const lossAmount = Math.max(0, lot.average_unit_cost * quantity - returnAmount);
    const newRemaining = Math.max(0, lot.quantity_remaining - quantity);
    const [updatedLot] = await db.update(inventoryLotsTable).set({
      quantity_remaining: newRemaining,
      status: lossAmount > 0 ? "Lost Money" : newRemaining === 0 ? "Returned" : "Partially Returned",
      notes: req.body.notes ? String(req.body.notes) : lot.notes,
      updated_at: new Date(),
    }).where(eq(inventoryLotsTable.id, lotId)).returning();
    const [entry] = await db.insert(ledgerEntriesTable).values({
      entry_date: String(req.body.return_date ?? today()),
      entry_type: "return",
      inventory_item_id: lot.inventory_item_id,
      inventory_lot_id: lot.id,
      description: `Return: ${lot.product_name}`,
      retailer: lot.retailer,
      store_location: lot.store_location,
      product_name: lot.product_name,
      category: lot.category,
      quantity,
      money_out: lossAmount,
      money_in: returnAmount,
      net_amount: returnAmount - lot.average_unit_cost * quantity,
      status: updatedLot.status,
      notes: req.body.reason ? `${req.body.reason}: ${req.body.notes ?? ""}` : req.body.notes ? String(req.body.notes) : null,
    }).returning();
    res.status(201).json({ lot: serializeRow(updatedLot), entry: serializeRow(entry) });
  } catch (err) {
    req.log.error({ err }, "Record return failed");
    res.status(500).json({ error: "Record return failed." });
  }
});

router.patch("/accounting-ledger/lot/:id", async (req, res) => {
  const id = Number(req.params.id);
  const patch = { ...req.body, updated_at: new Date() };
  delete patch.id;
  delete patch.created_at;
  const [lot] = await db.update(inventoryLotsTable).set(patch).where(eq(inventoryLotsTable.id, id)).returning();
  if (!lot) {
    res.status(404).json({ error: "Inventory lot not found" });
    return;
  }
  res.json(serializeRow(lot));
});

router.patch("/accounting-ledger/sale/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [sale] = await db.select().from(saleTransactionsTable).where(eq(saleTransactionsTable.id, id)).limit(1);
  if (!sale) {
    res.status(404).json({ error: "Sale transaction not found" });
    return;
  }
  const [lot] = await db.select().from(inventoryLotsTable).where(eq(inventoryLotsTable.id, sale.inventory_lot_id)).limit(1);
  const quantity = intValue(req.body.quantity_sold ?? sale.quantity_sold, sale.quantity_sold);
  const totalCostBasis = (lot?.average_unit_cost ?? 0) * quantity;
  const profit = calculateLedgerProfit({
    quantity_sold: quantity,
    sold_price_per_unit: numberValue(req.body.sold_price_per_unit ?? sale.sold_price_per_unit),
    total_cost_basis: totalCostBasis,
    platform_fee: numberValue(req.body.platform_fee ?? sale.platform_fee),
    shipping_cost: numberValue(req.body.shipping_cost ?? sale.shipping_cost),
    packaging_cost: numberValue(req.body.packaging_cost ?? sale.packaging_cost),
    delivery_gas_cost: numberValue(req.body.delivery_gas_cost ?? sale.delivery_gas_cost),
    other_expense: numberValue(req.body.other_expense ?? sale.other_expense),
  });
  const [updated] = await db.update(saleTransactionsTable).set({ ...req.body, ...profit, updated_at: new Date() }).where(eq(saleTransactionsTable.id, id)).returning();
  res.json(serializeRow(updated));
});

router.delete("/accounting-ledger/entry/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [entry] = await db.update(ledgerEntriesTable).set({ is_deleted: true, updated_at: new Date() }).where(eq(ledgerEntriesTable.id, id)).returning();
  if (!entry) {
    res.status(404).json({ error: "Ledger entry not found" });
    return;
  }
  res.json(serializeRow(entry));
});

router.get("/accounting-ledger/export-csv", async (_req, res) => {
  const { entries } = await loadAccountingData();
  const columns = ["entry_date", "entry_type", "retailer", "store_location", "product_name", "category", "quantity", "money_out", "money_in", "net_amount", "status", "description", "notes", "created_at", "updated_at"];
  const csv = [columns.join(","), ...entries.map((entry) => columns.map((col) => csvEscape((entry as Record<string, unknown>)[col])).join(","))].join("\n");
  const stamp = today();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-ledger-${stamp}.csv"`);
  res.send(csv);
});

router.get("/accounting-ledger/export-excel", async (_req, res) => {
  const { entries } = await loadAccountingData();
  const columns = ["entry_date", "entry_type", "retailer", "store_location", "product_name", "category", "quantity", "money_out", "money_in", "net_amount", "status", "description", "notes", "created_at", "updated_at"];
  const rows = entries.map((entry) => `<tr>${columns.map((col) => `<td>${(entry as Record<string, unknown>)[col] ?? ""}</td>`).join("")}</tr>`).join("");
  const stamp = today();
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-ledger-${stamp}.xls"`);
  res.send(`<!doctype html><html><body><table><thead><tr>${columns.map((col) => `<th>${col}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
});

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

router.get("/accounting-ledger/export-pdf", async (_req, res) => {
  const { lots, sales, expenses } = await loadAccountingData();
  const summary = buildSummary(lots, sales, expenses);
  const lines = [
    "Retail Flip Profit Summary",
    `Total spent: $${summary.total_spent}`,
    `Total sales: $${summary.total_sales}`,
    `Total net profit: $${summary.total_net_profit}`,
    `Current cash tied up: $${summary.current_cash_tied_up}`,
    `Average ROI: ${summary.average_roi}%`,
    `Best category: ${summary.best_category ?? "-"}`,
    `Worst category: ${summary.worst_category ?? "-"}`,
    "This ledger is for resale tracking and organization. It is not tax, accounting, or legal advice.",
  ];
  const stream = ["BT", "/F1 16 Tf", "50 760 Td", ...lines.flatMap((line, index) => [index === 0 ? "" : "0 -18 Td", `(${pdfEscape(line)}) Tj`]).filter(Boolean), "ET"].join("\n");
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
  const stamp = today();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="retail-flip-profit-summary-${stamp}.pdf"`);
  res.send(Buffer.from(pdf, "utf8"));
});

export default router;
