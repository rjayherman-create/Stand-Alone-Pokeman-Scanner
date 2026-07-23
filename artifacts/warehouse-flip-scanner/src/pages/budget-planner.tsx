import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Calculator, Download, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RETAILERS = ["Costco", "Walmart", "Target", "BJ's", "Sam's Club", "Home Depot", "Lowe's", "Other"];
const CATEGORIES = ["LEGO", "Toys", "Tools", "Small Appliances", "Electronics", "Seasonal", "Sporting Goods", "Golf", "Baby Gear", "Home Goods", "Furniture", "Outdoor / Patio", "Video Games", "Collectibles", "Automotive", "Other"];

interface PlanItem {
  id: number;
  inventory_item_id: number;
  priority_level: string;
  unit_cost: number;
  suggested_quantity: number;
  total_cost: number;
  expected_sale_price?: number | null;
  estimated_profit_low: number;
  estimated_profit_high: number;
  sell_speed: string;
  confidence_score: number;
  risk_notes?: string | null;
  bought_status: boolean;
  item_status: string;
  user_removed?: boolean;
}

interface Plan {
  id: number;
  name: string;
  target_budget_amount: number;
  budget_period: string;
  recommended_spend: number;
  cash_reserve: number;
  estimated_revenue: number;
  estimated_profit_low: number;
  estimated_profit_high: number;
  risk_preference: string;
  storage_limit: string;
  selling_channels: string;
  status: string;
  risk_summary?: string | null;
  action_plan?: string | null;
  first_store_to_visit?: string | null;
  second_store_optional?: string | null;
  items: PlanItem[];
}

