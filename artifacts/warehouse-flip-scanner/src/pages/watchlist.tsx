import { useState } from "react";
import { useListWatchlist, useCreateWatchlistItem, useDeleteWatchlistItem, getListWatchlistQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Bookmark, Trash2, Plus, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WatchlistItem {
  id: number;
  item_number?: string | null;
  product_name: string;
  desired_buy_price?: number | null;
  target_resale_price?: number | null;
  stores_to_watch?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export default function Watchlist() {
  const [showForm, setShowForm] = useState(false);
  const [productName, setProductName] = useState("");
  const [itemNumber, setItemNumber] = useState("");
  const [desiredBuyPrice, setDesiredBuyPrice] = useState("");
  const [targetResalePrice, setTargetResalePrice] = useState("");
  const [storesToWatch, setStoresToWatch] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useListWatchlist();
  const createItem = useCreateWatchlistItem();
  const deleteItem = useDeleteWatchlistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const items = (data ?? []) as WatchlistItem[];

  function resetForm() {
    setProductName(""); setItemNumber(""); setDesiredBuyPrice(""); setTargetResalePrice(""); setStoresToWatch(""); setNotes("");
    setShowForm(false);
  }

  async function handleAdd() {
    if (!productName) {
      toast({ title: "Product name required", variant: "destructive" });
      return;
    }
    await createItem.mutateAsync({
      data: {
        product_name: productName,
        item_number: itemNumber.trim() || productName.trim(),
        desired_buy_price: desiredBuyPrice ? parseFloat(desiredBuyPrice) : undefined,
        target_resale_price: targetResalePrice ? parseFloat(targetResalePrice) : undefined,
        stores_to_watch: storesToWatch || undefined,
        notes: notes || undefined,
      }
    });
    queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
    toast({ title: "Added to watchlist", description: `${productName} is now being tracked.` });
    resetForm();
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Remove "${name}" from watchlist?`)) return;
    deleteItem.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
        toast({ title: "Removed", description: `${name} removed from watchlist.` });
      }
    });
  }

  function estimatedProfit(item: WatchlistItem) {
    if (!item.desired_buy_price || !item.target_resale_price) return null;
    return (item.target_resale_price - item.desired_buy_price).toFixed(2);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-primary">Watchlist</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="mr-1 h-4 w-4" /> Cancel</> : <><Plus className="mr-1 h-4 w-4" /> Add Item</>}
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="shadow-sm border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Track a New Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Name *</Label>
                <Input placeholder="LEGO Speed Champions Assortment" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item Number</Label>
                <Input placeholder="1939203" value={itemNumber} onChange={(e) => setItemNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buy at or Below ($)</Label>
                <Input type="number" step="0.01" placeholder="14.97" value={desiredBuyPrice} onChange={(e) => setDesiredBuyPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Resale ($)</Label>
                <Input type="number" step="0.01" placeholder="22.00" value={targetResalePrice} onChange={(e) => setTargetResalePrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stores to Watch</Label>
                <Input placeholder="Lawrence, Oceanside" value={storesToWatch} onChange={(e) => setStoresToWatch(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
                <Textarea placeholder="Buy if at or below $15. Strong flipper." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 font-semibold" onClick={handleAdd} disabled={createItem.isPending}>
                {createItem.isPending ? "Adding..." : "Add to Watchlist"}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <Card className="text-center p-10 shadow-none border-dashed">
          <Bookmark className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium">Your watchlist is empty.</p>
          <p className="text-sm text-muted-foreground mt-1">Track items you want to find at specific prices.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>Add First Item</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const profit = estimatedProfit(item);
            return (
              <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3 className="font-semibold leading-tight">{item.product_name}</h3>
                        {item.item_number && <p className="text-xs text-muted-foreground">Item #{item.item_number}</p>}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-muted/40 rounded px-2 py-1">
                          <div className="text-muted-foreground">Buy ≤</div>
                          <div className="font-bold text-success">${item.desired_buy_price ?? "—"}</div>
                        </div>
                        <div className="bg-muted/40 rounded px-2 py-1">
                          <div className="text-muted-foreground">Resale</div>
                          <div className="font-bold text-primary">${item.target_resale_price ?? "—"}</div>
                        </div>
                        <div className="bg-muted/40 rounded px-2 py-1">
                          <div className="text-muted-foreground">Profit</div>
                          <div className={`font-bold ${profit ? "text-success" : "text-muted-foreground"}`}>{profit ? `$${profit}` : "—"}</div>
                        </div>
                      </div>

                      {item.stores_to_watch && (
                        <p className="text-xs text-muted-foreground">Watch: {item.stores_to_watch}</p>
                      )}

                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                      )}
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => handleDelete(item.id, item.product_name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
