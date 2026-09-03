import { Router } from "express";
import {
  getCollectionTargetController,
  getDashboardController,
  getDashboardForecastController,
  updateCollectionTargetController,
} from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";
import { asyncHandler } from "../utils/async-handler.js";

const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/", asyncHandler(getDashboardController));
dashboardRouter.get(
  "/forecast",
  requireRole("ADMIN"),
  asyncHandler(getDashboardForecastController),
);
dashboardRouter.get(
  "/collection-target",
  requireRole("ADMIN"),
  asyncHandler(getCollectionTargetController),
);
dashboardRouter.patch(
  "/collection-target",
  requireRole("ADMIN"),
  asyncHandler(updateCollectionTargetController),
);

export { dashboardRouter };
