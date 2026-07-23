import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Settings as SettingsIcon,
  Shield,
  Brain,
  Camera,
  Upload,
  Globe,
  Keyboard,
  CheckCircle,
  Info,
  Store,
} from "lucide-react";
import { Link } from "wouter";

const CAPTURE_METHODS = [
  {
    icon: Camera,
    title: "UPC Camera Scan",
    desc: "Take a photo of any UPC label, barcode, clearance tag, price sign, box, or shelf tag. AI vision extracts the image data and scores the flip. Works with all retailers.",
    status: "active",
    href: "/upc-scan",
  },
  {
    icon: Upload,
    title: "Screenshot Upload",
    desc: "Upload screenshots from Costco, Walmart, Target, or other store apps. AI extracts multiple rows at once.",
    status: "active",
    href: "/upload-screenshot",
  },
  {
    icon: Globe,
    title: "Check Online",
    desc: "Try public web checking where allowed and visible. Will fail if login, CAPTCHA, or bot protection is required.",
    status: "compliance",
    href: "/web-check",
  },
  {
    icon: Keyboard,
    title: "Manual Add",
    desc: "Enter item, store, price, and condition manually. Get an AI flip score instantly.",
    status: "active",
    href: "/manual-add",
  },
];

const SCORING_TIERS = [
  { label: "BUY", range: "75–100", color: "bg-success text-success-foreground", desc: "Strong flip candidate. Good margin, high demand. Buy 2–4 units." },
  { label: "MAYBE", range: "55–74", color: "bg-warning text-warning-foreground", desc: "Buy 1 test unit. Research demand before buying more." },
  { label: "SKIP", range: "0–54", color: "bg-destructive text-destructive-foreground", desc: "Too risky, low margin, or poor demand signal. Leave it." },
];

const RETAILER_MARKDOWN = [
  {
    retailer: "Costco",
    codes: [
      { code: ".97", name: "Clearance", desc: "Item being discontinued. Strongest flip signal.", color: "text-orange-600" },
      { code: ".88", name: "Manager Markdown", desc: "Discounted to move inventory. Good opportunity.", color: "text-amber-600" },
      { code: ".00", name: "Manager Special", desc: "Employee or manager priced. Investigate further.", color: "text-yellow-600" },
      { code: "★ on tag", name: "Discontinued", desc: "Star on price sign = limited remaining stock.", color: "text-red-500" },
    ],
  },
  {
    retailer: "Walmart",
    codes: [
      { code: "Yellow Tag", name: "Clearance", desc: "Yellow CLEARANCE sticker = main signal. 40%+ off is strong.", color: "text-yellow-600" },
      { code: ".00 or .50", name: "Clearance Price", desc: "Round price endings often indicate clearance.", color: "text-amber-600" },
      { code: "% Off", name: "Percent Off", desc: "40%+ off = strong, 50%+ = very strong flip potential.", color: "text-orange-600" },
    ],
  },
  {
    retailer: "Target",
    codes: [
      { code: "30% off", name: "Weak/Maybe", desc: "Light clearance. Rarely worth buying multiples.", color: "text-yellow-600" },
      { code: "50% off", name: "Good", desc: "Solid deal on in-demand items. Buy 1 to test.", color: "text-amber-600" },
      { code: "70% off", name: "Strong", desc: "High-value flip territory. Buy 2–4 on good items.", color: "text-orange-600" },
      { code: "90% off", name: "Very Strong", desc: "Exceptional discount but stock may be depleted.", color: "text-red-500" },
    ],
  },
  {
    retailer: "BJ's / Sam's Club",
    codes: [
      { code: ".97", name: "Clearance", desc: "Same signal as Costco — item likely being discontinued.", color: "text-orange-600" },
      { code: ".88", name: "Markdown", desc: "Markdown to move inventory.", color: "text-amber-600" },
    ],
  },
];

