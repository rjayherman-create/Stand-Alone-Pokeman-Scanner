import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DetailsResponse {
  item: Record<string, any> | null;
  lookup_results: Array<Record<string, any>>;
}

export default function CompDetails() {
  const { itemId } = useParams<{ itemId: string }>();
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/comp-details/${itemId}`);
    setData(await response.json());
    setLoading(false);
  }

  async function rerunLookup() {
    if (!data?.item) return;
    await fetch("/api/comp-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventory_item_id: data.item.id, scannedItem: { ...data.item, current_store_price: data.item.price } }),
    });
    await load();
  }

  useEffect(() => { void load(); }, [itemId]);

  if (loading) return <div className="max-w-3xl mx-auto text-sm text-muted-foreground">Loading comp details...</div>;
  if (!data?.item) return <div className="max-w-3xl mx-auto">Item not found.</div>;

  const ebay = data.lookup_results.filter((r) => r.source_type === "ebay").at(-1);
  const amazon = data.lookup_results.filter((r) => r.source_type === "amazon" || r.source_type === "keepa").at(-1);
  const manual = data.lookup_results.filter((r) => r.source_type === "manual").at(-1);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href={`/flip-decision/${data.item.id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h2 className="text-xl font-bold text-primary">Comp Details</h2>
            <p className="text-sm text-muted-foreground">{data.item.product_name}</p>
          </div>
        </div>
        <Button variant="outline" onClick={rerunLookup}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
      </div>

      <section className="grid md:grid-cols-3 gap-3">
        <Metric label="Suggested list" value={data.item.suggested_facebook_list_price ? `$${data.item.suggested_facebook_list_price}` : "-"} />
        <Metric label="Expected sale" value={data.item.expected_facebook_sale_price ? `$${data.item.expected_facebook_sale_price}` : "-"} />
        <Metric label="Confidence" value={data.item.comp_confidence ?? "LOW"} />
      </section>

      <DetailCard title="eBay" row={ebay} empty="No eBay lookup saved yet." />
      <DetailCard title="Amazon" row={amazon} empty="Amazon data source not connected or no lookup saved. Amazon is reference only unless you are approved to sell this item." />

      <Card>
        <CardHeader><CardTitle className="text-base">Facebook Marketplace</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <Metric label="Suggested list price" value={data.item.suggested_facebook_list_price ? `$${data.item.suggested_facebook_list_price}` : "-"} />
          <Metric label="Expected sale" value={data.item.expected_facebook_sale_price ? `$${data.item.expected_facebook_sale_price}` : "-"} />
          <Metric label="Negotiation floor" value={data.item.negotiation_floor ? `$${data.item.negotiation_floor}` : "-"} />
          <Metric label="Max buy price" value={data.item.max_buy_price ? `$${data.item.max_buy_price}` : "-"} />
          <div className="sm:col-span-2 text-xs text-muted-foreground rounded-lg bg-muted/30 p-3">Best buyer angle: sealed local pickup, priced below eBay active median, no shipping wait.</div>
        </CardContent>
      </Card>

      {manual && <DetailCard title="Manual comps" row={manual} empty="" />}

      <Button asChild className="w-full"><Link href={`/manual-comp-entry/${data.item.id}`}>Enter Manual Comps</Link></Button>
    </div>
  );
}

function DetailCard({ title, row, empty }: { title: string; row?: Record<string, any>; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!row ? <p className="text-muted-foreground">{empty}</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Metric label="Matched title" value={row.matched_title ?? "-"} />
            <Metric label="Match method" value={row.match_method ?? "-"} />
            <Metric label="Active low" value={row.active_low ? `$${row.active_low}` : "-"} />
            <Metric label="Active median" value={row.active_median ? `$${row.active_median}` : "-"} />
            <Metric label="Active high" value={row.active_high ? `$${row.active_high}` : "-"} />
            <Metric label="Sold median" value={row.sold_median ? `$${row.sold_median}` : "-"} />
            <Metric label="Shipping median" value={row.shipping_median ? `$${row.shipping_median}` : "-"} />
            <Metric label="Confidence" value={row.match_confidence ? `${row.match_confidence}%` : "-"} />
            <div className="sm:col-span-2 text-xs text-muted-foreground rounded-lg bg-muted/30 p-3">{row.notes ?? "No notes."}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border p-3 min-w-0">
      <div className="text-xs text-muted-foreground uppercase font-semibold">{label}</div>
      <div className="font-bold mt-1 break-words">{value}</div>
    </div>
  );
}
