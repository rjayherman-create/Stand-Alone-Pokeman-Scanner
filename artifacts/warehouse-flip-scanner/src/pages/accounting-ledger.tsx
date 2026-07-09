import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Calculator, Download, PackageCheck, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Row = Record<string, any>;

const CHANNELS = ["Facebook Marketplace", "eBay", "Amazon", "Mercari", "Craigslist", "Other"];
const PAYMENT_METHODS = ["Cash", "Debit", "Credit card", "Gift card", "Store credit", "Venmo", "Zelle", "PayPal", "eBay payout", "Other"];
const EXPENSE_TYPES = ["Gas", "Parking", "Shipping supplies", "Storage", "Marketplace boost", "Returns", "Labels", "Tape / boxes", "Other"];
const RETURN_REASONS = ["Could not sell", "Damaged", "Bad comps", "Buyer issue", "Returned to store", "Kept for personal use", "Other"];

export default function AccountingLedgerPage() {
  const [location] = useLocation();
  const [data, setData] = useState({ entries: [] as Row[], lots: [] as Row[], sales: [] as Row[], expenses: [] as Row[], summary: {} as Row });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", type: "all" });
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<Row | null>(null);
  const inventoryItemId = useMemo(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    return new URLSearchParams(search).get("inventory_item_id");
  }, [location]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    const response = await fetch(`/api/accounting-ledger?${params.toString()}`);
    setData(await response.json());
    setLoading(false);
  }

  useEffect(() => { void load(); }, [filters]);

  useEffect(() => {
    if (!inventoryItemId) {
      setSelectedInventoryItem(null);
      return;
    }
    fetch(`/api/inventory/${inventoryItemId}`)
      .then((response) => response.ok ? response.json() : null)
      .then(setSelectedInventoryItem)
      .catch(() => setSelectedInventoryItem(null));
  }, [inventoryItemId]);

  const activeLots = useMemo(() => data.lots.filter((lot) => lot.quantity_remaining > 0 && !["Returned", "Kept", "Donated"].includes(lot.status)), [data.lots]);
  const lossSales = useMemo(() => data.sales.filter((sale) => sale.net_profit < 0), [data.sales]);
  const returnedLots = useMemo(() => data.lots.filter((lot) => ["Returned", "Lost Money", "Kept", "Donated"].includes(lot.status)), [data.lots]);

  function exportFile(kind: "csv" | "excel" | "pdf") {
    window.location.href = `/api/accounting-ledger/export-${kind}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">Accounting Ledger</h2>
          <p className="text-sm text-muted-foreground">Track purchase price, sale price, fees, profit, and cash tied up in inventory.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportFile("csv")}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={() => exportFile("excel")}><Download className="mr-2 h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => exportFile("pdf")}><Download className="mr-2 h-4 w-4" /> PDF Summary</Button>
        </div>
      </div>

      <SummaryCards summary={data.summary} loading={loading} />

      <Card>
        <CardContent className="p-3 grid md:grid-cols-[1fr_180px_120px] gap-2">
          <Input placeholder="Search product, store, category, notes..." value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Select value={filters.type} onValueChange={(type) => setFilters({ ...filters, type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "purchase", "sale", "fee", "expense", "return", "refund", "adjustment"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}>Refresh</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue={inventoryItemId ? "purchases" : "transactions"} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="transactions">All Transactions</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="active">Active Inventory</TabsTrigger>
          <TabsTrigger value="sold">Sold Items</TabsTrigger>
          <TabsTrigger value="summary">Profit Summary</TabsTrigger>
          <TabsTrigger value="stores">Store Performance</TabsTrigger>
          <TabsTrigger value="categories">Category Performance</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="returns">Returns / Losses</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions"><LedgerTable rows={data.entries} /></TabsContent>
        <TabsContent value="purchases"><PurchaseForm initialItem={selectedInventoryItem} onSaved={load} /><LotsTable rows={data.lots} /></TabsContent>
        <TabsContent value="active"><ActiveInventory lots={activeLots} onSaved={load} /></TabsContent>
        <TabsContent value="sold"><SoldItems sales={data.sales} lots={data.lots} /></TabsContent>
        <TabsContent value="summary"><ProfitSummary summary={data.summary} lots={activeLots} sales={data.sales} /></TabsContent>
        <TabsContent value="stores"><PerformanceTable rows={data.summary.store_performance ?? []} mode="store" /></TabsContent>
        <TabsContent value="categories"><PerformanceTable rows={data.summary.category_performance ?? []} mode="category" /></TabsContent>
        <TabsContent value="expenses"><ExpenseForm onSaved={load} /><ExpensesTable rows={data.expenses} /></TabsContent>
        <TabsContent value="returns"><ReturnForm lots={activeLots} onSaved={load} /><ReturnsLosses losses={lossSales} returns={returnedLots} /></TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">This ledger is for resale tracking and organization. It is not tax, accounting, or legal advice. Confirm tax reporting and deductions with a qualified professional.</p>
    </div>
  );
}

function SummaryCards({ summary, loading }: { summary: Row; loading: boolean }) {
  const cards = [
    ["Total spent", money(summary.total_spent), Receipt],
    ["Total sales", money(summary.total_sales), TrendingUp],
    ["Net profit", money(summary.total_net_profit), Calculator],
    ["Cash tied up", money(summary.current_cash_tied_up), ShoppingCart],
    ["Unsold value", money(summary.unsold_inventory_value), PackageCheck],
    ["Average ROI", pct(summary.average_roi), TrendingUp],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {cards.map(([label, value, Icon]) => {
        const IconComponent = Icon as typeof Receipt;
        return (
          <Card key={String(label)} className="shadow-sm">
            <CardContent className="p-3">
              <IconComponent className="h-4 w-4 text-primary mb-2" />
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-black">{loading ? "..." : value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PurchaseForm({ initialItem, onSaved }: { initialItem?: Row | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    inventory_item_id: "",
    product_name: "",
    retailer: "Costco",
    store_location: "",
    category: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    quantity_bought: "1",
    unit_purchase_price: "",
    sales_tax_total: "0",
    payment_method: "Cash",
    receipt_photo_url: "",
    notes: "",
  });

  useEffect(() => {
    if (!initialItem) return;
    setForm((prev) => ({
      ...prev,
      inventory_item_id: String(initialItem.id),
      product_name: initialItem.product_name ?? "",
      retailer: initialItem.retailer ?? "Costco",
      store_location: initialItem.store_location ?? "",
      category: initialItem.category ?? "",
      quantity_bought: parseSuggestedQuantity(initialItem.suggested_quantity ?? initialItem.max_quantity),
      unit_purchase_price: String(initialItem.current_store_price ?? initialItem.price ?? ""),
      notes: initialItem.one_sentence_reason ?? initialItem.risk_notes ?? prev.notes,
    }));
  }, [initialItem]);

  async function save(generateListing = false) {
    const response = await fetch("/api/accounting-ledger/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        inventory_item_id: form.inventory_item_id ? Number(form.inventory_item_id) : undefined,
        quantity_bought: Number(form.quantity_bought),
        unit_purchase_price: Number(form.unit_purchase_price),
        sales_tax_total: Number(form.sales_tax_total),
      }),
    });
    if (response.ok) {
      const data = await response.json();
      onSaved();
      if (generateListing && data.lot?.inventory_item_id) window.location.href = `/listing-generator/${data.lot.inventory_item_id}`;
    }
  }
  return (
    <FormCard title={initialItem ? `Record Purchase: ${initialItem.product_name}` : "Record Purchase"}>
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Product name" value={form.product_name} onChange={(v) => setForm({ ...form, product_name: v })} />
        <Field label="Retailer" value={form.retailer} onChange={(v) => setForm({ ...form, retailer: v })} />
        <Field label="Store location" value={form.store_location} onChange={(v) => setForm({ ...form, store_location: v })} />
        <Field label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
        <Field label="Purchase date" type="date" value={form.purchase_date} onChange={(v) => setForm({ ...form, purchase_date: v })} />
        <Field label="Quantity bought" type="number" value={form.quantity_bought} onChange={(v) => setForm({ ...form, quantity_bought: v })} />
        <Field label="Unit purchase price" type="number" value={form.unit_purchase_price} onChange={(v) => setForm({ ...form, unit_purchase_price: v })} />
        <Field label="Sales tax" type="number" value={form.sales_tax_total} onChange={(v) => setForm({ ...form, sales_tax_total: v })} />
        <Pick label="Payment method" value={form.payment_method} options={PAYMENT_METHODS} onChange={(v) => setForm({ ...form, payment_method: v })} />
        <Field label="Receipt photo URL" value={form.receipt_photo_url} onChange={(v) => setForm({ ...form, receipt_photo_url: v })} />
      </div>
      <Note value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      <div className="flex gap-2"><Button onClick={() => save(false)}>Save Purchase</Button><Button variant="outline" onClick={() => save(true)}>Save and Generate Listing</Button></div>
    </FormCard>
  );
}

function parseSuggestedQuantity(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match?.[0] ?? "1";
}

function SaleForm({ lot, onSaved }: { lot: Row; onSaved: () => void }) {
  const [form, setForm] = useState({
    inventory_lot_id: String(lot.id),
    sale_date: new Date().toISOString().slice(0, 10),
    quantity_sold: "1",
    sold_price_per_unit: String(lot.listed_price ?? lot.expected_sale_price ?? ""),
    sale_channel: "Facebook Marketplace",
    platform_fee: "0",
    shipping_charged_to_buyer: "0",
    shipping_cost: "0",
    packaging_cost: "0",
    delivery_gas_cost: "0",
    other_expense: "0",
    buyer_payment_method: "Cash",
    sale_screenshot_url: "",
    buyer_notes: "",
    notes: "",
  });
  async function save() {
    const response = await fetch("/api/accounting-ledger/sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => {
        const numeric = ["inventory_lot_id", "quantity_sold", "sold_price_per_unit", "platform_fee", "shipping_charged_to_buyer", "shipping_cost", "packaging_cost", "delivery_gas_cost", "other_expense"].includes(key);
        return [key, numeric ? Number(value) : value];
      }))),
    });
    if (response.ok) onSaved();
  }
  return (
    <FormCard title={`Record Sale: ${lot.product_name}`}>
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Sale date" type="date" value={form.sale_date} onChange={(v) => setForm({ ...form, sale_date: v })} />
        <Field label="Quantity sold" type="number" value={form.quantity_sold} onChange={(v) => setForm({ ...form, quantity_sold: v })} />
        <Field label="Sold price per unit" type="number" value={form.sold_price_per_unit} onChange={(v) => setForm({ ...form, sold_price_per_unit: v })} />
        <Pick label="Sale channel" value={form.sale_channel} options={CHANNELS} onChange={(v) => setForm({ ...form, sale_channel: v })} />
        <Field label="Platform fee" type="number" value={form.platform_fee} onChange={(v) => setForm({ ...form, platform_fee: v })} />
        <Field label="Shipping charged to buyer" type="number" value={form.shipping_charged_to_buyer} onChange={(v) => setForm({ ...form, shipping_charged_to_buyer: v })} />
        <Field label="Shipping cost paid" type="number" value={form.shipping_cost} onChange={(v) => setForm({ ...form, shipping_cost: v })} />
        <Field label="Packaging cost" type="number" value={form.packaging_cost} onChange={(v) => setForm({ ...form, packaging_cost: v })} />
        <Field label="Delivery/gas cost" type="number" value={form.delivery_gas_cost} onChange={(v) => setForm({ ...form, delivery_gas_cost: v })} />
        <Field label="Other expense" type="number" value={form.other_expense} onChange={(v) => setForm({ ...form, other_expense: v })} />
        <Pick label="Buyer payment" value={form.buyer_payment_method} options={PAYMENT_METHODS} onChange={(v) => setForm({ ...form, buyer_payment_method: v })} />
        <Field label="Sale screenshot URL" value={form.sale_screenshot_url} onChange={(v) => setForm({ ...form, sale_screenshot_url: v })} />
      </div>
      <Note label="Buyer notes" value={form.buyer_notes} onChange={(v) => setForm({ ...form, buyer_notes: v })} />
      <Note value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      <Button onClick={save}>Save and Mark Sold</Button>
    </FormCard>
  );
}

function ExpenseForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), expense_type: "Gas", amount: "", related_store: "", notes: "", receipt_photo_url: "" });
  async function save() {
    const response = await fetch("/api/accounting-ledger/expense", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
    if (response.ok) onSaved();
  }
  return (
    <FormCard title="Record Expense">
      <div className="grid md:grid-cols-5 gap-3">
        <Field label="Expense date" type="date" value={form.expense_date} onChange={(v) => setForm({ ...form, expense_date: v })} />
        <Pick label="Expense type" value={form.expense_type} options={EXPENSE_TYPES} onChange={(v) => setForm({ ...form, expense_type: v })} />
        <Field label="Amount" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <Field label="Related store" value={form.related_store} onChange={(v) => setForm({ ...form, related_store: v })} />
        <Field label="Receipt photo URL" value={form.receipt_photo_url} onChange={(v) => setForm({ ...form, receipt_photo_url: v })} />
      </div>
      <Note value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      <Button onClick={save}>Save Expense</Button>
    </FormCard>
  );
}

function ReturnForm({ lots, onSaved }: { lots: Row[]; onSaved: () => void }) {
  const [form, setForm] = useState({ inventory_lot_id: "", quantity_returned: "1", return_amount: "", reason: "Returned to store", notes: "" });
  async function save() {
    const response = await fetch("/api/accounting-ledger/return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, inventory_lot_id: Number(form.inventory_lot_id), quantity_returned: Number(form.quantity_returned), return_amount: Number(form.return_amount) }) });
    if (response.ok) onSaved();
  }
  return (
    <FormCard title="Record Return / Loss">
      <div className="grid md:grid-cols-4 gap-3">
        <Pick label="Inventory lot" value={form.inventory_lot_id} options={lots.map((lot) => ({ value: String(lot.id), label: `${lot.product_name} (${lot.quantity_remaining} left)` }))} onChange={(v) => setForm({ ...form, inventory_lot_id: v })} />
        <Field label="Quantity returned" type="number" value={form.quantity_returned} onChange={(v) => setForm({ ...form, quantity_returned: v })} />
        <Field label="Return amount" type="number" value={form.return_amount} onChange={(v) => setForm({ ...form, return_amount: v })} />
        <Pick label="Reason" value={form.reason} options={RETURN_REASONS} onChange={(v) => setForm({ ...form, reason: v })} />
      </div>
      <Note value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      <Button onClick={save} disabled={!form.inventory_lot_id}>Save Return</Button>
    </FormCard>
  );
}

function LedgerTable({ rows }: { rows: Row[] }) {
  return <BasicTable rows={rows} columns={["entry_date", "entry_type", "retailer", "store_location", "product_name", "category", "quantity", "money_out", "money_in", "net_amount", "status", "description", "notes"]} />;
}

function LotsTable({ rows }: { rows: Row[] }) {
  return <BasicTable rows={rows} columns={["purchase_date", "product_name", "retailer", "store_location", "category", "quantity_bought", "quantity_sold", "quantity_remaining", "unit_purchase_price", "sales_tax_total", "total_purchase_price", "average_unit_cost", "status", "payment_method", "notes"]} />;
}

function ActiveInventory({ lots, onSaved }: { lots: Row[]; onSaved: () => void }) {
  const [sellingLot, setSellingLot] = useState<Row | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-5 gap-3">
        <MetricCard label="Total cash tied up" value={money(lots.reduce((sum, lot) => sum + lot.cash_tied_up, 0))} />
        <MetricCard label="Unsold items" value={String(lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0))} />
        <MetricCard label="Average days held" value={String(avg(lots.map((lot) => lot.days_held)))} />
        <MetricCard label="Estimated resale value" value={money(lots.reduce((sum, lot) => sum + (lot.expected_sale_price ?? lot.average_unit_cost) * lot.quantity_remaining, 0))} />
        <MetricCard label="Oldest unsold item" value={lots.sort((a, b) => b.days_held - a.days_held)[0]?.product_name ?? "-"} />
      </div>
      {sellingLot && <SaleForm lot={sellingLot} onSaved={() => { setSellingLot(null); onSaved(); }} />}
      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted"><tr>{["Product", "Retailer", "Store", "Category", "Qty", "Unit cost", "Cash tied up", "Expected sale", "Est. profit", "Days held", "Status", "Action"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
            <tbody>{lots.map((lot) => <tr key={lot.id} className="border-t border-border"><td className="p-2 font-medium">{lot.product_name}</td><td className="p-2">{lot.retailer}</td><td className="p-2">{lot.store_location}</td><td className="p-2">{lot.category}</td><td className="p-2">{lot.quantity_remaining}</td><td className="p-2">{money(lot.average_unit_cost)}</td><td className="p-2">{money(lot.cash_tied_up)}</td><td className="p-2">{money(lot.expected_sale_price)}</td><td className="p-2">{money(lot.estimated_profit)}</td><td className="p-2">{lot.days_held}</td><td className="p-2">{lot.status}</td><td className="p-2"><Button size="sm" onClick={() => setSellingLot(lot)}>Mark sold</Button></td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SoldItems({ sales, lots }: { sales: Row[]; lots: Row[] }) {
  const rows = sales.map((sale) => ({ ...sale, product_name: lots.find((lot) => lot.id === sale.inventory_lot_id)?.product_name ?? `Lot #${sale.inventory_lot_id}` }));
  return <BasicTable rows={rows} columns={["product_name", "sale_date", "days_held", "quantity_sold", "sold_price_per_unit", "total_sold_price", "platform_fee", "shipping_cost", "packaging_cost", "delivery_gas_cost", "net_profit", "roi_percent", "sale_channel", "notes"]} />;
}

