import { Router } from "express";
import {
  createOrganizationController,
  getOrganizationController,
  listOrganizationsController,
  updateOrganizationController,
  updateOrganizationStatusController,
} from "../controllers/organization.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireOrganizationAccess } from "../middleware/require-organization-access.js";
import { requireRole } from "../middleware/require-role.js";
import { asyncHandler } from "../utils/async-handler.js";

const organizationRouter = Router();

organizationRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(listOrganizationsController),
);

organizationRouter.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(createOrganizationController),
);

organizationRouter.patch(
  "/:id/status",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(updateOrganizationStatusController),
);

organizationRouter.patch(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(updateOrganizationController),
);

organizationRouter.get(
  "/:id",
  requireAuth,
  requireOrganizationAccess({ param: "id" }),
  asyncHandler(getOrganizationController),
);

export { organizationRouter };
