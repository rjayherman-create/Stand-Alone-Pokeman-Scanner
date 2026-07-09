import { useState } from "react";
import { Search, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["LEGO", "Toys", "Tools", "Small Appliances", "Electronics", "Seasonal", "Sporting Goods", "Golf", "Home Goods", "Other"];

interface CompLookupResponse {
  compSummary: {
    ebay_active_range?: string | null;
    ebay_active_median?: number | null;
    ebay_sold_range?: string | null;
    ebay_sold_median?: number | null;
    amazon_reference_price?: number | null;
    suggested_facebook_list_price?: number | null;
    expected_facebook_sale_price?: number | null;
    suggested_channel?: string;
    comp_confidence?: string;
    warning_notes?: string[];
  };
  profitSummary: {
    estimated_net_profit?: number | null;
    profit_margin_percent?: number | null;
    negotiation_floor?: number | null;
    recommended_quantity?: string;
  };
  decision: {
    recommendation: string;
    confidence_score: number;
    one_sentence_reason: string;
    risk_warning?: string | null;
    best_next_action: string;
  };
  amazonData: { notes?: string };
  ebayData: { notes?: string; active_count?: number };
}

export default function CompLookup() {
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("LEGO");
  const [identifier, setIdentifier] = useState("");
  const [result, setResult] = useState<CompLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runLookup() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/comp-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scannedItem: {
            retailer: "Costco",
            store_location: "Local Store",
            product_name: productName,
            brand: brand || undefined,
            category,
            current_store_price: price ? Number(price) : undefined,
            upc: identifier || undefined,
            model_number: identifier || undefined,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setResult(await response.json());
    } catch {
      setError("Comp lookup failed. Try a barcode/model number or enter manual comps.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">Comp Lookup</h2>
        <p className="text-sm text-muted-foreground mt-1">Fast eBay-first comparison with Amazon as reference-only data.</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <Label>Product name</Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="LEGO Speed Champions Assortment" />
            </div>
            <div className="space-y-1">
              <Label>Brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="LEGO" />
            </div>
            <div className="space-y-1">
              <Label>Store price</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="14.97" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Barcode / model / item number</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Optional but improves confidence" />
            </div>
          </div>
          <Button className="w-full" onClick={runLookup} disabled={loading || !productName || !price}>
            <Search className="mr-2 h-4 w-4" /> {loading ? "Checking comps..." : "Run Comp Lookup"}
          </Button>
        </CardContent>
      </Card>

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      {result && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Price Comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Metric label="Store price" value={`$${Number(price).toFixed(2)}`} />
              <Metric label="eBay active" value={result.compSummary.ebay_active_range ?? "Unavailable"} />
              <Metric label="eBay likely sale" value={result.compSummary.ebay_sold_range ?? (result.compSummary.ebay_active_median ? `$${result.compSummary.ebay_active_median}` : "Research")} />
              <Metric label="Amazon reference" value={result.compSummary.amazon_reference_price ? `$${result.compSummary.amazon_reference_price}` : "Not connected"} />
              <Metric label="Facebook list" value={result.compSummary.suggested_facebook_list_price ? `$${result.compSummary.suggested_facebook_list_price}` : "-"} />
              <Metric label="Expected local sale" value={result.compSummary.expected_facebook_sale_price ? `$${result.compSummary.expected_facebook_sale_price}` : "-"} />
              <Metric label="Estimated profit" value={result.profitSummary.estimated_net_profit != null ? `$${result.profitSummary.estimated_net_profit}` : "-"} />
              <Metric label="Confidence" value={result.compSummary.comp_confidence ?? "LOW"} />
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="text-3xl font-black">{result.decision.recommendation}</div>
              <p className="text-sm text-muted-foreground mt-1">{result.decision.one_sentence_reason}</p>
              <p className="text-sm text-primary font-medium mt-2">{result.decision.best_next_action}</p>
            </div>

            {(result.compSummary.warning_notes?.length ?? 0) > 0 && (
              <div className="space-y-2">
                {result.compSummary.warning_notes?.map((note) => (
                  <div key={note} className="flex gap-2 text-xs rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {note}
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground">{result.amazonData.notes}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border p-3">
      <div className="text-xs text-muted-foreground uppercase font-semibold">{label}</div>
      <div className="font-bold mt-1">{value}</div>
    </div>
  );
}
