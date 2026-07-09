import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TrashRow = Record<string, any>;

export default function TrashViewPage() {
  const [rows, setRows] = useState<TrashRow[]>([]);

  async function load() {
    const response = await fetch("/api/inventory-trash");
    setRows(await response.json());
  }

  useEffect(() => { void load(); }, []);

  async function restore(id: number) {
    await fetch(`/api/inventory-spreadsheet/restore/${id}`, { method: "POST" });
    await load();
  }

  async function permanentDelete(id: number) {
    if (!confirm("Permanently delete this item? This cannot be undone.")) return;
    await fetch(`/api/inventory-spreadsheet/permanent/${id}`, { method: "DELETE" });
    await load();
  }

  async function emptyTrash() {
    if (!confirm("Empty trash permanently? This cannot be undone.")) return;
    await fetch("/api/inventory-trash/empty", { method: "POST" });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/inventory-spreadsheet"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h2 className="text-2xl font-bold text-primary">Trash</h2>
            <p className="text-sm text-muted-foreground">{rows.length} deleted items</p>
          </div>
        </div>
        <Button variant="destructive" onClick={emptyTrash} disabled={rows.length === 0}>Empty Trash</Button>
      </div>

      <div className="overflow-auto border border-border rounded-lg bg-card">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted">
            <tr>
              {["Date deleted", "Product name", "Retailer", "Store", "Price", "Recommendation", "Estimated profit", "Actions"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-2">{row.deleted_at ? new Date(row.deleted_at).toLocaleDateString() : "-"}</td>
                <td className="p-2 font-medium">{row.product_name}</td>
                <td className="p-2">{row.retailer}</td>
                <td className="p-2">{row.store_location}</td>
                <td className="p-2">{row.price != null ? `$${row.price}` : "-"}</td>
                <td className="p-2">{row.recommendation ?? "-"}</td>
                <td className="p-2">{row.estimated_profit_per_unit != null ? `$${row.estimated_profit_per_unit}` : row.estimated_profit ?? "-"}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => restore(row.id)}><RotateCcw className="mr-2 h-4 w-4" /> Restore</Button>
                    <Button size="sm" variant="destructive" onClick={() => permanentDelete(row.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Trash is empty.</CardContent></Card>}
    </div>
  );
}
