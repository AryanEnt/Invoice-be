import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createAdminController,
  getAdminController,
  listAdminsController,
  resetAdminPasswordController,
  updateAdminController,
  updateAdminStatusController,
} from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireRole } from "../middleware/require-role.js";
import { asyncHandler } from "../utils/async-handler.js";

const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("SUPER_ADMIN"));

adminRouter.get("/", requirePermission(Permissions.ADMINS_VIEW), asyncHandler(listAdminsController));
adminRouter.post(
  "/",
  requirePermission(Permissions.ADMINS_CREATE),
  asyncHandler(createAdminController),
);
adminRouter.get(
  "/:id",
  requirePermission(Permissions.ADMINS_VIEW),
  asyncHandler(getAdminController),
);
adminRouter.patch(
  "/:id/status",
  requirePermission(Permissions.ADMINS_UPDATE),
  asyncHandler(updateAdminStatusController),
);
adminRouter.post(
  "/:id/password",
  requirePermission(Permissions.ADMINS_UPDATE),
  asyncHandler(resetAdminPasswordController),
);
adminRouter.patch(
  "/:id",
  requirePermission(Permissions.ADMINS_UPDATE),
  asyncHandler(updateAdminController),
);

export { adminRouter };
