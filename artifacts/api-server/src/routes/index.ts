import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inventoryRouter from "./inventory";
import watchlistRouter from "./watchlist";
import scanRouter from "./scan";
import dashboardRouter from "./dashboard";
import quickScanRouter from "./quick-scan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inventoryRouter);
router.use(watchlistRouter);
router.use(scanRouter);
router.use(dashboardRouter);
router.use(quickScanRouter);

export default router;
