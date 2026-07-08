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
        <Route path="/photo-scan" component={PhotoScan} />
        <Route path="/web-check" component={WebCheck} />
        <Route path="/upload-screenshot" component={UploadScreenshot} />
        <Route path="/manual-add" component={ManualAdd} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/store-comparison" component={StoreComparison} />
        <Route path="/flip-decision/:itemId" component={FlipDecision} />
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
