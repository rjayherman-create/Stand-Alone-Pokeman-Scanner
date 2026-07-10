import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, HTMLAttributes, RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  BookmarkPlus,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  LocateFixed,
  MapPin,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getGetDashboardSummaryQueryKey, getListInventoryQueryKey } from "@workspace/api-client-react";

const PLACE_TYPES = ["Goodwill", "Salvation Army", "Savers", "Habitat ReStore", "Thrift store", "Pawn shop", "Antique store", "Estate sale", "Flea market", "Garage sale", "Other"];
const CONDITIONS = ["New sealed", "New open box", "Used good", "Used fair", "For parts / unknown"];
const CATEGORIES = ["Golf", "Tools", "Electronics", "Audio Gear", "Video / Lighting Gear", "Cameras", "Musical Instruments", "Sports Gear", "Collectibles", "Toys", "Books / Media", "Furniture", "Appliances", "Home Goods", "Silverware / Metals", "Jewelry / Watches", "Designer / Clothing", "Other"];
const GPS_MODES = [
  { value: "address", label: "Store/address only" },
  { value: "exact", label: "Save exact GPS" },
  { value: "approximate", label: "Approximate GPS" },
  { value: "none", label: "Do not save GPS" },
];
const THRIFT_STEPS = [
  { id: "location", label: "Location" },
  { id: "photos", label: "Photos" },
  { id: "details", label: "Details" },
  { id: "lookup", label: "Lookup" },
  { id: "save", label: "Save" },
] as const;

type ThriftStep = typeof THRIFT_STEPS[number]["id"];

type Decision = {
  recommendation: "BUY" | "MAYBE" | "SKIP" | "RESEARCH_MORE";
  product_name: string;
  brand?: string | null;
  model_number?: string | null;
  ebay_sold_range?: string | null;
  ebay_active_range?: string | null;
  expected_facebook_sale_price?: number | null;
  suggested_list_price?: number | null;
  max_buy_price?: number | null;
  estimated_profit?: number | null;
  suggested_channel?: string | null;
  confidence_score?: number | null;
  risk_notes?: string | null;
  one_sentence_reason?: string | null;
};

type FormState = {
  session_id?: number;
  store_name: string;
  store_address: string;
  city: string;
  state: string;
  zip: string;
  gps_latitude: string;
  gps_longitude: string;
  timezone: string;
  user_confirmed_location: boolean;
  save_gps_mode: string;
  scan_timestamp: string;
  scan_id: string;
  product_name: string;
  brand: string;
  model_number: string;
  serial_number: string;
  asking_price: string;
  negotiated_price: string;
  quantity: string;
  condition: string;
  category: string;
  visible_damage: string;
  missing_parts: string;
  included_accessories: string;
  user_notes: string;
};

const initialForm: FormState = {
  store_name: "",
  store_address: "",
  city: "",
  state: "",
  zip: "",
  gps_latitude: "",
  gps_longitude: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  user_confirmed_location: false,
  save_gps_mode: "address",
  scan_timestamp: new Date().toISOString(),
  scan_id: makeScanId(),
  product_name: "",
  brand: "",
  model_number: "",
  serial_number: "",
  asking_price: "",
  negotiated_price: "",
  quantity: "1",
  condition: "Used good",
  category: "Other",
  visible_damage: "",
  missing_parts: "",
  included_accessories: "",
  user_notes: "",
};

function makeScanId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `TS-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function money(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "Not set";
}

function stampTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function recTone(rec?: Decision["recommendation"]) {
  if (rec === "BUY") return { icon: CheckCircle2, className: "bg-green-500 text-white", label: "BUY" };
  if (rec === "MAYBE") return { icon: AlertTriangle, className: "bg-amber-500 text-white", label: "MAYBE" };
  if (rec === "SKIP") return { icon: XCircle, className: "bg-red-500 text-white", label: "SKIP" };
  return { icon: Search, className: "bg-blue-500 text-white", label: "RESEARCH MORE" };
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function createStampedImage(sourceUrl: string, form: FormState) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceUrl;
  });
  const canvas = document.createElement("canvas");
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / image.width);
  canvas.width = Math.max(320, Math.round(image.width * scale));
  canvas.height = Math.max(320, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const lines = [
    form.store_name || "Unknown thrift location",
    [form.store_address, form.city, form.state].filter(Boolean).join(", "),
    stampTime(form.scan_timestamp),
    `Price: $${form.negotiated_price || form.asking_price || "0.00"}`,
    `Scan ID: ${form.scan_id}`,
    form.save_gps_mode === "exact" && form.gps_latitude && form.gps_longitude ? `${form.gps_latitude}, ${form.gps_longitude}` : "Retail Flip Scanner",
  ].filter(Boolean);
  const padding = Math.max(14, Math.round(canvas.width * 0.025));
  const fontSize = Math.max(16, Math.round(canvas.width * 0.03));
  const lineHeight = Math.round(fontSize * 1.35);
  const overlayHeight = padding * 2 + lines.length * lineHeight;
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${fontSize}px Arial, sans-serif`;
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, canvas.height - overlayHeight + padding + lineHeight * (index + 0.75), canvas.width - padding * 2);
  });
  return canvas.toDataURL("image/jpeg", 0.86);
}