function ProfitSummary({ summary, lots, sales }: { summary: Row; lots: Row[]; sales: Row[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle className="text-base">Profit Summary</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[
        ["Total spent", money(summary.total_spent)], ["Total sales", money(summary.total_sales)], ["Total net profit", money(summary.total_net_profit)], ["Current cash tied up", money(summary.current_cash_tied_up)], ["Unsold value", money(summary.unsold_inventory_value)], ["Average ROI", pct(summary.average_roi)], ["Best category", summary.best_category ?? "-"], ["Worst category", summary.worst_category ?? "-"], ["Best store", summary.best_store ?? "-"], ["Worst store", summary.worst_store ?? "-"], ["Most profitable", summary.most_profitable_item ?? "-"], ["Biggest loss", summary.biggest_loss ?? "-"],
      ].map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">What This Answers</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Did I actually make money after what I paid and what I sold it for?</p><p>{lots.length} active lots are tying up {money(summary.current_cash_tied_up)}. {sales.length} sale transactions are included in real net profit.</p></CardContent></Card>
    </div>
  );
}

function PerformanceTable({ rows, mode }: { rows: Row[]; mode: "store" | "category" }) {
  return <BasicTable rows={rows} columns={mode === "store" ? ["retailer", "store", "total_spent", "total_sold", "net_profit", "roi_percent", "items_bought", "items_sold", "items_unsold", "average_days_held", "best_category", "notes"] : ["category", "total_spent", "total_sold", "net_profit", "roi_percent", "items_bought", "items_sold", "items_unsold", "average_days_held", "sell_through_rate", "recommendation"]} />;
}

function ExpensesTable({ rows }: { rows: Row[] }) {
  return <BasicTable rows={rows} columns={["expense_date", "expense_type", "amount", "related_store", "related_inventory_item_id", "related_inventory_lot_id", "notes", "receipt_photo_url"]} />;
}

function ReturnsLosses({ losses, returns }: { losses: Row[]; returns: Row[] }) {
  return (
    <div className="space-y-4">
      <BasicTable rows={returns} columns={["product_name", "purchase_date", "total_purchase_price", "quantity_remaining", "status", "notes"]} />
      <BasicTable rows={losses} columns={["sale_date", "inventory_lot_id", "total_sold_price", "net_profit", "roi_percent", "sale_channel", "notes"]} />
    </div>
  );
}

function BasicTable({ rows, columns }: { rows: Row[]; columns: string[] }) {
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted"><tr>{columns.map((col) => <th key={col} className="p-2 text-left whitespace-nowrap">{labelize(col)}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-border">{columns.map((col) => <td key={col} className="p-2 align-top">{formatValue(col, row[col])}</td>)}</tr>) : <tr><td className="p-4 text-muted-foreground" colSpan={columns.length}>No rows yet.</td></tr>}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="mb-4"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{children}</CardContent></Card>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Pick({ label, value, options, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>{options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>;
        })}</SelectContent>
      </Select>
    </div>
  );
}

function Note({ value, onChange, label = "Notes" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <div className="space-y-1"><Label>{label}</Label><Textarea value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-bold break-words">{value}</div></div>;
}

function money(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "$0.00";
}

function pct(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : "0.0%";
}

function avg(values: unknown[]) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length) : 0;
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(column: string, value: unknown) {
  if (value == null || value === "") return "-";
  if (["money_out", "money_in", "net_amount", "unit_purchase_price", "sales_tax_total", "total_purchase_price", "average_unit_cost", "cash_tied_up", "listed_price", "expected_sale_price", "estimated_profit", "sold_price_per_unit", "total_sold_price", "platform_fee", "shipping_cost", "packaging_cost", "delivery_gas_cost", "other_expense", "net_sale_proceeds", "gross_profit", "net_profit", "amount"].includes(column)) return money(value);
  if (column.includes("percent") || column === "roi_percent" || column === "sell_through_rate") return pct(value);
  return String(value);
}
