import { Link } from "wouter";
import { Camera, ClipboardList, Search, ShoppingCart, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  { title: "Scan the shelf tag", text: "Use Quick Scan for price tag, barcode, clearance sticker, or app screen evidence.", icon: Camera },
  { title: "Estimate visible quantity", text: "Note how many units are actually on the shelf before deciding quantity.", icon: ClipboardList },
  { title: "Compare the winner", text: "Run Price Comps only on the items with enough spread or strong brand demand.", icon: Search },
  { title: "Buy controlled quantity", text: "Save BUY/MAYBE items, then record the purchase once it is in your cart.", icon: ShoppingCart },
];

export default function ShelfScanPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Shelf Scan</h2>
          <p className="text-sm text-muted-foreground">Work a whole shelf: scan tags, compare only the best candidates, and decide quantity.</p>
        </div>
        <Button asChild size="lg"><Link href="/quick-scan"><Zap className="mr-2 h-5 w-5" /> Start Shelf Scan</Link></Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <Card key={step.title} className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">{index + 1}</span>
                  <Icon className="h-4 w-4" />
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{step.text}</CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold">Shelf Scan uses Quick Scan as the capture engine</h3>
            <p className="text-sm text-muted-foreground">This keeps the in-store flow fast while making the shelf workflow distinct from one-off scans.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href="/comp-lookup">Price Comps</Link></Button>
            <Button asChild><Link href="/quick-scan">Scan Item</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
