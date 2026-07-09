import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ManualCompEntry() {
  const { itemId } = useParams<{ itemId: string }>();
  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState({
    manual_ebay_sold_price: "",
    manual_ebay_active_price: "",
    manual_amazon_price: "",
    manual_facebook_comp_price: "",
    manual_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch(`/api/comp-details/${itemId}`).then((r) => r.json()).then((d) => setItem(d.item));
  }, [itemId]);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!item) return;
    setSaving(true);
    const response = await fetch("/api/manual-comp-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory_item_id: item.id,
        scannedItem: { ...item, current_store_price: item.price },
        ...form,
      }),
    });
    setResult(await response.json());
    setSaving(false);
  }

  if (!item) return <div className="max-w-2xl mx-auto text-sm text-muted-foreground">Loading item...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href={`/comp-details/${item.id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h2 className="text-xl font-bold text-primary">Manual Comp Entry</h2>
          <p className="text-sm text-muted-foreground">{item.product_name}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Manual eBay sold price" value={form.manual_ebay_sold_price} onChange={(v) => setField("manual_ebay_sold_price", v)} />
            <Field label="Manual eBay active price" value={form.manual_ebay_active_price} onChange={(v) => setField("manual_ebay_active_price", v)} />
            <Field label="Manual Amazon reference price" value={form.manual_amazon_price} onChange={(v) => setField("manual_amazon_price", v)} />
            <Field label="Manual Facebook comp price" value={form.manual_facebook_comp_price} onChange={(v) => setField("manual_facebook_comp_price", v)} />
          </div>
          <div className="space-y-1">
            <Label>Manual notes</Label>
            <Textarea value={form.manual_notes} onChange={(e) => setField("manual_notes", e.target.value)} placeholder="Sold comp source, title differences, local demand notes..." />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save and Recalculate"}
          </Button>
        </CardContent>
      </Card>

      {result?.decision && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-3xl font-black">{result.decision.recommendation}</div>
            <p className="text-sm text-muted-foreground">{result.decision.one_sentence_reason}</p>
            <p className="text-sm font-medium text-primary">{result.decision.best_next_action}</p>
            <Button asChild variant="outline" className="w-full mt-3"><Link href={`/comp-details/${item.id}`}>View Comp Details</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />
    </div>
  );
}
