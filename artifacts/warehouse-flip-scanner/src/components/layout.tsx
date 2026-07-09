import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Camera, 
  Globe, 
  Upload, 
  List, 
  Map, 
  Bookmark, 
  Settings,
  Menu,
  FileText,
  Zap,
  Search,
  Table2,
  Calculator,
  ReceiptText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quick-scan", label: "Quick Scan", icon: Zap, highlight: true },
  { href: "/quick-scan", label: "Shelf Scan", icon: Camera },
  { href: "/comp-lookup", label: "Deal Hunt", icon: Search },
  { href: "/comp-lookup", label: "Comp Lookup", icon: Search },
  { href: "/budget-planner", label: "Budget Planner", icon: Calculator },
  { href: "/photo-scan", label: "Photo Scan", icon: Camera },
  { href: "/upload-screenshot", label: "Upload Screenshot", icon: Upload },
  { href: "/web-check", label: "Check Online", icon: Globe },
  { href: "/inventory", label: "Inventory", icon: List },
  { href: "/inventory-spreadsheet", label: "Spreadsheet", icon: Table2 },
  { href: "/accounting-ledger", label: "Accounting Ledger", icon: ReceiptText },
  { href: "/store-comparison", label: "Store Comparison", icon: Map },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/listing-generator", label: "Listing Generator", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ComplianceFooter() {
  return (
    <footer className="mt-8 border-t border-border pt-4 pb-8 text-xs text-muted-foreground text-center px-4">
      <p>
        This tool supports photo scans, screenshot uploads, manual entries, and public web checks.
        It does not bypass retailer login, CAPTCHA, bot protection, or private systems.
        Public web results may fail if inventory is not visible without login. Prices and stock may change.
      </p>
    </footer>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 w-full">
      {navItems.map((item) => {
        const isActive = location === item.href ||
          (item.href === "/listing-generator" && location.startsWith("/listing-generator/")) ||
          (item.href === "/comp-lookup" && (location.startsWith("/comp-details/") || location.startsWith("/manual-comp-entry/"))) ||
          (item.href === "/inventory-spreadsheet" && location.startsWith("/inventory-trash"));
        const Icon = item.icon;
        return (
          <Link key={`${item.href}-${item.label}`} href={item.href} className="w-full">
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${
                isActive
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : item.highlight
                  ? "text-primary font-semibold hover:bg-primary/10"
                  : ""
              }`}
            >
              <Icon className={`mr-2 h-4 w-4 ${item.highlight && !isActive ? "text-primary" : ""}`} />
              {item.label}
              {item.highlight && !isActive && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-bold">NEW</span>
              )}
            </Button>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h1 className="font-bold text-lg text-primary tracking-tight">Retail Flip Scanner</h1>
          <p className="text-xs text-muted-foreground mt-1 leading-tight">
            Find clearance deals worth flipping on Facebook Marketplace.
          </p>
        </div>
        <div className="p-4 flex-1">
          <NavLinks />
        </div>
      </aside>

      {/* Mobile Header & Main Content */}
      <div className="flex-1 flex flex-col w-full max-w-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-10">
          <div>
            <h1 className="font-bold text-lg text-primary tracking-tight">Retail Flip Scanner</h1>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="p-4 border-b border-border">
                <h1 className="font-bold text-lg text-primary tracking-tight">Retail Flip Scanner</h1>
              </div>
              <div className="p-4">
                <NavLinks />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6 relative">
          {children}
          <ComplianceFooter />
        </main>
      </div>
    </div>
  );
}