export default function BudgetPlanner() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    target_budget_amount: "300",
    budget_period: "This Week",
    risk_preference: "Balanced",
    max_cash_tied_up_days: "14",
    storage_limit: "Medium items okay",
    selling_channels: "Facebook Marketplace",
    minimum_profit_per_item: "7",
    minimum_profit_margin_percent: "25",
    keep_cash_reserve_percent: "20",
    preferred_retailers: ["Costco"],
    preferred_categories: ["LEGO"],
  });

  async function loadPlans() {
    const response = await fetch("/api/budget-planner");
    setPlans(await response.json());
  }

  useEffect(() => { void loadPlans(); }, []);

  const budgetUsedPct = useMemo(() => {
    if (!current?.target_budget_amount) return 0;
    return Math.round((current.recommended_spend / current.target_budget_amount) * 100);
  }, [current]);

  function toggleList(key: "preferred_retailers" | "preferred_categories", value: string) {
    setSettings((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  async function createPlan() {
    setLoading(true);
    const response = await fetch("/api/budget-planner/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        target_budget_amount: Number(settings.target_budget_amount),
        max_cash_tied_up_days: Number(settings.max_cash_tied_up_days),
        minimum_profit_per_item: Number(settings.minimum_profit_per_item),
        minimum_profit_margin_percent: Number(settings.minimum_profit_margin_percent),
        keep_cash_reserve_percent: Number(settings.keep_cash_reserve_percent),
      }),
    });
    const data = await response.json();
    setCurrent(data.plan);
    setLoading(false);
    await loadPlans();
  }

  async function loadPlan(id: number) {
    const response = await fetch(`/api/budget-planner/${id}`);
    setCurrent(await response.json());
  }

  async function recalc() {
    if (!current) return;
    const response = await fetch(`/api/budget-planner/${current.id}/recalculate`, { method: "POST" });
    const data = await response.json();
    setCurrent(data.plan);
    await loadPlans();
  }

  async function markBought(item: PlanItem) {
    if (!current) return;
    await fetch(`/api/budget-planner/${current.id}/mark-bought`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_plan_item_id: item.id }),
    });
    await loadPlan(current.id);
  }

  async function removeItem(item: PlanItem) {
    if (!current) return;
    await fetch(`/api/budget-planner/${current.id}/remove-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_plan_item_id: item.id }),
    });
    await loadPlan(current.id);
  }

  function exportPlan(format: "csv" | "excel" | "pdf") {
    if (!current) return;
    window.location.href = `/api/budget-planner/${current.id}/export/${format}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">Flip Budget Planner</h2>
          <p className="text-sm text-muted-foreground">How should I spend my flip budget without tying up too much cash in bad inventory?</p>
        </div>
        <div className="flex gap-2">
          <Select onValueChange={(id) => loadPlan(Number(id))}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Saved plans" /></SelectTrigger>
            <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Buying Budget Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Buying budget" value={settings.target_budget_amount} onChange={(v) => setSettings({ ...settings, target_budget_amount: v })} />
            <Pick label="Period" value={settings.budget_period} onChange={(v) => setSettings({ ...settings, budget_period: v })} options={["Today", "This Week", "Next 2 Weeks", "This Month"]} />
            <Pick label="Risk" value={settings.risk_preference} onChange={(v) => setSettings({ ...settings, risk_preference: v })} options={["Conservative", "Balanced", "Aggressive"]} />
            <Pick label="Cash tied up" value={settings.max_cash_tied_up_days} onChange={(v) => setSettings({ ...settings, max_cash_tied_up_days: v })} options={[["3", "3 days"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"]]} />
            <Pick label="Storage" value={settings.storage_limit} onChange={(v) => setSettings({ ...settings, storage_limit: v })} options={["Small items only", "Medium items okay", "Large items okay"]} />
            <Pick label="Channel" value={settings.selling_channels} onChange={(v) => setSettings({ ...settings, selling_channels: v })} options={["Facebook Marketplace", "eBay", "Both"]} />
            <Field label="Min profit/item" value={settings.minimum_profit_per_item} onChange={(v) => setSettings({ ...settings, minimum_profit_per_item: v })} />
            <Field label="Reserve %" value={settings.keep_cash_reserve_percent} onChange={(v) => setSettings({ ...settings, keep_cash_reserve_percent: v })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <ChipGroup title="Preferred retailers" values={RETAILERS} selected={settings.preferred_retailers} onToggle={(v) => toggleList("preferred_retailers", v)} />
            <ChipGroup title="Preferred categories" values={CATEGORIES} selected={settings.preferred_categories} onToggle={(v) => toggleList("preferred_categories", v)} />
          </div>
          <Button className="w-full font-semibold" onClick={createPlan} disabled={loading}>
            {loading ? "Planning..." : "Plan My Buys"}
          </Button>
          <p className="text-xs text-muted-foreground">Budget plans are estimates for resale inventory decisions. Profit is not guaranteed. Prices, buyer demand, fees, returns, and sell-through time can change.</p>
        </CardContent>
      </Card>

      {current && (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">Spend ${current.recommended_spend.toFixed(2)} of your ${current.target_budget_amount.toFixed(2)} budget and keep ${current.cash_reserve.toFixed(2)} cash.</h3>
                  <p className="text-sm text-muted-foreground mt-1">{current.action_plan}</p>
                </div>
                <div className="text-sm font-semibold rounded-lg bg-background border border-border px-3 py-2">{budgetUsedPct}% used</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <Metric label="Items to buy" value={String(current.items.filter((i) => !i.user_removed).length)} />
                <Metric label="Revenue" value={`$${current.estimated_revenue.toFixed(2)}`} />
                <Metric label="Profit low" value={`$${current.estimated_profit_low.toFixed(2)}`} />
                <Metric label="Profit high" value={`$${current.estimated_profit_high.toFixed(2)}`} />
                <Metric label="First store" value={current.first_store_to_visit ?? "-"} />
                <Metric label="Risk" value={current.risk_preference} />
              </div>
              <p className="text-xs text-muted-foreground">Budget plans are estimates for resale inventory decisions. Profit is not guaranteed. Prices, buyer demand, fees, returns, and sell-through time can change.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={recalc}><RefreshCw className="mr-2 h-4 w-4" /> Recalculate</Button>
                <Button variant="outline" onClick={() => exportPlan("csv")}><Download className="mr-2 h-4 w-4" /> CSV</Button>
                <Button variant="outline" onClick={() => exportPlan("excel")}><Download className="mr-2 h-4 w-4" /> Excel</Button>
                <Button variant="outline" onClick={() => exportPlan("pdf")}><Download className="mr-2 h-4 w-4" /> PDF Plan</Button>
              </div>
            </CardContent>
          </Card>

          <section className="grid lg:grid-cols-[1fr_320px] gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Suggested Buy Plan</CardTitle></CardHeader>
              <CardContent className="overflow-auto p-0">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted">
                    <tr>{["Priority", "Product", "Unit Cost", "Qty", "Total", "Expected Sale", "Profit", "Sell Speed", "Confidence", "Risk", "Action"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.items.filter((item) => !item.user_removed).map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="p-2 font-semibold">{item.priority_level}</td>
                        <td className="p-2">Item #{item.inventory_item_id}</td>
                        <td className="p-2">${item.unit_cost.toFixed(2)}</td>
                        <td className="p-2">
                          <Input className="w-20 h-8" type="number" min="1" defaultValue={item.suggested_quantity} disabled />
                        </td>
                        <td className="p-2">${item.total_cost.toFixed(2)}</td>
                        <td className="p-2">${item.expected_sale_price?.toFixed(2) ?? "-"}</td>
                        <td className="p-2">${item.estimated_profit_low.toFixed(2)}-${item.estimated_profit_high.toFixed(2)}</td>
                        <td className="p-2">{item.sell_speed}</td>
                        <td className="p-2">{item.confidence_score}%</td>
                        <td className="p-2 max-w-[220px] text-xs text-muted-foreground">{item.risk_notes || "-"}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => markBought(item)}><ShoppingCart className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" asChild><Link href={`/flip-decision/${item.inventory_item_id}`}>Details</Link></Button>
                            <Button size="sm" variant="ghost" asChild><Link href={`/listing-generator/${item.inventory_item_id}`}>Listing</Link></Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeItem(item)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card><CardHeader><CardTitle className="text-base">Store Trip Plan</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{current.action_plan}</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Risk Notes</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{current.risk_summary}</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Cash Reserve</CardTitle></CardHeader><CardContent><div className="text-3xl font-black">${current.cash_reserve.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Kept unspent for flexibility and safer buying.</p></CardContent></Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label>{label}</Label><Input type="number" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<string | [string, string]> }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => {
          const v = Array.isArray(option) ? option[0] : option;
          const l = Array.isArray(option) ? option[1] : option;
          return <SelectItem key={v} value={v}>{l}</SelectItem>;
        })}</SelectContent>
      </Select>
    </div>
  );
}

function ChipGroup({ title, values, selected, onToggle }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Button key={value} type="button" size="sm" variant={selected.includes(value) ? "secondary" : "outline"} onClick={() => onToggle(value)}>{value}</Button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-bold">{value}</div></div>;
}
