import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  exportReportCsvController,
  getReportController,
} from "../controllers/report.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.get(
  "/:kind/csv",
  requirePermission(Permissions.REPORTS_VIEW),
  asyncHandler(exportReportCsvController),
);
reportRouter.get(
  "/:kind",
  requirePermission(Permissions.REPORTS_VIEW),
  asyncHandler(getReportController),
);

export { reportRouter };
