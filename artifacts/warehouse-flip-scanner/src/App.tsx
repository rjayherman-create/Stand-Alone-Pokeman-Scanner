import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import PhotoScan from "@/pages/photo-scan";
import WebCheck from "@/pages/web-check";
import UploadScreenshot from "@/pages/upload-screenshot";
import ManualAdd from "@/pages/manual-add";
import Inventory from "@/pages/inventory";
import StoreComparison from "@/pages/store-comparison";
import FlipDecision from "@/pages/flip-decision";
import ListingGenerator from "@/pages/listing-generator";
import Watchlist from "@/pages/watchlist";
import Settings from "@/pages/settings";
import QuickScan from "@/pages/quick-scan";
import CompLookup from "@/pages/comp-lookup";
import CompDetails from "@/pages/comp-details";
import ManualCompEntry from "@/pages/manual-comp-entry";
import InventorySpreadsheetPage from "@/pages/inventory-spreadsheet";
import TrashViewPage from "@/pages/inventory-trash";
import BudgetPlanner from "@/pages/budget-planner";
import AccountingLedgerPage from "@/pages/accounting-ledger";
import SellingAssistantPage from "@/pages/selling-assistant";
import ListingWorkbenchPage from "@/pages/listing-workbench";
import SalesPipelinePage from "@/pages/sales-pipeline";
import PriceMarkdownPlannerPage from "@/pages/price-markdown-planner";
import BuyerMessageTemplatesPage from "@/pages/buyer-message-templates";
import ThriftScanPage from "@/pages/thrift-scan";
import PreStoreScanPage from "@/pages/pre-store-scan";
import ShelfScanPage from "@/pages/shelf-scan";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/quick-scan" component={QuickScan} />
        <Route path="/pre-store-scan" component={PreStoreScanPage} />
        <Route path="/thrift-scan" component={ThriftScanPage} />
        <Route path="/shelf-scan" component={ShelfScanPage} />
        <Route path="/upc-scan" component={PhotoScan} />
        <Route path="/comp-lookup" component={CompLookup} />
        <Route path="/budget-planner" component={BudgetPlanner} />
        <Route path="/selling-assistant" component={SellingAssistantPage} />
        <Route path="/listing-workbench" component={ListingWorkbenchPage} />
        <Route path="/sales-pipeline" component={SalesPipelinePage} />
        <Route path="/price-markdown-planner" component={PriceMarkdownPlannerPage} />
        <Route path="/buyer-message-templates" component={BuyerMessageTemplatesPage} />
        <Route path="/photo-scan" component={PhotoScan} />
        <Route path="/web-check" component={WebCheck} />
        <Route path="/upload-screenshot" component={UploadScreenshot} />
        <Route path="/manual-add" component={ManualAdd} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/inventory-spreadsheet" component={InventorySpreadsheetPage} />
        <Route path="/inventory-trash" component={TrashViewPage} />
        <Route path="/accounting-ledger" component={AccountingLedgerPage} />
        <Route path="/store-comparison" component={StoreComparison} />
        <Route path="/flip-decision/:itemId" component={FlipDecision} />
        <Route path="/comp-details/:itemId" component={CompDetails} />
        <Route path="/manual-comp-entry/:itemId" component={ManualCompEntry} />
        <Route path="/listing-generator" component={ListingGenerator} />
        <Route path="/listing-generator/:itemId" component={ListingGenerator} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