export default function ThriftScanPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [activeStep, setActiveStep] = useState<ThriftStep>("location");
  const [locationMessage, setLocationMessage] = useState("Location found, but store name was not detected. Enter store name manually.");
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);
  const [stampedPhoto, setStampedPhoto] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [savedInventoryId, setSavedInventoryId] = useState<number | null>(null);
  const [lastThriftItemId, setLastThriftItemId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const payload = useMemo(() => {
    const gps = gpsForMode(form);
    return {
      ...form,
      ...gps,
      asking_price: form.asking_price ? Number(form.asking_price) : undefined,
      negotiated_price: form.negotiated_price ? Number(form.negotiated_price) : undefined,
      quantity: Number(form.quantity || 1),
      original_photo_url: originalPhoto,
      stamped_photo_url: stampedPhoto,
      full_item_photo_url: originalPhoto,
      price_tag_photo_url: originalPhoto,
    };
  }, [form, originalPhoto, stampedPhoto]);

  const startSession = useMutation({
    mutationFn: () => postJson<{ session: { id: number } }>("/api/thrift-scan/start", payload),
    onSuccess: (data) => {
      setForm((prev) => ({ ...prev, session_id: data.session.id, user_confirmed_location: true }));
      setActiveStep("photos");
      toast({ title: "Location saved", description: "Thrift scan session started." });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: () => postJson<{ decision: Decision }>("/api/thrift-scan/decision", payload),
    onSuccess: (data) => {
      setDecision(data.decision);
      setActiveStep("lookup");
      setForm((prev) => ({
        ...prev,
        product_name: prev.product_name || data.decision.product_name || "",
        brand: prev.brand || data.decision.brand || "",
        model_number: prev.model_number || data.decision.model_number || "",
        category: prev.category === "Other" && data.decision.product_name ? prev.category : prev.category,
      }));
    },
  });

  const saveInventory = useMutation({
    mutationFn: () => postJson<{ item: { id: number }; inventory_item: { id: number } }>("/api/thrift-scan/save-to-inventory", payload),
    onSuccess: (data) => {
      setLastThriftItemId(data.item.id);
      setSavedInventoryId(data.inventory_item.id);
      setActiveStep("save");
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      toast({ title: "Saved to spreadsheet", description: "Thrift scan evidence and decision were added to inventory." });
    },
  });

  const addWatchlist = useMutation({
    mutationFn: () => postJson("/api/thrift-scan/add-to-watchlist", { ...payload, thrift_scan_item_id: lastThriftItemId ?? undefined }),
    onSuccess: () => toast({ title: "Added to watchlist", description: "This thrift find is queued for follow-up." }),
  });

  const recordPurchase = useMutation({
    mutationFn: () => postJson<{ item: { id: number }; inventory_item: { id: number } }>("/api/thrift-scan/record-purchase", { ...payload, thrift_scan_item_id: lastThriftItemId ?? undefined }),
    onSuccess: (data) => {
      setLastThriftItemId(data.item.id);
      setSavedInventoryId(data.inventory_item.id);
      setActiveStep("save");
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      toast({ title: "Purchase recorded", description: "The item was added to inventory and the accounting ledger." });
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast({ title: "GPS unavailable", description: "Enter the store name and address manually.", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          gps_latitude: String(Number(position.coords.latitude.toFixed(6))),
          gps_longitude: String(Number(position.coords.longitude.toFixed(6))),
          scan_timestamp: new Date().toISOString(),
          scan_id: makeScanId(),
        }));
        setLocationMessage("GPS captured. Pick a likely place type or enter the store name and address.");
      },
      () => {
        toast({ title: "Location permission not granted", description: "Manual store/address entry is still available.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handlePhoto(file: File) {
    const original = await fileToDataUrl(file);
    setOriginalPhoto(original);
    const stamped = await createStampedImage(original, form);
    setStampedPhoto(stamped);
    setActiveStep("details");
    await postJson("/api/thrift-scan/photo", {
      scan_id: form.scan_id,
      photo_type: "full_item_photo",
      original_photo_url: original,
      stamped_photo_url: stamped,
    });
  }

  function scanNext() {
    setForm((prev) => ({
      ...initialForm,
      session_id: prev.session_id,
      store_name: prev.store_name,
      store_address: prev.store_address,
      city: prev.city,
      state: prev.state,
      zip: prev.zip,
      gps_latitude: prev.gps_latitude,
      gps_longitude: prev.gps_longitude,
      timezone: prev.timezone,
      user_confirmed_location: prev.user_confirmed_location,
      save_gps_mode: prev.save_gps_mode,
      scan_timestamp: new Date().toISOString(),
      scan_id: makeScanId(),
    }));
    setOriginalPhoto(null);
    setStampedPhoto(null);
    setDecision(null);
    setSavedInventoryId(null);
    setLastThriftItemId(null);
    setActiveStep("photos");
  }

  const tone = recTone(decision?.recommendation);
  const RecIcon = tone.icon;
  const stepClass = (step: ThriftStep | ThriftStep[]) => {
    const steps = Array.isArray(step) ? step : [step];
    return steps.includes(activeStep) ? "block" : "hidden md:block";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Thrift Scan</h2>
          <p className="text-sm text-muted-foreground">Capture where, when, price, photo evidence, and resale decision for secondhand finds.</p>
        </div>
        <Button size="lg" onClick={() => decisionMutation.mutate()} disabled={decisionMutation.isPending}>
          {decisionMutation.isPending ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
          Lookup
        </Button>
      </div>

      <ThriftStepBar activeStep={activeStep} onStep={setActiveStep} />

      <div className={stepClass("location")}>
        <LocationCaptureCard
          form={form}
          update={update}
          message={locationMessage}
          onLocate={useCurrentLocation}
          onStart={() => startSession.mutate()}
          pending={startSession.isPending}
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_0.95fr] gap-4">
        <div className="space-y-4">
          <div className={stepClass("photos")}>
            <ThriftPhotoCapture
              originalPhoto={originalPhoto}
              stampedPhoto={stampedPhoto}
              fileRef={fileRef}
              priceRef={priceRef}
              modelRef={modelRef}
              onPhoto={handlePhoto}
            />
          </div>
          <div className={stepClass("details")}>
            <ThriftConditionForm form={form} update={update} />
          </div>
        </div>

        <div className="space-y-4">
          <Card className={`shadow-sm ${stepClass("details")}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Item Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <TextField label="Product name" value={form.product_name} onChange={(value) => update("product_name", value)} placeholder="Mackie 1402-VLZ Pro Mixer" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Brand" value={form.brand} onChange={(value) => update("brand", value)} placeholder="Mackie" />
                <TextField label="Model" value={form.model_number} onChange={(value) => update("model_number", value)} placeholder="1402-VLZ" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MoneyField label="Asking price" value={form.asking_price} onChange={(value) => update("asking_price", value)} />
                <MoneyField label="Negotiated" value={form.negotiated_price} onChange={(value) => update("negotiated_price", value)} />
                <TextField label="Qty" value={form.quantity} onChange={(value) => update("quantity", value)} inputMode="numeric" />
              </div>
              <TextField label="Serial number" value={form.serial_number} onChange={(value) => update("serial_number", value)} />
              <Button onClick={() => decisionMutation.mutate()} disabled={decisionMutation.isPending}>
                {decisionMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Lookup Decision
              </Button>
            </CardContent>
          </Card>

          <div className={stepClass(["lookup", "save"])}>
            {decision ? <ThriftDecisionCard decision={decision} tone={tone} RecIcon={RecIcon} form={form} /> : (
              <Card className="shadow-sm border-dashed">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  Add a price, photo, and any brand/model hints, then tap Lookup for BUY / MAYBE / SKIP / RESEARCH MORE.
                </CardContent>
              </Card>
            )}
          </div>

          <div className={stepClass(["lookup", "save"])}>
            <ThriftActions
              savedInventoryId={savedInventoryId}
              onSave={() => saveInventory.mutate()}
              onWatchlist={() => addWatchlist.mutate()}
              onPurchase={() => recordPurchase.mutate()}
              onScanNext={scanNext}
              busy={saveInventory.isPending || addWatchlist.isPending || recordPurchase.isPending}
            />
          </div>
        </div>
      </div>

      <Card className="border-warning/30 bg-warning/5 shadow-sm">
        <CardContent className="p-4 flex gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-warning shrink-0" />
          <p>Location, timestamp, and stamped photos are for personal resale tracking and organization. They do not guarantee item authenticity, condition, or legal proof of purchase.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ThriftStepBar({ activeStep, onStep }: { activeStep: ThriftStep; onStep: (step: ThriftStep) => void }) {
  const activeIndex = THRIFT_STEPS.findIndex((step) => step.id === activeStep);
  return (
    <Card className="shadow-sm md:border-primary/20">
      <CardContent className="p-3">
        <div className="grid grid-cols-5 gap-1">
          {THRIFT_STEPS.map((step, index) => {
            const active = step.id === activeStep;
            const complete = index < activeIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onStep(step.id)}
                className={`rounded-md px-2 py-2 text-[11px] font-semibold transition-colors ${
                  active ? "bg-primary text-primary-foreground" : complete ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="block text-sm">{index + 1}</span>
                {step.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function gpsForMode(form: FormState) {
  if (form.save_gps_mode === "none" || form.save_gps_mode === "address") return { gps_latitude: undefined, gps_longitude: undefined };
  const lat = Number(form.gps_latitude);
  const lng = Number(form.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { gps_latitude: undefined, gps_longitude: undefined };
  if (form.save_gps_mode === "approximate") {
    return { gps_latitude: Number(lat.toFixed(2)), gps_longitude: Number(lng.toFixed(2)) };
  }
  return { gps_latitude: lat, gps_longitude: lng };
}

function LocationCaptureCard({ form, update, message, onLocate, onStart, pending }: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  message: string;
  onLocate: () => void;
  onStart: () => void;
  pending: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Confirm Store / Location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <TextField label="Store name" value={form.store_name} onChange={(value) => update("store_name", value)} placeholder="Goodwill Oceanside" />
          <TextField label="Address" value={form.store_address} onChange={(value) => update("store_address", value)} placeholder="3161 Long Beach Rd" />
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full h-10" onClick={onLocate}><LocateFixed className="mr-2 h-4 w-4" /> GPS</Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="City" value={form.city} onChange={(value) => update("city", value)} />
          <TextField label="State" value={form.state} onChange={(value) => update("state", value)} />
          <TextField label="Zip" value={form.zip} onChange={(value) => update("zip", value)} />
        </div>
        <StoreConfirmSelector form={form} update={update} />
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {message}
            {form.gps_latitude && form.gps_longitude ? <span className="block mt-1">GPS captured: {form.gps_latitude}, {form.gps_longitude}</span> : null}
          </div>
          <Button onClick={onStart} disabled={pending} className="h-full min-h-11">
            {pending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Use This Store
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StoreConfirmSelector({ form, update }: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <div>
        <Label>Nearby likely store</Label>
        <Select value={PLACE_TYPES.includes(form.store_name) ? form.store_name : "Other"} onValueChange={(value) => update("store_name", value === "Other" ? "" : value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PLACE_TYPES.map((place) => <SelectItem key={place} value={place}>{place}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>GPS saving</Label>
        <Select value={form.save_gps_mode} onValueChange={(value) => update("save_gps_mode", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{GPS_MODES.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2 pb-2">
        <Switch checked={form.user_confirmed_location} onCheckedChange={(checked) => update("user_confirmed_location", checked)} />
        <Label className="text-sm">Confirmed</Label>
      </div>
    </div>
  );
}

function ThriftPhotoCapture({ originalPhoto, stampedPhoto, fileRef, priceRef, modelRef, onPhoto }: {
  originalPhoto: string | null;
  stampedPhoto: string | null;
  fileRef: RefObject<HTMLInputElement | null>;
  priceRef: RefObject<HTMLInputElement | null>;
  modelRef: RefObject<HTMLInputElement | null>;
  onPhoto: (file: File) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onPhoto(file);
  };
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" /> Photo Evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={fileRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={handleChange} />
        <input ref={priceRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={handleChange} />
        <input ref={modelRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={handleChange} />
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" size="lg" onClick={() => fileRef.current?.click()}><Camera className="mr-2 h-5 w-5" /> Item</Button>
          <Button type="button" size="lg" variant="outline" onClick={() => priceRef.current?.click()}><ClipboardList className="mr-2 h-5 w-5" /> Price</Button>
          <Button type="button" size="lg" variant="outline" onClick={() => modelRef.current?.click()}><Search className="mr-2 h-5 w-5" /> Model</Button>
        </div>
        {stampedPhoto || originalPhoto ? (
          <EvidencePhotoPreview originalPhoto={originalPhoto} stampedPhoto={stampedPhoto} />
        ) : (
          <div className="aspect-[4/3] rounded-md border border-dashed bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
            Take item and price-tag photos.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EvidencePhotoPreview({ originalPhoto, stampedPhoto }: { originalPhoto: string | null; stampedPhoto: string | null }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {originalPhoto ? <img src={originalPhoto} alt="Original thrift evidence" className="aspect-[4/3] w-full rounded-md object-cover border" /> : null}
      {stampedPhoto ? <img src={stampedPhoto} alt="Stamped thrift evidence" className="aspect-[4/3] w-full rounded-md object-cover border" /> : null}
    </div>
  );
}

function ThriftConditionForm({ form, update }: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Condition / Risk</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Condition</Label>
            <Select value={form.condition} onValueChange={(value) => update("condition", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITIONS.map((condition) => <SelectItem key={condition} value={condition}>{condition}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(value) => update("category", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <TextField label="Visible damage" value={form.visible_damage} onChange={(value) => update("visible_damage", value)} placeholder="Scratches, dents, water damage, broken hinge..." />
        <TextField label="Missing parts" value={form.missing_parts} onChange={(value) => update("missing_parts", value)} placeholder="No power cord, remote, charger, case..." />
        <TextField label="Included accessories" value={form.included_accessories} onChange={(value) => update("included_accessories", value)} placeholder="Manual, case, cable, charger..." />
        <div>
          <Label>Notes / manual hints</Label>
          <Textarea value={form.user_notes} onChange={(event) => update("user_notes", event.target.value)} placeholder="Brand label text, shelf notes, negotiation details, testing concerns..." />
        </div>
      </CardContent>
    </Card>
  );
}

function ThriftDecisionCard({ decision, tone, RecIcon, form }: { decision: Decision; tone: ReturnType<typeof recTone>; RecIcon: typeof CheckCircle2; form: FormState }) {
  return (
    <Card className="shadow-sm overflow-hidden">
      <div className={`${tone.className} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <RecIcon className="h-7 w-7" />
            <div>
              <p className="text-2xl font-black tracking-tight">{tone.label}</p>
              <p className="text-sm opacity-90">{decision.one_sentence_reason}</p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/20">{decision.confidence_score ?? 0}%</Badge>
        </div>
      </div>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="font-bold">{decision.product_name}</h3>
          <p className="text-xs text-muted-foreground">{[decision.brand, decision.model_number].filter(Boolean).join(" • ") || "Add brand/model photos for a better match."}</p>
          <p className="text-xs text-muted-foreground mt-1">{form.store_name || "Unknown store"} • {stampTime(form.scan_timestamp)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Asking" value={form.asking_price ? `$${form.asking_price}` : "Not set"} />
          <Metric label="Max buy" value={money(decision.max_buy_price)} />
          <Metric label="eBay sold" value={decision.ebay_sold_range || "Manual estimate"} />
          <Metric label="eBay active" value={decision.ebay_active_range || "Manual estimate"} />
          <Metric label="Expected FB sale" value={money(decision.expected_facebook_sale_price)} />
          <Metric label="Est. profit" value={money(decision.estimated_profit)} />
        </div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Risk</p>
          {decision.risk_notes}
        </div>
      </CardContent>
    </Card>
  );
}

function ThriftActions({ savedInventoryId, onSave, onWatchlist, onPurchase, onScanNext, busy }: {
  savedInventoryId: number | null;
  onSave: () => void;
  onWatchlist: () => void;
  onPurchase: () => void;
  onScanNext: () => void;
  busy: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 grid grid-cols-2 gap-2">
        <Button size="lg" onClick={onSave} disabled={busy}><Save className="mr-2 h-5 w-5" /> Save</Button>
        <Button size="lg" variant="outline" onClick={onWatchlist} disabled={busy}><BookmarkPlus className="mr-2 h-5 w-5" /> Watchlist</Button>
        <Button size="lg" variant="outline" asChild disabled={!savedInventoryId}>
          <Link href={savedInventoryId ? `/listing-generator/${savedInventoryId}` : "/listing-generator"}><FileText className="mr-2 h-5 w-5" /> Listing</Link>
        </Button>
        <Button size="lg" variant="outline" asChild disabled={!savedInventoryId}>
          <Link href={savedInventoryId ? `/comp-details/${savedInventoryId}` : "/comp-lookup"}><Search className="mr-2 h-5 w-5" /> Compare</Link>
        </Button>
        <Button size="lg" variant="outline" onClick={onPurchase} disabled={busy}><ReceiptText className="mr-2 h-5 w-5" /> Record Purchase</Button>
        <Button size="lg" variant="secondary" onClick={onScanNext}><ShoppingCart className="mr-2 h-5 w-5" /> Scan Next</Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold leading-tight">{value}</p>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, inputMode }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="0.00" inputMode="decimal" />
    </div>
  );
}
