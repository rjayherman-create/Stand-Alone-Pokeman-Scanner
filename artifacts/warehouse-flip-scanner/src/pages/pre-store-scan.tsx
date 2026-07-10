import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ClipboardList, MapPinned, Plus, RefreshCw, Route, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type PreStoreItem = {
  id: number;
  product_name: string;
  store_location: string;
  category?: string | null;
  online_price?: number | null;
  in_store_price?: number | null;
  pre_store_score?: number | null;
  trip_priority?: string | null;
  recommendation?: string | null;
  estimated_profit?: number | null;
  target_buy_price?: number | null;
  reason?: string | null;
  risk_notes?: string | null;
};

type TripPlan = {
  first_store_to_visit?: string | null;
  second_store_optional?: string | null;
  estimated_total_spend?: number;
  estimated_total_profit?: number;
  items_to_buy_if_price_matches?: string[];
  items_to_skip?: Array<{ product_name: string; reason?: string }>;
};

type PreStoreSession = {
  id: number;
  retailer: string;
  selected_category?: string | null;
  selected_stores?: Array<{ store_name?: string; name?: string; store_location?: string }> | null;
  started_at?: string | null;
  total_items_found?: number | null;
  must_check_count?: number | null;
  check_if_nearby_count?: number | null;
  estimated_total_profit?: number | null;
  items: PreStoreItem[];
  trip_plan?: TripPlan | null;
};

const RETAILERS = ["Costco", "Walmart", "Target", "BJ's", "Sam's Club", "Home Depot", "Lowe's", "Other"];
const CATEGORIES = ["LEGO", "Toys", "Tools", "Electronics", "Video Games", "Small Appliances", "Seasonal", "Outdoor / Patio", "Collectibles", "Other"];

