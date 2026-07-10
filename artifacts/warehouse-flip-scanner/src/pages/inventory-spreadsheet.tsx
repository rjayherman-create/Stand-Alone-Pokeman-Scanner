import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, Eye, FileText, Filter, RefreshCw, Search, Settings2, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RecommendationBadge, SourceTypeBadge } from "@/components/shared/badges";

type Row = Record<string, any>;

const COLUMN_GROUPS = {
  core: [
    ["created_at", "Date scanned"],
    ["retailer", "Retailer"],
    ["store_location", "Store"],
    ["source_type", "Source"],
    ["hunt_mode", "Hunt mode"],
    ["product_name", "Product name"],
    ["brand", "Brand"],
    ["category", "Category"],
    ["item_number", "Item #"],
    ["upc", "UPC / GTIN"],
    ["sku", "SKU"],
    ["dpci", "DPCI"],
    ["tcin", "TCIN"],
    ["model_number", "Model"],
    ["price", "Store price"],
    ["regular_price", "Regular"],
    ["clearance_price", "Clearance"],
    ["percent_off", "% off"],
    ["markdown_code", "Markdown"],
    ["stock_status", "Stock"],
    ["visible_quantity_estimate", "Visible qty"],
    ["box_condition", "Box"],
    ["sealed_status", "Sealed"],
  ],
  decision: [
    ["recommendation", "Decision"],
    ["flip_score", "Score"],
    ["confidence_score", "Confidence"],
    ["max_quantity", "Qty"],
    ["suggested_facebook_list_price", "FB list"],
    ["expected_facebook_sale_price", "Expected sale"],
    ["estimated_profit_per_unit", "Profit"],
    ["profit_margin_percent", "Margin"],
    ["negotiation_floor", "Floor"],
    ["max_buy_price", "Max buy"],
    ["suggested_channel", "Channel"],
    ["risk_warning", "Risk"],
    ["one_sentence_reason", "Reason"],
  ],
  comps: [
    ["ebay_active_range", "eBay active"],
    ["ebay_active_median", "eBay active med"],
    ["ebay_sold_range", "eBay sold"],
    ["ebay_sold_median", "eBay sold med"],
    ["ebay_active_count", "eBay active count"],
    ["ebay_sold_count", "eBay sold count"],
    ["amazon_reference_price", "Amazon ref"],
    ["amazon_30_day_average", "Amazon 30d"],
    ["amazon_90_day_average", "Amazon 90d"],
    ["amazon_sales_rank", "Amazon rank"],
    ["comp_confidence", "Comp confidence"],
    ["match_method", "Match method"],
    ["match_confidence", "Match %"],
  ],
  status: [
    ["added_to_watchlist", "Watchlist"],
    ["listing_generated", "Listing"],
    ["bought_status", "Bought"],
    ["listed_status", "Listed"],
    ["sold_status", "Sold"],
    ["skipped_status", "Skipped"],
    ["research_status", "Research"],
    ["sold_price", "Sold price"],
    ["final_profit", "Final profit"],
    ["sale_channel", "Sale channel"],
    ["user_notes", "Notes"],
  ],
};

const ALL_COLUMNS = Object.values(COLUMN_GROUPS).flat();
const DEFAULT_VISIBLE = [
  "created_at", "store_location", "source_type", "product_name", "price", "recommendation",
  "estimated_profit_per_unit", "bought_status", "listed_status", "sold_status",
];

const RETAILERS = ["all", "Costco", "Walmart", "Target", "BJ's", "Sam's Club", "Home Depot", "Lowe's", "Other"];
const RECS = ["all", "BUY", "MAYBE", "SKIP", "RESEARCH_MORE"];
const SOURCES = ["all", "quick_scan", "photo_scan", "screenshot_upload", "public_web_check", "manual", "manual_comp"];
const CATEGORIES = ["all", "LEGO", "Toys", "Tools", "Small Appliances", "Electronics", "Seasonal", "Sporting Goods", "Golf", "Baby Gear", "Home Goods", "Furniture", "Outdoor / Patio", "Video Games", "Collectibles", "Automotive", "Other"];
const STATUSES = ["all", "Bought", "Listed", "Sold", "Skipped", "Research More", "Watchlist"];
const PROFITS = ["all", "0-5", "5-10", "10-25", "25+"];
const SORTS = [
  ["date_desc", "Date newest"],
  ["date_asc", "Date oldest"],
  ["profit_desc", "Highest profit"],
  ["profit_asc", "Lowest profit"],
  ["score_desc", "Highest score"],
  ["score_asc", "Lowest score"],
  ["price_asc", "Store price low"],
  ["price_desc", "Store price high"],
  ["category", "Category"],
  ["retailer", "Retailer"],
  ["store", "Store"],
  ["recommendation", "Recommendation"],
];

