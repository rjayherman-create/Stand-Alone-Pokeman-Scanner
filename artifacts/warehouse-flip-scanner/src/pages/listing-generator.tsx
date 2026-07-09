import { useState, useEffect } from "react";
import { useListInventory, useGenerateListing } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileText, Copy, RefreshCw, ArrowLeft, CheckCircle } from "lucide-react";
import { Link, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface InventoryItem {
  id: number;
  product_name: string;
  store_location?: string | null;
  price?: number | null;
  recommendation?: string | null;
  flip_score?: number | null;
  expected_sale_price?: string | null;
  estimated_profit?: string | null;
  facebook_list_price?: number | null;
  item_number?: string | null;
  category?: string | null;
  negotiation_floor?: number | null;
}

interface FacebookListing {
  title: string;
  asking_price: number;
  description: string;
  bundle_offer?: string | null;
  pickup_text?: string | null;
  negotiation_floor?: number | null;
  keywords?: string[];
}

export default function ListingGenerator() {
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId ? parseInt(params.itemId, 10) : null;
  const { data: allItems, isLoading, isError } = useListInventory();
  const [listing, setListing] = useState<FacebookListing | null>(null);
  const [editedText, setEditedText] = useState("");
  const [copied, setCopied] = useState(false);
  const generateListing = useGenerateListing();
  const { toast } = useToast();

  const items = (allItems as unknown as InventoryItem[] | undefined) ?? [];
  const item = itemId ? items.find(i => i.id === itemId) : undefined;

  useEffect(() => {
    if (item && !listing) {
      doGenerate(item);
    }
  }, [item]);

  function doGenerate(it: InventoryItem) {
    generateListing.mutate({
      data: {
        product_name: it.product_name,
        item_number: it.item_number ?? undefined,
        price: it.price ?? 0,
        facebook_list_price: it.facebook_list_price ?? undefined,
        expected_sale_price: it.expected_sale_price ?? undefined,
        category: it.category ?? undefined,
        store_location: it.store_location ?? undefined,
        negotiation_floor: it.negotiation_floor ?? undefined,
      }
    }, {
      onSuccess: (d) => {
        const result = d as unknown as FacebookListing;
        setListing(result);
        setEditedText(buildListingText(result));
      },
      onError: () => toast({ title: "Generation failed", description: "Could not generate listing. Try again.", variant: "destructive" }),
    });
  }

  function handleRegenerate() {
    if (item) doGenerate(item);
  }

  function buildListingText(r: FacebookListing): string {
    const parts: string[] = [];
    if (r.title) parts.push(r.title);
    if (r.description) parts.push("\n" + r.description);
    if (r.asking_price) parts.push(`\nPrice: $${r.asking_price}`);
    if (r.negotiation_floor) parts.push(`Floor: $${r.negotiation_floor}`);
    if (r.pickup_text) parts.push("\n" + r.pickup_text);
    if (r.bundle_offer) parts.push("\n" + r.bundle_offer);
    if (r.keywords?.length) parts.push("\n" + r.keywords.map(k => `#${k}`).join(" "));
    return parts.join("\n").trim();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast({ title: "Copied!", description: "Listing text copied to clipboard." });
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto text-center p-8">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="font-bold text-lg">Could not load inventory</h2>
        <Button className="mt-4" asChild><Link href="/inventory">Back to Inventory</Link></Button>
      </div>
    );
  }

  if (!itemId) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-primary">Listing Generator</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose an inventory item to generate a Marketplace listing.</p>
        </div>

        {items.length > 0 ? (
          <Card className="shadow-sm">
            <CardContent className="p-0 divide-y divide-border">
              {items.slice(0, 12).map((inventoryItem) => (
                <Link key={inventoryItem.id} href={`/listing-generator/${inventoryItem.id}`}>
                  <div className="p-4 flex items-center justify-between gap-4 hover:bg-muted/40 cursor-pointer transition-colors">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{inventoryItem.product_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {inventoryItem.retailer ?? "Costco"} - {inventoryItem.store_location ?? "Unknown store"} - ${inventoryItem.price ?? "-"}
                      </p>
                    </div>
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-8 text-center space-y-4">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
              <div>
                <h3 className="font-bold">No inventory items yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Add or scan an item first, then generate its listing.</p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-2">
                <Button asChild><Link href="/quick-scan">Quick Scan</Link></Button>
                <Button variant="outline" asChild><Link href="/manual-add">Manual Add</Link></Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto text-center p-8">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="font-bold text-lg">Item not found</h2>
        <Button className="mt-4" asChild><Link href="/inventory">Back to Inventory</Link></Button>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/flip-decision/${item.id}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-xl font-bold text-primary">Listing Generator</h2>
      </div>

      {/* Item Summary */}
      <Card className="shadow-sm bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold leading-tight">{item.product_name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Costco: ${item.price} → FB: ${item.facebook_list_price ?? "—"} • Profit: {item.estimated_profit ?? "—"}
              </p>
            </div>
            {item.recommendation && (
              <span className={`text-sm font-bold px-2 py-1 rounded ${
                item.recommendation === "BUY" ? "bg-success/10 text-success" :
                item.recommendation === "MAYBE" ? "bg-warning/10 text-warning" :
                "bg-destructive/10 text-destructive"
              }`}>{item.recommendation}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generating skeleton */}
      {generateListing.isPending && (
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Generating AI listing...
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      )}

      {listing && !generateListing.isPending && (
        <>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Facebook Marketplace Listing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                className="font-mono text-sm resize-none min-h-[220px]"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" onClick={handleCopy}>
                  {copied ? <><CheckCircle className="mr-2 h-4 w-4" /> Copied!</> : <><Copy className="mr-2 h-4 w-4" /> Copy Listing</>}
                </Button>
                <Button variant="outline" className="w-full" onClick={handleRegenerate} disabled={generateListing.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {listing.asking_price && (
                  <div><p className="text-xs text-muted-foreground uppercase font-semibold">Asking Price</p><p className="font-bold text-lg text-primary">${listing.asking_price}</p></div>
                )}
                {listing.negotiation_floor && (
                  <div><p className="text-xs text-muted-foreground uppercase font-semibold">Floor Price</p><p className="font-medium">${listing.negotiation_floor}</p></div>
                )}
              </div>

              {listing.pickup_text && (
                <div className="bg-primary/5 rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary uppercase mb-1">Pickup Details</p>
                  <p className="text-sm">{listing.pickup_text}</p>
                </div>
              )}

              {listing.bundle_offer && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Bundle Offer</p>
                  <p className="text-sm">{listing.bundle_offer}</p>
                </div>
              )}

              {listing.keywords && listing.keywords.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {listing.keywords.map(k => (
                      <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">#{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
