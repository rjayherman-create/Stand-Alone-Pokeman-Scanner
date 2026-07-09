import { useListInventory, useScoreItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecommendationBadge, MarkdownCodeBadge, SourceTypeBadge } from "@/components/shared/badges";
import { AlertCircle, TrendingUp, ArrowLeft, FileText, Bookmark, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface FlipDecision {
  flip_score: number;
  recommendation: string;
  main_reason?: string;
  facebook_list_price?: number;
  expected_sale_price?: string;
  estimated_profit?: string;
  max_quantity?: string;
  negotiation_floor?: number;
  risk_notes?: string;
  storage_notes?: string;
  best_next_action?: string;
}

interface InventoryItem {
  id: number;
  product_name: string;
  store_location?: string | null;
  price?: number | null;
  markdown_code?: string | null;
  stock_status?: string | null;
  source_type?: string | null;
  category?: string | null;
  visible_brand?: string | null;
  flip_score?: number | null;
  recommendation?: string | null;
  facebook_list_price?: number | null;
  expected_sale_price?: string | null;
  estimated_profit?: string | null;
  max_quantity?: string | null;
  risk_notes?: string | null;
  storage_notes?: string | null;
  notes_from_image?: string | null;
  created_at?: string | null;
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? "bg-success" : score >= 55 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">Flip Score</span>
        <span className="text-3xl font-bold">{score}/100</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>SKIP (&lt;55)</span>
        <span>MAYBE (55-74)</span>
        <span>BUY (75+)</span>
      </div>
    </div>
  );
}

export default function FlipDecision() {
  const params = useParams<{ itemId: string }>();
  const itemId = parseInt(params.itemId ?? "0");
  const { data: allItems, isLoading, isError } = useListInventory();
  const [liveDecision, setLiveDecision] = useState<FlipDecision | null>(null);
  const scoreItem = useScoreItem();
  const { toast } = useToast();

  const item = (allItems as unknown as InventoryItem[] | undefined)?.find(i => i.id === itemId);

  useEffect(() => {
    if (item && !liveDecision) {
      if (item.flip_score != null && item.recommendation) {
        setLiveDecision({
          flip_score: item.flip_score,
          recommendation: item.recommendation,
          facebook_list_price: item.facebook_list_price ?? undefined,
          expected_sale_price: item.expected_sale_price ?? undefined,
          estimated_profit: item.estimated_profit ?? undefined,
          max_quantity: item.max_quantity ?? undefined,
          risk_notes: item.risk_notes ?? undefined,
          storage_notes: item.storage_notes ?? undefined,
        });
      } else if (item.price) {
        scoreItem.mutate({
          data: {
            product_name: item.product_name,
            price: item.price,
            markdown_code: item.markdown_code ?? undefined,
            category: item.category ?? undefined,
            stock_status: item.stock_status ?? undefined,
            visible_brand: item.visible_brand ?? undefined,
          }
        }, {
          onSuccess: (d) => setLiveDecision(d as unknown as FlipDecision),
          onError: () => toast({ title: "Scoring error", description: "Could not score this item.", variant: "destructive" }),
        });
      }
    }
  }, [item]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || (!isLoading && !item)) {
    return (
      <div className="max-w-2xl mx-auto text-center p-8">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="font-bold text-lg">Item not found</h2>
        <Button className="mt-4" asChild><Link href="/inventory">Back to Inventory</Link></Button>
      </div>
    );
  }

  if (!item) return null;

  const decision = liveDecision;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-xl font-bold text-primary">Flip Decision</h2>
      </div>

      {/* Item Header */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-base leading-tight">{item.product_name}</h3>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-muted-foreground">
                {item.store_location && <span>{item.store_location}</span>}
                {item.source_type && <SourceTypeBadge type={item.source_type} />}
                {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
              </div>
            </div>
            {decision && <RecommendationBadge recommendation={decision.recommendation} />}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {item.price != null && (
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground">Costco Price</div>
                <div className="font-bold text-lg">${item.price}</div>
              </div>
            )}
            <MarkdownCodeBadge code={item.markdown_code} />
          </div>
        </CardContent>
      </Card>

      {/* Decision Card */}
      {scoreItem.isPending && !decision && (
        <Card><CardContent className="p-6"><Skeleton className="h-32" /></CardContent></Card>
      )}

      {decision && (
        <Card className={`shadow-md border-2 ${
          decision.recommendation === "BUY" ? "border-success/40 bg-success/5" :
          decision.recommendation === "MAYBE" ? "border-warning/40 bg-warning/5" :
          "border-destructive/40 bg-destructive/5"
        }`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Decision Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ScoreGauge score={decision.flip_score} />

            {decision.main_reason && (
              <p className="text-sm text-muted-foreground border-l-4 border-primary/30 pl-3">{decision.main_reason}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase font-semibold mb-1">List Price</div>
                <div className="font-bold text-xl text-primary">${decision.facebook_list_price ?? "—"}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase font-semibold mb-1">Floor Price</div>
                <div className="font-bold text-xl">${decision.negotiation_floor ?? "—"}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase font-semibold mb-1">Expected Sale</div>
                <div className="font-semibold">{decision.expected_sale_price ?? "—"}</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase font-semibold mb-1">Est. Profit</div>
                <div className="font-semibold text-success">{decision.estimated_profit ?? "—"}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Quantity to Buy</p>
                <p className="text-sm font-medium">{decision.max_quantity ?? "—"}</p>
              </div>

              {decision.risk_notes && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Risk</p>
                  <p className="text-sm">{decision.risk_notes}</p>
                </div>
              )}

              {decision.storage_notes && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Storage</p>
                  <p className="text-sm">{decision.storage_notes}</p>
                </div>
              )}

              {decision.best_next_action && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary uppercase mb-1">Best Next Action</p>
                  <p className="text-sm font-medium">{decision.best_next_action}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button asChild>
                <Link href={`/listing-generator/${item.id}`}>
                  <FileText className="mr-2 h-4 w-4" /> Generate Listing
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/comp-details/${item.id}`}>
                  <Search className="mr-2 h-4 w-4" /> Comp Details
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/manual-comp-entry/${item.id}`}>
                  <TrendingUp className="mr-2 h-4 w-4" /> Manual Comps
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/watchlist">
                  <Bookmark className="mr-2 h-4 w-4" /> Watchlist
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