export default function InventorySpreadsheetPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [viewMode, setViewMode] = useState<"actions" | "table">("actions");
  const [undo, setUndo] = useState<{ ids: number[]; label: string } | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    retailer: "all",
    store: "all",
    recommendation: "all",
    source_type: "all",
    category: "all",
    status: "all",
    date_range: "all",
    profit: "all",
    sort: "date_desc",
  });
  const [visible, setVisible] = useState<string[]>(() => {
    const saved = localStorage.getItem("retail-flip-spreadsheet-columns");
    return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
  });

  const visibleColumns = useMemo(() => ALL_COLUMNS.filter(([key]) => visible.includes(key)), [visible]);
  const stores = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.store_location).filter(Boolean)))], [rows]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    const response = await fetch(`/api/inventory-spreadsheet?${params.toString()}`);
    const data = await response.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [filters]);

  function updateFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleColumn(key: string) {
    setVisible((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
      localStorage.setItem("retail-flip-spreadsheet-columns", JSON.stringify(next));
      return next;
    });
  }

  async function patchRow(id: number, key: string, value: string) {
    const numeric = ["price", "regular_price", "clearance_price", "percent_off", "suggested_facebook_list_price", "expected_facebook_sale_price", "estimated_profit_per_unit", "negotiation_floor", "max_buy_price", "sold_price", "final_profit"].includes(key);
    const payload = { [key]: numeric && value !== "" ? Number(value) : value };
    const response = await fetch(`/api/inventory-spreadsheet/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) await load();
  }

  async function deleteRows(ids: number[], label: string) {
    if (ids.length === 0) return;
    const message = ids.length === 1
      ? "Delete this item from the spreadsheet?"
      : `Delete ${ids.length} selected items? This will remove them from your analysis spreadsheet.`;
    if (!confirm(message)) return;
    if (ids.length === 1) {
      await fetch(`/api/inventory-spreadsheet/${ids[0]}`, { method: "DELETE" });
    } else {
      await fetch("/api/inventory-spreadsheet/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    }
    setSelected([]);
    setUndo({ ids, label });
    setTimeout(() => setUndo(null), 10000);
    await load();
  }

  async function restore(ids: number[]) {
    await Promise.all(ids.map((id) => fetch(`/api/inventory-spreadsheet/restore/${id}`, { method: "POST" })));
    setUndo(null);
    await load();
  }

  async function exportFile(kind: "csv" | "excel") {
    const response = await fetch(`/api/inventory-spreadsheet/export-${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, columns: visible }),
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    anchor.href = url;
    anchor.download = match?.[1] ?? `retail-flip-scanner-inventory.${kind === "csv" ? "csv" : "xls"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function recalculate(row: Row) {
    const preserve = row.recommendation ? !confirm("Overwrite user-edited recommendation with recalculated decision?") : false;
    await fetch(`/api/inventory-spreadsheet/recalculate/${row.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_overwrite: !preserve }),
    });
    await load();
  }

  async function updateStatus(row: Row, status: string) {
    const extra: Record<string, unknown> = {};
    if (status === "Sold") {
      const soldPrice = prompt("Sold price?");
      if (soldPrice == null) return;
      extra.sold_price = Number(soldPrice);
      extra.sold_date = new Date().toISOString().slice(0, 10);
      extra.sale_channel = prompt("Sale channel?", "Facebook Marketplace") ?? "Facebook Marketplace";
      extra.final_profit = Number(soldPrice) - Number(row.price ?? row.current_store_price ?? 0);
    }
    await fetch(`/api/inventory-spreadsheet/update-status/${row.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">Spreadsheet</h2>
          <p className="text-sm text-muted-foreground">What you scanned, what to buy, what to skip, and what already sold.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={viewMode === "actions" ? "default" : "outline"} onClick={() => setViewMode("actions")}>Action View</Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} onClick={() => setViewMode("table")}>Full Table</Button>
          <Button variant="outline" onClick={() => exportFile("csv")}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={() => exportFile("excel")}><Download className="mr-2 h-4 w-4" /> Excel</Button>
          <Button variant="outline" asChild><Link href="/inventory-trash"><Trash2 className="mr-2 h-4 w-4" /> Trash</Link></Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-3">
          <div className="grid md:grid-cols-[1.5fr_repeat(4,minmax(130px,1fr))] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search product, store, UPC, notes..." value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} />
            </div>
            <Pick value={filters.retailer} onChange={(v) => updateFilter("retailer", v)} options={RETAILERS} />
            <Pick value={filters.store} onChange={(v) => updateFilter("store", v)} options={stores} />
            <Pick value={filters.recommendation} onChange={(v) => updateFilter("recommendation", v)} options={RECS} />
            <Pick value={filters.sort} onChange={(v) => updateFilter("sort", v)} options={SORTS.map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <Pick value={filters.source_type} onChange={(v) => updateFilter("source_type", v)} options={SOURCES} />
            <Pick value={filters.category} onChange={(v) => updateFilter("category", v)} options={CATEGORIES} />
            <Pick value={filters.status} onChange={(v) => updateFilter("status", v)} options={STATUSES} />
            <Pick value={filters.date_range} onChange={(v) => updateFilter("date_range", v)} options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }]} />
            <Pick value={filters.profit} onChange={(v) => updateFilter("profit", v)} options={PROFITS.map((p) => ({ value: p, label: p === "all" ? "All profit" : `$${p}` }))} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{loading ? "Loading..." : `${total} rows`}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowColumns(!showColumns)}><Settings2 className="mr-2 h-4 w-4" /> Columns</Button>
              <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
            </div>
          </div>
          {showColumns && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 rounded-lg border border-border p-3">
              {ALL_COLUMNS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={visible.includes(key)} onChange={() => toggleColumn(key)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <div className="sticky top-2 z-10 rounded-lg border border-primary/30 bg-card shadow-sm p-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{selected.length} selected</span>
          <Button variant="destructive" size="sm" onClick={() => deleteRows(selected, `${selected.length} items`)}>Delete Selected</Button>
        </div>
      )}

      {undo && (
        <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
          <span className="text-sm">{undo.label} deleted.</span>
          <Button variant="outline" size="sm" onClick={() => restore(undo.ids)}><Undo2 className="mr-2 h-4 w-4" /> Undo</Button>
        </div>
      )}

      {viewMode === "actions" && (
        <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate" title={row.product_name}>{row.product_name}</h3>
                    <p className="text-xs text-muted-foreground">{row.retailer} - {row.store_location} - {formatCell("source_type", row.source_type)}</p>
                  </div>
                  <RecommendationBadge recommendation={row.recommendation} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Metric label="Cost" value={money(row.price ?? row.current_store_price)} />
                  <Metric label="Profit" value={money(row.estimated_profit_per_unit) || row.estimated_profit || "-"} />
                  <Metric label="Score" value={String(row.flip_score ?? row.confidence_score ?? "-")} />
                </div>
                <NextActionPanel row={row} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetail(row)}><Eye className="mr-2 h-4 w-4" /> Details</Button>
                  <Button variant="outline" size="sm" onClick={() => recalculate(row)}>Recalc</Button>
                  <Button variant="outline" size="sm" asChild><Link href={`/comp-details/${row.id}`}>Comps</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewMode === "table" && (
      <div className="hidden md:block overflow-auto border border-border rounded-lg bg-card">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="sticky top-0 bg-muted z-[1]">
            <tr>
              <th className="p-2 text-left w-10"><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></th>
              {visibleColumns.map(([key, label]) => <th key={key} className="p-2 text-left font-semibold whitespace-nowrap">{label}</th>)}
              <th className="p-2 text-left sticky right-0 bg-muted">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-2"><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))} /></td>
                {visibleColumns.map(([key]) => (
                  <td key={key} className="p-1 align-top min-w-[120px]">
                    <EditableCell row={row} field={key} onSave={patchRow} />
                  </td>
                ))}
                <td className="p-2 sticky right-0 bg-card">
                  <RowActions row={row} onDetail={setDetail} onDelete={() => deleteRows([row.id], row.product_name)} onRecalculate={() => recalculate(row)} onStatus={updateStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{row.product_name}</h3>
                  <p className="text-xs text-muted-foreground">{row.retailer} - {row.store_location}</p>
                </div>
                <RecommendationBadge recommendation={row.recommendation} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="Store" value={money(row.price ?? row.current_store_price)} />
                <Metric label="Expected" value={money(row.expected_facebook_sale_price)} />
                <Metric label="Profit" value={money(row.estimated_profit_per_unit) || row.estimated_profit || "-"} />
                <Metric label="Comps" value={row.comp_confidence ?? "-"} />
              </div>
              <NextActionPanel row={row} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setDetail(row)}><Eye className="mr-2 h-4 w-4" /> Details</Button>
                <Button variant="outline" size="sm" asChild><Link href={`/listing-generator/${row.id}`}><FileText className="mr-2 h-4 w-4" /> Listing</Link></Button>
                <Button variant="outline" size="sm" onClick={() => recalculate(row)}>Recalculate</Button>
                <Button variant="destructive" size="sm" onClick={() => deleteRows([row.id], row.product_name)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {detail && <DetailDrawer row={detail} onClose={() => setDetail(null)} onDelete={() => deleteRows([detail.id], detail.product_name)} onRecalculate={() => recalculate(detail)} onStatus={updateStatus} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Pick({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<string | { value: string; label: string }> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return <SelectItem key={value} value={value}>{label}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

function EditableCell({ row, field, onSave }: { row: Row; field: string; onSave: (id: number, key: string, value: string) => void }) {
  const editable = ["product_name", "brand", "category", "price", "regular_price", "clearance_price", "percent_off", "markdown_code", "stock_status", "box_condition", "sealed_status", "suggested_facebook_list_price", "expected_facebook_sale_price", "estimated_profit_per_unit", "recommendation", "user_notes", "research_status"].includes(field);
  const value = row[field] ?? "";
  if (field === "recommendation") return <RecommendationBadge recommendation={value} />;
  if (field === "source_type") return <SourceTypeBadge type={value} />;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (!editable) return <span className="line-clamp-2">{formatCell(field, value)}</span>;
  return (
    <input
      className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-primary focus:outline-none"
      defaultValue={String(value)}
      onBlur={(e) => {
        if (e.target.value !== String(value)) onSave(row.id, field, e.target.value);
      }}
    />
  );
}

function formatCell(field: string, value: unknown) {
  if (value == null || value === "") return "-";
  if (field.includes("price") || field.includes("profit") || field === "negotiation_floor" || field === "max_buy_price") {
    const num = Number(value);
    return Number.isFinite(num) ? `$${num.toFixed(2)}` : String(value);
  }
  if (field.endsWith("_at") || field === "created_at") return new Date(String(value)).toLocaleDateString();
  return String(value);
}

function money(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-muted/40 p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value || "-"}</div></div>;
}

function getNextAction(row: Row) {
  const rec = String(row.recommendation ?? "").toUpperCase();
  if (row.sold_status) return { label: "Review profit", detail: "Sold. Check final profit and cash position.", href: "/accounting-ledger", action: "Ledger" };
  if (row.listed_status || row.listing_status === "listed") return { label: "Monitor listing", detail: "Listed. Watch interest or plan a price drop.", href: "/sales-pipeline", action: "Pipeline" };
  if (row.bought_status) return { label: "Generate listing", detail: "Bought. Turn it into a marketplace listing.", href: `/listing-generator/${row.id}`, action: "Listing" };
  if (rec === "BUY") return { label: "Record purchase", detail: "Good buy candidate. If you bought it, record purchase.", href: `/accounting-ledger?inventory_item_id=${row.id}`, action: "Record" };
  if (rec === "MAYBE" || rec === "RESEARCH_MORE") return { label: "Compare details", detail: "Needs more confidence before buying.", href: `/comp-details/${row.id}`, action: "Compare" };
  if (rec === "SKIP") return { label: "Leave skipped", detail: "Low priority. Keep notes or delete later.", href: `/flip-decision/${row.id}`, action: "Review" };
  return { label: "Decide next", detail: "Run comps or recalculate to choose buy, watch, or skip.", href: `/comp-details/${row.id}`, action: "Decide" };
}

function NextActionPanel({ row }: { row: Row }) {
  const next = getNextAction(row);
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Next action</p>
        <p className="text-sm font-semibold">{next.label}</p>
        <p className="text-xs text-muted-foreground">{next.detail}</p>
      </div>
      <Button size="sm" asChild><Link href={next.href}>{next.action}</Link></Button>
    </div>
  );
}

function RowActions({ row, onDetail, onDelete, onRecalculate, onStatus }: { row: Row; onDetail: (row: Row) => void; onDelete: () => void; onRecalculate: () => void; onStatus: (row: Row, status: string) => void }) {
  const next = getNextAction(row);
  return (
    <div className="flex gap-1 items-center">
      <Button size="sm" variant="secondary" asChild><Link href={next.href}>{next.action}</Link></Button>
      <Button size="icon" variant="ghost" onClick={() => onDetail(row)}><Eye className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" asChild><Link href={`/listing-generator/${row.id}`}><FileText className="h-4 w-4" /></Link></Button>
      <Button size="icon" variant="ghost" asChild><Link href={`/comp-details/${row.id}`}><Filter className="h-4 w-4" /></Link></Button>
      <Button size="sm" variant="ghost" onClick={onRecalculate}>Recalc</Button>
      <Select onValueChange={(status) => onStatus(row, status)}>
        <SelectTrigger className="w-24 h-8"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>{["Bought", "Listed", "Sold", "Skipped", "Research More"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function DetailDrawer({ row, onClose, onDelete, onRecalculate, onStatus }: { row: Row; onClose: () => void; onDelete: () => void; onRecalculate: () => void; onStatus: (row: Row, status: string) => void }) {
  return (
    <div className="space-y-5">
      <SheetHeader><SheetTitle>{row.product_name}</SheetTitle></SheetHeader>
      <NextActionPanel row={row} />
      <Section title="Product Summary" items={[["Retailer", row.retailer], ["Store", row.store_location], ["Category", row.category], ["UPC", row.upc], ["Model", row.model_number], ["Price", money(row.price ?? row.current_store_price)]]} />
      <Section title="Quick Decision" items={[["Recommendation", row.recommendation], ["Score", row.flip_score], ["Confidence", row.confidence_score], ["Reason", row.one_sentence_reason], ["Risk", row.risk_warning ?? row.risk_notes]]} />
      <Section title="Profit Breakdown" items={[["FB list", money(row.suggested_facebook_list_price)], ["Expected sale", money(row.expected_facebook_sale_price)], ["Profit", money(row.estimated_profit_per_unit) || row.estimated_profit], ["Margin", row.profit_margin_percent ? `${row.profit_margin_percent}%` : "-"], ["Floor", money(row.negotiation_floor)]]} />
      <Section title="eBay Comps" items={[["Active", row.ebay_active_range], ["Active median", money(row.ebay_active_median)], ["Sold", row.ebay_sold_range], ["Sold median", money(row.ebay_sold_median)], ["Match", row.match_method], ["Confidence", row.match_confidence ? `${row.match_confidence}%` : "-"]]} />
      <Section title="Amazon Reference" items={[["Reference price", money(row.amazon_reference_price)], ["30 day avg", money(row.amazon_30_day_average)], ["90 day avg", money(row.amazon_90_day_average)], ["Sales rank", row.amazon_sales_rank], ["Note", "Amazon is reference only unless you are approved to sell this item."]]} />
      <Section title="Photos / Screenshots" items={[["Photo", row.photo_url], ["Screenshot", row.screenshot_url], ["Product crop", row.cropped_product_image_url], ["Tag crop", row.cropped_tag_image_url], ["Source", row.source_url]]} />
      <Section title="Notes" items={[["User notes", row.user_notes], ["OCR notes", row.notes_from_image]]} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onRecalculate}>Recalculate</Button>
        <Button variant="outline" asChild><Link href={`/listing-generator/${row.id}`}>Generate Listing</Link></Button>
        <Button variant="outline" asChild><Link href={`/comp-details/${row.id}`}>Compare Details</Link></Button>
        <Button variant="outline" onClick={() => onStatus(row, "Bought")}>Mark Bought</Button>
        <Button variant="outline" onClick={() => onStatus(row, "Listed")}>Mark Listed</Button>
        <Button variant="outline" onClick={() => onStatus(row, "Sold")}>Mark Sold</Button>
        <Button variant="destructive" onClick={onDelete}>Delete</Button>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: Array<[string, unknown]> }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-border/60 pb-1 last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right break-words">{value == null || value === "" ? "-" : String(value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
