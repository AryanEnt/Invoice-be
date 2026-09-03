import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createMemberController,
  getMemberController,
  listMemberAdministratorsController,
  listMembersController,
  resetMemberPasswordController,
  updateMemberController,
  updateMemberStatusController,
} from "../controllers/member.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireRole } from "../middleware/require-role.js";
import { asyncHandler } from "../utils/async-handler.js";

const memberRouter = Router();

memberRouter.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));

memberRouter.get("/", requirePermission(Permissions.USERS_VIEW), asyncHandler(listMembersController));
memberRouter.get(
  "/administrators",
  requirePermission(Permissions.USERS_VIEW),
  asyncHandler(listMemberAdministratorsController),
);
memberRouter.post(
  "/",
  requirePermission(Permissions.USERS_CREATE),
  asyncHandler(createMemberController),
);
memberRouter.get(
  "/:id",
  requirePermission(Permissions.USERS_VIEW),
  asyncHandler(getMemberController),
);
memberRouter.patch(
  "/:id/status",
  requirePermission(Permissions.USERS_UPDATE),
  asyncHandler(updateMemberStatusController),
);
memberRouter.post(
  "/:id/password",
  requirePermission(Permissions.USERS_UPDATE),
  asyncHandler(resetMemberPasswordController),
);
memberRouter.patch(
  "/:id",
  requirePermission(Permissions.USERS_UPDATE),
  asyncHandler(updateMemberController),
);

export { memberRouter };
