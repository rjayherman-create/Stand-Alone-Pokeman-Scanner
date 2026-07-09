import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListInventoryQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera, Upload, Zap, AlertCircle, Save, FileText, ChevronRight,
  RefreshCw, TrendingUp, AlertTriangle, Search, ShoppingCart,
  CheckCircle2, XCircle, HelpCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const RETAILERS = ["Costco", "Walmart", "Target", "BJ's", "Sam's Club", "Home Depot", "Lowe's", "Other"];
const STORES_BY_RETAILER: Record<string, string[]> = {
  Costco: ["Lawrence", "Oceanside", "Westbury", "Other"],
  Walmart: ["My Local Walmart", "Other"],
  Target: ["My Local Target", "Other"],
  "BJ's": ["My Local BJ's", "Other"],
  "Sam's Club": ["My Local Sam's Club", "Other"],
  "Home Depot": ["My Local Home Depot", "Other"],
  "Lowe's": ["My Local Lowe's", "Other"],
  Other: ["Other"],
};
const CATEGORIES = [
  "LEGO", "Toys", "Tools", "Small Appliances", "Electronics", "Seasonal",
  "Sporting Goods", "Golf", "Baby Gear", "Home Goods", "Furniture",
  "Outdoor / Patio", "Video Games", "Collectibles", "Automotive", "Other",
];

type Recommendation = "BUY" | "MAYBE" | "SKIP" | "RESEARCH_MORE";

interface QuickScanResult {
  success: boolean;
  error_message?: string;
  extracted?: {
    product_name?: string | null;
    brand?: string | null;
    category?: string | null;
    current_store_price?: number | null;
    regular_price?: number | null;
    clearance_price?: number | null;
    percent_off?: number | null;
    markdown_code?: string | null;
    upc?: string | null;
    sku?: string | null;
    dpci?: string | null;
    tcin?: string | null;
    costco_item_number?: string | null;
    model_number?: string | null;
    box_condition?: string | null;
    confidence?: string | null;
  };
  comp_summary?: {
    ebay_active_median?: number | null;
    ebay_sold_median?: number | null;
    ebay_active_low?: number | null;
    ebay_active_high?: number | null;
    ebay_active_count?: number;
    ebay_match_confidence?: number;
    ebay_matched_title?: string | null;
    ebay_matched_url?: string | null;
    ebay_search_method?: string | null;
    ebay_shipping_median?: number | null;
    ebay_available?: boolean;
    ebay_unavailable_reason?: string;
    amazon_available?: boolean;
    estimated_local_facebook_sale_price?: number | null;
    suggested_facebook_list_price?: number | null;
    comp_confidence?: number;
    comp_notes?: string;
  };
  profit_summary?: {
    store_price?: number;
    expected_sale_price?: number | null;
    gross_spread?: number | null;
    estimated_net_profit?: number | null;
    profit_margin_percent?: number | null;
    negotiation_floor?: number | null;
    max_buy_price?: number | null;
    recommended_quantity?: string;
    category_min_profit?: number;
    meets_minimum?: boolean;
  };
  quick_decision?: {
    recommendation: Recommendation;
    confidence_score: number;
    one_sentence_reason: string;
    risk_warning?: string | null;
    max_quantity: string;
    best_next_action: string;
  };
  quick_scan_result_id?: number;
}

interface SessionSummary {
  total: number;
  buy: number;
  maybe: number;
  skip: number;
  research: number;
  totalProfit: number;
  bestItem: string | null;
}