const RETAILERS = [
  { name: "Costco", defaultStores: "Lawrence, Oceanside, Westbury" },
  { name: "Walmart", defaultStores: "Add your local Walmart" },
  { name: "Target", defaultStores: "Add your local Target" },
  { name: "BJ's", defaultStores: "Add your local BJ's" },
  { name: "Sam's Club", defaultStores: "Add your local Sam's Club" },
  { name: "Home Depot", defaultStores: "Add your local Home Depot" },
  { name: "Lowe's", defaultStores: "Add your local Lowe's" },
];

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" /> Settings & Guide
        </h2>
        <p className="text-sm text-muted-foreground mt-1">How the app works, scoring rules, and compliance info.</p>
      </div>

      {/* Supported Retailers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Supported Retailers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {RETAILERS.map((r) => (
              <div key={r.name} className="flex flex-col p-3 rounded-lg bg-muted/30 border border-border">
                <span className="font-semibold text-sm">{r.name}</span>
                <span className="text-xs text-muted-foreground mt-0.5">{r.defaultStores}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Capture Methods */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Four Capture Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {CAPTURE_METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.title} className="flex gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                <div className="shrink-0 mt-0.5 p-2 bg-primary/10 rounded-lg">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-sm">{m.title}</h3>
                    {m.status === "active" ? (
                      <Badge className="bg-success/10 text-success text-xs border-success/20">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-warning border-warning/30">Compliance-safe</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 text-xs" asChild>
                  <Link href={m.href}>Open</Link>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Scoring Tiers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Flip Score Tiers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SCORING_TIERS.map(tier => (
            <div key={tier.label} className="flex gap-3 items-start">
              <Badge className={`${tier.color} font-bold px-3 py-1 text-xs min-w-[60px] justify-center`}>{tier.label}</Badge>
              <div>
                <p className="text-xs font-semibold">{tier.range}</p>
                <p className="text-xs text-muted-foreground">{tier.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Retailer Markdown Codes */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" /> Retailer Markdown Codes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {RETAILER_MARKDOWN.map((section) => (
            <div key={section.retailer}>
              <h3 className="text-sm font-bold text-foreground mb-2 pb-1 border-b border-border">{section.retailer}</h3>
              <div className="space-y-2">
                {section.codes.map(code => (
                  <div key={code.code} className="flex gap-3 items-start">
                    <span className={`text-sm font-black ${code.color} min-w-[70px] shrink-0`}>{code.code}</span>
                    <div>
                      <p className="text-xs font-semibold">{code.name}</p>
                      <p className="text-xs text-muted-foreground">{code.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI Model Info */}
      <Card className="shadow-sm bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> AI Model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-sm font-medium">GPT-4.1 Mini Vision</span>
            <Badge variant="outline" className="text-xs">OpenAI</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Photo scans and screenshot uploads are processed using OpenAI's vision model.
            Scoring uses a retailer-aware rule-based system with signals for markdown codes, clearance percent, category, brand, and price spread.
          </p>
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card className="shadow-sm border-warning/20 bg-warning/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-warning" /> Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2 text-xs text-muted-foreground">
            {[
              "This app does NOT bypass retailer login, membership checks, or CAPTCHA.",
              "It does NOT scrape private retailer APIs or copy session cookies.",
              "It does NOT automate accounts or use bot-like behavior on any retailer website.",
              "Photo Scan and Screenshot Upload process only images you personally capture.",
              "Public Web Check only reads pages visible without login — it fails gracefully otherwise.",
              "All AI processing uses OpenAI's API. Images are not stored after scoring.",
              "Prices and stock status change frequently. Always verify in store before buying.",
            ].map((point, i) => (
              <div key={i} className="flex gap-2">
                <CheckCircle className="h-3 w-3 text-success shrink-0 mt-0.5" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground pb-8">
        Retail Flip Scanner — for personal reselling research only.
      </div>
    </div>
  );
}