export default function PreStoreScanPage() {
  const [retailer, setRetailer] = useState("Costco");
  const [store, setStore] = useState("Lawrence");
  const [category, setCategory] = useState("LEGO");
  const [budget, setBudget] = useState("150");
  const [pasteText, setPasteText] = useState("");
  const [manual, setManual] = useState({ product_name: "", online_price: "", expected_facebook_sale_price: "", item_number: "" });
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [items, setItems] = useState<PreStoreItem[]>([]);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [sessions, setSessions] = useState<PreStoreSession[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { void loadSessions(); }, []);

  async function loadSessions() {
    const response = await fetch("/api/pre-store-scan");
    if (!response.ok) return;
    const data = await response.json();
    setSessions(data.sessions ?? []);
  }

  async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }

  async function startSession() {
    setLoading(true);
    try {
      const data = await post<{ session: { id: number } }>("/api/pre-store-scan/start", {
        retailer,
        selected_category: category,
        selected_stores: [{ store_name: store }],
        hunt_type: "Trip Prep",
        notes: `Budget target: $${budget}`,
      });
      setSessionId(data.session.id);
      await loadSessions();
      toast({ title: "Trip prep started", description: "Add online finds, pasted listings, or manual targets." });
    } finally {
      setLoading(false);
    }
  }

  async function addPasteRows() {
    if (!sessionId) await startSession();
    const activeId = sessionId ?? await createSessionId();
    setLoading(true);
    try {
      const data = await post<{ items: PreStoreItem[] }>("/api/pre-store-scan/paste-text", { session_id: activeId, text: pasteText });
      setItems(data.items ?? []);
      setPasteText("");
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function createSessionId() {
    const data = await post<{ session: { id: number } }>("/api/pre-store-scan/start", {
      retailer,
      selected_category: category,
      selected_stores: [{ store_name: store }],
      hunt_type: "Trip Prep",
      notes: `Budget target: $${budget}`,
    });
    setSessionId(data.session.id);
    return data.session.id;
  }

  async function addManualItem() {
    const activeId = sessionId ?? await createSessionId();
    setLoading(true);
    try {
      const data = await post<{ items: PreStoreItem[] }>("/api/pre-store-scan/manual-entry", {
        session_id: activeId,
        retailer,
        store_location: store,
        category,
        product_name: manual.product_name,
        item_number: manual.item_number,
        online_price: Number(manual.online_price || 0),
        expected_facebook_sale_price: Number(manual.expected_facebook_sale_price || 0),
        stock_status: "Unknown",
        source_confidence: "medium",
      });
      setItems((prev) => [...data.items, ...prev]);
      setManual({ product_name: "", online_price: "", expected_facebook_sale_price: "", item_number: "" });
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function buildTripPlan() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await post<{ plan: TripPlan }>("/api/pre-store-scan/build-trip-plan", {
        session_id: sessionId,
        settings: { budget: Number(budget || 0), time_available: "Today" },
      });
      setPlan(data.plan);
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function saveToInventory(item: PreStoreItem) {
    await post("/api/pre-store-scan/save-to-inventory", { item_id: item.id });
    toast({ title: "Saved", description: `${item.product_name} was added to inventory.` });
  }

  function resumeSession(session: PreStoreSession) {
    setSessionId(session.id);
    setRetailer(session.retailer ?? retailer);
    setCategory(session.selected_category ?? category);
    setStore(storeName(session) ?? store);
    setItems(session.items ?? []);
    setPlan(session.trip_plan ?? null);
    toast({ title: "Trip prep loaded", description: `Loaded session #${session.id}.` });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Pre-Store Scan</h2>
          <p className="text-sm text-muted-foreground">Prepare a store trip before you leave: paste online finds, score them, and build a visit plan.</p>
        </div>
        <Button onClick={startSession} disabled={loading}>
          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <MapPinned className="mr-2 h-4 w-4" />}
          Start Trip Prep
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 grid gap-3 md:grid-cols-4">
          <div>
            <Label>Retailer</Label>
            <Select value={retailer} onValueChange={setRetailer}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RETAILERS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Store</Label>
            <Input value={store} onChange={(event) => setStore(event.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Budget</Label>
            <Input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-primary/10">
        <CardHeader>
          <CardTitle className="text-base">Recent Trip Prep</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-3">Saved trip prep sessions will appear here after you start planning a store run.</p>
          ) : sessions.slice(0, 6).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => resumeSession(session)}
                className={`rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${sessionId === session.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <p className="font-semibold">{session.retailer} - {storeName(session) ?? "Store trip"}</p>
                <p className="text-xs text-muted-foreground">{session.selected_category ?? "All categories"} - {session.items?.length ?? session.total_items_found ?? 0} targets</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <Badge variant="secondary">{session.must_check_count ?? 0} must</Badge>
                  <Badge variant="outline">{money(session.estimated_total_profit)} profit</Badge>
                </div>
              </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr_0.9fr] gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Paste Online Finds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={8} placeholder="Paste store app rows, online search notes, markdown finds, or item-price lines..." />
            <Button onClick={addPasteRows} disabled={loading || !pasteText.trim()}>
              <Search className="mr-2 h-4 w-4" /> Score Pasted Finds
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Manual Target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Product name" value={manual.product_name} onChange={(event) => setManual((prev) => ({ ...prev, product_name: event.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Seen price" value={manual.online_price} onChange={(event) => setManual((prev) => ({ ...prev, online_price: event.target.value }))} inputMode="decimal" />
              <Input placeholder="Expected sale" value={manual.expected_facebook_sale_price} onChange={(event) => setManual((prev) => ({ ...prev, expected_facebook_sale_price: event.target.value }))} inputMode="decimal" />
            </div>
            <Input placeholder="Item / UPC / model" value={manual.item_number} onChange={(event) => setManual((prev) => ({ ...prev, item_number: event.target.value }))} />
            <Button variant="outline" onClick={addManualItem} disabled={loading || !manual.product_name.trim()} className="w-full">Add Target</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4" /> Trip Targets</CardTitle>
          <Button size="sm" onClick={buildTripPlan} disabled={!sessionId || loading}>Build Trip Plan</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add pasted or manual targets to see what is worth checking in store.</p>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-md border p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.product_name}</p>
                  <Badge variant="secondary">{item.trip_priority ?? "Watch"}</Badge>
                  <Badge variant="outline">{item.pre_store_score ?? 0}/100</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.store_location} - Target buy {money(item.target_buy_price)} - Est. profit {money(item.estimated_profit)}</p>
                <p className="text-xs text-muted-foreground">{item.reason ?? item.risk_notes}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => saveToInventory(item)}><Save className="mr-2 h-4 w-4" /> Inventory</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {plan && (
        <Card className="shadow-sm border-primary/20 bg-primary/5">
          <CardHeader><CardTitle className="text-base">Today&apos;s Store Plan</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-3 gap-3">
              <Metric label="First stop" value={plan.first_store_to_visit ?? "-"} />
              <Metric label="Optional stop" value={plan.second_store_optional ?? "-"} />
              <Metric label="Profit target" value={money(plan.estimated_total_profit)} />
            </div>
            <div>
              <p className="font-semibold">Check if price matches</p>
              <p className="text-muted-foreground">{plan.items_to_buy_if_price_matches?.join(", ") || "No must-check items yet."}</p>
            </div>
            <Button asChild><Link href="/quick-scan">Open Quick Scan In Store</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function money(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? `$${num.toFixed(2)}` : "-";
}

function storeName(session: PreStoreSession) {
  const first = Array.isArray(session.selected_stores) ? session.selected_stores[0] : null;
  return first?.store_name ?? first?.name ?? first?.store_location ?? null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-card border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold">{value}</p></div>;
}