const REC_CONFIG: Record<Recommendation, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; question: string }> = {
  BUY: {
    label: "BUY",
    color: "text-white",
    bg: "bg-green-500",
    border: "border-green-400",
    icon: <ShoppingCart className="h-6 w-6" />,
    question: "Yes — put it in your cart!",
  },
  MAYBE: {
    label: "MAYBE",
    color: "text-white",
    bg: "bg-amber-500",
    border: "border-amber-400",
    icon: <AlertTriangle className="h-6 w-6" />,
    question: "Buy 1 test unit first.",
  },
  SKIP: {
    label: "SKIP",
    color: "text-white",
    bg: "bg-red-500",
    border: "border-red-400",
    icon: <XCircle className="h-6 w-6" />,
    question: "Leave it — not enough margin.",
  },
  RESEARCH_MORE: {
    label: "RESEARCH MORE",
    color: "text-white",
    bg: "bg-blue-500",
    border: "border-blue-400",
    icon: <Search className="h-6 w-6" />,
    question: "Look this up before deciding.",
  },
};

export default function QuickScan() {
  const [retailer, setRetailer] = useState("Costco");
  const [store, setStore] = useState("Lawrence");
  const [category, setCategory] = useState("LEGO");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<QuickScanResult | null>(null);
  const [savedItemId, setSavedItemId] = useState<number | null>(null);
  const [session, setSession] = useState<SessionSummary>({ total: 0, buy: 0, maybe: 0, skip: 0, research: 0, totalProfit: 0, bestItem: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const quickScanMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/quick-scan`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Quick scan failed");
      return response.json() as Promise<QuickScanResult>;
    },
  });

  const saveQuickScanMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await fetch(`/api/save-quick-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Save failed");
      return response.json() as Promise<{ id: number }>;
    },
  });

  function handleRetailerChange(r: string) {
    setRetailer(r);
    const stores = STORES_BY_RETAILER[r] ?? ["Other"];
    setStore(stores[0]);
  }

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setSavedItemId(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  const handleScan = useCallback(async () => {
    if (!file) {
      toast({ title: "No image selected", description: "Take or upload a photo first.", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append("image", file);
    formData.append("retailer", retailer);
    formData.append("store_location", store === "Other" ? "Local Store" : store);
    formData.append("category", category);

    quickScanMutation.mutate(formData, {
      onSuccess: (data) => {
        setResult(data);
        if (data.quick_decision) {
          setSession(prev => {
            const rec = data.quick_decision!.recommendation;
            const profit = data.profit_summary?.estimated_net_profit ?? 0;
            return {
              total: prev.total + 1,
              buy: prev.buy + (rec === "BUY" ? 1 : 0),
              maybe: prev.maybe + (rec === "MAYBE" ? 1 : 0),
              skip: prev.skip + (rec === "SKIP" ? 1 : 0),
              research: prev.research + (rec === "RESEARCH_MORE" ? 1 : 0),
              totalProfit: prev.totalProfit + (rec === "BUY" ? profit : 0),
              bestItem: rec === "BUY" && !prev.bestItem ? (data.extracted?.product_name ?? null) : prev.bestItem,
            };
          });
        }
      },
      onError: () => {
        toast({ title: "Scan failed", description: "Could not process the image. Please try again.", variant: "destructive" });
      },
    });
  }, [file, retailer, store, category, quickScanMutation, toast]);

  function handleScanNext() {
    setResult(null);
    setSavedItemId(null);
    setFile(null);
    setPreview(null);
    fileInputRef.current?.click();
  }

  async function handleSave() {
    if (!result?.extracted) return;
    const ex = result.extracted;
    const comp = result.comp_summary;
    const profit = result.profit_summary;
    const dec = result.quick_decision;

    saveQuickScanMutation.mutate({
      quick_scan_result_id: result.quick_scan_result_id,
      retailer,
      store_location: store,
      product_name: ex.product_name ?? "Unknown Item",
      brand: ex.brand ?? undefined,
      category: ex.category ?? category,
      current_store_price: ex.current_store_price ?? undefined,
      regular_price: ex.regular_price ?? undefined,
      clearance_price: ex.clearance_price ?? undefined,
      percent_off: ex.percent_off ?? undefined,
      upc: ex.upc ?? undefined,
      sku: ex.sku ?? undefined,
      dpci: ex.dpci ?? undefined,
      tcin: ex.tcin ?? undefined,
      costco_item_number: ex.costco_item_number ?? undefined,
      model_number: ex.model_number ?? undefined,
      box_condition: ex.box_condition ?? undefined,
      suggested_facebook_list_price: comp?.suggested_facebook_list_price ?? undefined,
      expected_facebook_sale_price: comp?.estimated_local_facebook_sale_price ?? undefined,
      estimated_profit: profit?.estimated_net_profit ?? undefined,
      recommendation: dec?.recommendation,
      confidence_score: dec?.confidence_score,
      risk_warning: dec?.risk_warning ?? undefined,
      max_quantity: dec?.max_quantity,
    }, {
      onSuccess: (data) => {
        setSavedItemId(data.id);
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Saved to inventory" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  }

  const rec = result?.quick_decision?.recommendation;
  const recConfig = rec ? REC_CONFIG[rec] : null;
  const stores = STORES_BY_RETAILER[retailer] ?? ["Other"];

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-32 md:pb-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Zap className="h-6 w-6" /> Quick Scan
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Scan it. Compare it. Decide fast. <span className="font-semibold text-foreground">Should I put this in my cart right now?</span></p>
      </div>

      {/* Session Summary Strip */}
      {session.total > 0 && (
        <div className="flex gap-2 text-xs font-semibold overflow-x-auto pb-1">
          <span className="bg-muted/50 border border-border rounded-full px-3 py-1 whitespace-nowrap">Trip: {session.total} scans</span>
          {session.buy > 0 && <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 rounded-full px-3 py-1 whitespace-nowrap">BUY ×{session.buy}</span>}
          {session.maybe > 0 && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 rounded-full px-3 py-1 whitespace-nowrap">MAYBE ×{session.maybe}</span>}
          {session.skip > 0 && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 rounded-full px-3 py-1 whitespace-nowrap">SKIP ×{session.skip}</span>}
          {session.research > 0 && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-300 rounded-full px-3 py-1 whitespace-nowrap">RESEARCH ×{session.research}</span>}
          {session.totalProfit > 0 && <span className="bg-primary/10 text-primary border border-primary/30 rounded-full px-3 py-1 whitespace-nowrap">~${session.totalProfit.toFixed(0)} profit</span>}
        </div>
      )}

      {/* Scan Card */}
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* Upload area */}
          <div
            className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center p-6 bg-muted/30 cursor-pointer min-h-[180px] relative overflow-hidden"
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-52 object-contain rounded-lg" />
            ) : (
              <>
                <Camera className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-center">Tap to take a photo or upload</p>
                <p className="text-xs text-muted-foreground mt-1 text-center">Price tag · barcode · clearance sticker · box</p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="mr-2 h-4 w-4" /> Take Photo
            </Button>
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Image
            </Button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {/* Retailer + Store */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retailer</Label>
            <Select value={retailer} onValueChange={handleRetailerChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RETAILERS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Store</Label>
              <Select value={store} onValueChange={setStore}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full text-lg font-bold py-7"
            onClick={handleScan}
            disabled={quickScanMutation.isPending || !file}
          >
            <Zap className="mr-2 h-5 w-5" />
            {quickScanMutation.isPending ? "Scanning + Checking Comps..." : "Quick Scan"}
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {quickScanMutation.isPending && (
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-6 w-3/4" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result Card */}
      <AnimatePresence>
        {result && !quickScanMutation.isPending && recConfig && result.quick_decision && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Card className={`shadow-lg border-2 ${recConfig.border.replace("border-", "border-")}`}>
              <CardContent className="p-5 space-y-5">
                {/* BIG Decision Badge */}
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className={`${recConfig.bg} ${recConfig.color} rounded-2xl p-5 text-center`}
                >
                  <div className="flex items-center justify-center gap-3 mb-1">
                    {recConfig.icon}
                    <span className="text-4xl font-black tracking-tight">{recConfig.label}</span>
                  </div>
                  <p className="text-base font-semibold opacity-90">{recConfig.question}</p>
                  <p className="text-sm opacity-75 mt-1">{result.quick_decision.confidence_score}% confidence</p>
                </motion.div>

                {/* Product Info */}
                <div>
                  <h3 className="text-lg font-bold">{result.extracted?.product_name ?? "Unknown Item"}</h3>
                  <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{retailer}</span>
                    <span>•</span><span>{store}</span>
                    {result.extracted?.brand && <><span>•</span><span>{result.extracted.brand}</span></>}
                    {result.extracted?.box_condition && (
                      <Badge variant="outline" className="text-xs capitalize">{result.extracted.box_condition.replace("_", " ")}</Badge>
                    )}
                  </div>
                  {/* Identifiers */}
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                    {result.extracted?.upc && <span>UPC: {result.extracted.upc}</span>}
                    {result.extracted?.model_number && <span>Model: {result.extracted.model_number}</span>}
                    {result.extracted?.dpci && <span>DPCI: {result.extracted.dpci}</span>}
                    {result.extracted?.costco_item_number && <span>Item#: {result.extracted.costco_item_number}</span>}
                  </div>
                </div>

                {/* Price Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/40 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">Store Price</div>
                    <div className="text-2xl font-black">${result.extracted?.current_store_price?.toFixed(2) ?? result.extracted?.clearance_price?.toFixed(2) ?? "—"}</div>
                    {result.extracted?.regular_price && (
                      <div className="text-xs text-muted-foreground line-through">${result.extracted.regular_price.toFixed(2)} reg.</div>
                    )}
                    {result.extracted?.percent_off && (
                      <div className="text-xs text-green-600 font-bold">{result.extracted.percent_off}% off</div>
                    )}
                  </div>
                  <div className="bg-muted/40 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">FB List Price</div>
                    <div className="text-2xl font-black text-primary">
                      ${result.comp_summary?.suggested_facebook_list_price?.toFixed(0) ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sale: ~${result.comp_summary?.estimated_local_facebook_sale_price?.toFixed(0) ?? "—"}
                    </div>
                  </div>
                  <div className="bg-muted/40 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">Est. Profit</div>
                    <div className={`text-2xl font-black ${(result.profit_summary?.estimated_net_profit ?? 0) > 0 ? "text-green-600" : "text-red-500"}`}>
                      ${result.profit_summary?.estimated_net_profit?.toFixed(0) ?? "—"}
                    </div>
                    {result.profit_summary?.profit_margin_percent && (
                      <div className="text-xs text-muted-foreground">{result.profit_summary.profit_margin_percent}% margin</div>
                    )}
                  </div>
                  <div className="bg-muted/40 border border-border rounded-xl p-3">
                    <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">Buy Qty</div>
                    <div className="text-2xl font-black">{result.quick_decision?.max_quantity}</div>
                    {result.profit_summary?.category_min_profit && (
                      <div className="text-xs text-muted-foreground">Min: ${result.profit_summary.category_min_profit}</div>
                    )}
                  </div>
                </div>

                {/* eBay Ref */}
                {result.comp_summary?.ebay_available && result.comp_summary.ebay_active_median && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">eBay Active</span>
                      <span className="text-xs text-muted-foreground ml-auto">{result.comp_summary.ebay_active_count} listings</span>
                    </div>
                    <div className="text-base font-bold">
                      ${result.comp_summary.ebay_active_low?.toFixed(0) ?? "—"}–${result.comp_summary.ebay_active_high?.toFixed(0) ?? "—"}
                      <span className="text-sm text-muted-foreground font-normal ml-2">median ${result.comp_summary.ebay_active_median.toFixed(0)}</span>
                    </div>
                    {result.comp_summary.ebay_shipping_median !== null && result.comp_summary.ebay_shipping_median !== undefined && result.comp_summary.ebay_shipping_median > 0 && (
                      <div className="text-xs text-muted-foreground">+${result.comp_summary.ebay_shipping_median.toFixed(0)} avg shipping</div>
                    )}
                  </div>
                )}

                {!result.comp_summary?.ebay_available && (
                  <div className="bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">eBay data unavailable</span> — {result.comp_summary?.ebay_unavailable_reason ?? "No eBay API configured."}
                      <span className="block mt-0.5 text-muted-foreground">Decision based on store price, category rules, and markdown analysis.</span>
                    </div>
                  </div>
                )}

                {/* Reason + Risk */}
                <div className="space-y-2">
                  <div className="text-sm font-medium bg-card border border-border rounded-xl p-3">
                    <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide block mb-1">Reason</span>
                    {result.quick_decision.one_sentence_reason}
                  </div>
                  {result.quick_decision.risk_warning && (
                    <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-amber-800 dark:text-amber-200 flex gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      {result.quick_decision.risk_warning}
                    </div>
                  )}
                  <div className="text-xs text-primary bg-primary/5 border border-primary/20 rounded-xl p-3 font-medium">
                    → {result.quick_decision.best_next_action}
                  </div>
                </div>

                {/* Amazon notice */}
                <div className="text-xs text-muted-foreground bg-muted/20 rounded-xl p-3 flex gap-2">
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  Amazon data source not connected. Use eBay comps and manual Amazon price if needed.
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {!savedItemId ? (
                    <Button
                      className="col-span-1"
                      onClick={handleSave}
                      disabled={saveQuickScanMutation.isPending}
                    >
                      <Save className="mr-1 h-4 w-4" />
                      {saveQuickScanMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="col-span-1" asChild>
                      <Link href={`/listing-generator/${savedItemId}`}>
                        <FileText className="mr-1 h-4 w-4" /> Listing
                      </Link>
                    </Button>
                  )}

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="col-span-1">
                        <ChevronRight className="mr-1 h-4 w-4" /> Compare Details
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Comp Details — {result.extracted?.product_name ?? "Item"}</SheetTitle>
                      </SheetHeader>
                      <div className="space-y-6 mt-4">
                        {/* eBay Detail */}
                        <div>
                          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-500" /> eBay
                          </h4>
                          {result.comp_summary?.ebay_available ? (
                            <div className="space-y-2 text-sm">
                              {result.comp_summary.ebay_matched_title && (
                                <div className="p-3 bg-muted/30 rounded-lg">
                                  <span className="text-xs text-muted-foreground block mb-1">Matched Title</span>
                                  <span className="font-medium">{result.comp_summary.ebay_matched_title}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Active Count</span><span className="font-bold">{result.comp_summary.ebay_active_count}</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Active Median</span><span className="font-bold">${result.comp_summary.ebay_active_median?.toFixed(2) ?? "—"}</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Active Low</span><span className="font-bold">${result.comp_summary.ebay_active_low?.toFixed(2) ?? "—"}</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Active High</span><span className="font-bold">${result.comp_summary.ebay_active_high?.toFixed(2) ?? "—"}</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Sold Median</span><span className="font-bold">{result.comp_summary.ebay_sold_median ? `$${result.comp_summary.ebay_sold_median.toFixed(2)}` : "N/A"}</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Avg Shipping</span><span className="font-bold">{result.comp_summary.ebay_shipping_median ? `$${result.comp_summary.ebay_shipping_median.toFixed(2)}` : "Free/varies"}</span></div>
                              </div>
                              <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-lg">
                                Match: {result.comp_summary.ebay_match_confidence}% confidence via {result.comp_summary.ebay_search_method ?? "title"}
                              </div>
                              {result.comp_summary.ebay_matched_url && (
                                <a href={result.comp_summary.ebay_matched_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all block">View on eBay ↗</a>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
                              {result.comp_summary?.ebay_unavailable_reason ?? "eBay data not available for this item."}
                            </div>
                          )}
                        </div>

                        {/* Amazon Detail */}
                        <div>
                          <h4 className="font-bold text-sm mb-3">Amazon</h4>
                          <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
                            Amazon data source not connected. Set KEEPA_API_KEY or AMAZON_API_ENABLED to enable. Use as reference only — do not sell on Amazon without approval.
                          </div>
                        </div>

                        {/* Facebook Marketplace */}
                        <div>
                          <h4 className="font-bold text-sm mb-3">Facebook Marketplace</h4>
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">List Price</span><span className="font-bold">${result.comp_summary?.suggested_facebook_list_price?.toFixed(0) ?? "—"}</span></div>
                              <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Expected Sale</span><span className="font-bold">${result.comp_summary?.estimated_local_facebook_sale_price?.toFixed(0) ?? "—"}</span></div>
                              <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Floor Price</span><span className="font-bold">${result.profit_summary?.negotiation_floor?.toFixed(0) ?? "—"}</span></div>
                              <div className="p-3 bg-muted/30 rounded-lg"><span className="text-xs text-muted-foreground block">Max Buy Price</span><span className="font-bold">${result.profit_summary?.max_buy_price?.toFixed(0) ?? "—"}</span></div>
                            </div>
                            <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-lg">
                              Local pickup, cash/Venmo. No platform fee, no shipping cost. Floor = minimum acceptable offer.
                            </div>
                          </div>
                        </div>

                        {/* Profit Detail */}
                        <div>
                          <h4 className="font-bold text-sm mb-3">Profit Breakdown</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between py-2 border-b border-border"><span>Store Price</span><span className="font-bold">${result.profit_summary?.store_price?.toFixed(2) ?? "—"}</span></div>
                            <div className="flex justify-between py-2 border-b border-border"><span>Expected Sale</span><span className="font-bold">${result.profit_summary?.expected_sale_price?.toFixed(2) ?? "—"}</span></div>
                            <div className="flex justify-between py-2 border-b border-border"><span>Platform Fee (FB)</span><span className="font-bold text-green-600">$0</span></div>
                            <div className="flex justify-between py-2 border-b border-border"><span>Shipping</span><span className="font-bold text-green-600">$0 (local)</span></div>
                            <div className="flex justify-between py-2 font-bold text-base"><span>Est. Net Profit</span><span className={`${(result.profit_summary?.estimated_net_profit ?? 0) > 0 ? "text-green-600" : "text-red-500"}`}>${result.profit_summary?.estimated_net_profit?.toFixed(2) ?? "—"}</span></div>
                            <div className="flex justify-between py-1 text-xs text-muted-foreground"><span>Minimum for {result.extracted?.category ?? category}</span><span>${result.profit_summary?.category_min_profit}</span></div>
                            <div className="flex justify-between py-1 text-xs"><span>Meets Minimum</span><span>{result.profit_summary?.meets_minimum ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" /> : <XCircle className="h-4 w-4 text-red-500 inline" />}</span></div>
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>

                  <Button variant="default" className="col-span-2 font-bold" onClick={handleScanNext}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Scan Next Item
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Error card */}
        {result && !result.success && !quickScanMutation.isPending && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Search className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-blue-800 dark:text-blue-200 text-lg">RESEARCH MORE</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.error_message ?? "Product identity or price could not be determined."}</p>
                    <p className="text-xs text-muted-foreground mt-2">Try scanning the barcode, model number label, or front of the box.</p>
                    <Button size="sm" className="mt-3" onClick={handleScanNext}><RefreshCw className="mr-1 h-3 w-3" /> Try Again</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session End Summary (show when trip has items) */}
      {session.total >= 3 && (
        <Card className="shadow-sm bg-muted/20 border-border">
          <CardContent className="p-4">
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Trip Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 rounded-lg bg-card border border-border"><span className="text-xs text-muted-foreground block">Total Scanned</span><span className="font-bold text-lg">{session.total}</span></div>
              <div className="p-2 rounded-lg bg-card border border-border"><span className="text-xs text-muted-foreground block">Est. Trip Profit</span><span className="font-bold text-lg text-green-600">${session.totalProfit.toFixed(0)}</span></div>
            </div>
            {session.bestItem && (
              <p className="text-xs text-muted-foreground mt-2">Best item: <span className="font-semibold">{session.bestItem}</span></p>
            )}
            <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
              <Link href="/inventory">View Saved Items</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
