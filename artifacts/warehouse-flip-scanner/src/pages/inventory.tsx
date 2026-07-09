import { useState } from "react";
import { useListInventory, useDeleteInventoryItem, getListInventoryQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecommendationBadge, SourceTypeBadge, MarkdownCodeBadge } from "@/components/shared/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Search, FileText, TrendingUp, ArrowUpDown, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "BUY", value: "BUY" },
  { label: "MAYBE", value: "MAYBE" },
  { label: "SKIP", value: "SKIP" },
];

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Score ↓", value: "score_desc" },
  { label: "Price ↓", value: "price_desc" },
  { label: "Price ↑", value: "price_asc" },
];

interface InventoryItem {
  id: number;
  product_name: string;
  store_location?: string | null;
  price?: number | null;
  retailer?: string | null;
  category?: string | null;
  recommendation?: string | null;
  flip_score?: number | null;
  source_type?: string | null;
  markdown_code?: string | null;
  estimated_profit?: string | null;
  expected_facebook_sale_price?: number | null;
  created_at?: string | null;
}

export default function Inventory() {
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListInventory({
    recommendation: filter !== "all" ? filter : undefined,
  });

  const deleteItem = useDeleteInventoryItem();

  const items: InventoryItem[] = (data ?? []) as InventoryItem[];

  const filtered = items
    .filter(item =>
      search === "" ||
      item.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.store_location?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "score_desc") return (b.flip_score ?? 0) - (a.flip_score ?? 0);
      if (sortBy === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sortBy === "price_asc") return (a.price ?? 0) - (b.price ?? 0);
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    deleteItem.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Deleted", description: `${name} removed from inventory.` });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">Inventory</h2>
          <p className="text-sm text-muted-foreground">Scan decisions become purchases, listings, and real profit tracking from here.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{filtered.length} items</span>
          <Button variant="outline" size="sm" asChild><Link href="/inventory-spreadsheet">Spreadsheet</Link></Button>
          <Button variant="outline" size="sm" asChild><Link href="/accounting-ledger">Ledger</Link></Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "secondary" : "outline"}
              onClick={() => setFilter(f.value)}
              className={filter === f.value ? "bg-primary/10 text-primary border-primary/30" : ""}
            >
              {f.label}
            </Button>
          ))}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-28 h-9">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center p-10 shadow-none border-dashed">
          <p className="text-muted-foreground font-medium">No items found.</p>
          <p className="text-sm text-muted-foreground mt-1">Start scanning to populate your inventory.</p>
          <Button asChild className="mt-4">
            <Link href="/photo-scan">Photo Scan</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold truncate text-sm max-w-[60vw]">{item.product_name}</h3>
                      <RecommendationBadge recommendation={item.recommendation} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {item.store_location && <span>{item.store_location}</span>}
                      {item.price != null && <><span>•</span><span className="font-semibold text-foreground">${item.price}</span></>}
                      <MarkdownCodeBadge code={item.markdown_code} />
                      {item.source_type && <SourceTypeBadge type={item.source_type} />}
                    </div>
                    {item.estimated_profit && (
                      <div className="text-xs text-success font-medium mt-1">Profit: {item.estimated_profit}</div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {item.flip_score != null && (
                      <span className="text-lg font-bold text-muted-foreground">{item.flip_score}</span>
                    )}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-success" asChild title="Record purchase">
                        <Link href={`/accounting-ledger?inventory_item_id=${item.id}`}>
                          <ShoppingCart className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" asChild>
                        <Link href={`/flip-decision/${item.id}`}>
                          <TrendingUp className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" asChild>
                        <Link href={`/listing-generator/${item.id}`}>
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(item.id, item.product_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
