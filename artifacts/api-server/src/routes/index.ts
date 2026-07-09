import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inventoryRouter from "./inventory";
import watchlistRouter from "./watchlist";
import scanRouter from "./scan";
import dashboardRouter from "./dashboard";
import quickScanRouter from "./quick-scan";
import compLookupRouter from "./comp-lookup";
import inventorySpreadsheetRouter from "./inventory-spreadsheet";
import budgetPlannerRouter from "./budget-planner";
import accountingLedgerRouter from "./accounting-ledger";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inventoryRouter);
router.use(watchlistRouter);
router.use(scanRouter);
router.use(dashboardRouter);
router.use(quickScanRouter);
router.use(compLookupRouter);
router.use(inventorySpreadsheetRouter);
router.use(budgetPlannerRouter);
router.use(accountingLedgerRouter);

export default router;
