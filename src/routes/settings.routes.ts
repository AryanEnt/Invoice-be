import express, { Router } from "express";
import {
  confirmOrganizationLogoController,
  getEmailTemplatesController,
  getInvoiceSettingsController,
  getOrganizationSettingsController,
  getPayPalConnectUrlController,
  createOrganizationLogoUploadUrlController,
  removeOrganizationLogoController,
  updateEmailTemplatesController,
  updateInvoiceSettingsController,
  uploadOrganizationLogoController,
} from "../controllers/settings.controller.js";
import { Permissions } from "../config/permissions.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireRole } from "../middleware/require-role.js";
import { asyncHandler } from "../utils/async-handler.js";

const LOGO_RAW_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];

const settingsRouter = Router();

settingsRouter.get(
  "/organization",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getOrganizationSettingsController),
);

settingsRouter.get(
  "/invoice",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getInvoiceSettingsController),
);

settingsRouter.patch(
  "/invoice",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(updateInvoiceSettingsController),
);

settingsRouter.get(
  "/email-templates",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getEmailTemplatesController),
);

settingsRouter.patch(
  "/email-templates",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(updateEmailTemplatesController),
);

settingsRouter.post(
  "/organization/logo",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  express.raw({ type: LOGO_RAW_TYPES, limit: "2mb" }),
  asyncHandler(uploadOrganizationLogoController),
);

settingsRouter.post(
  "/organization/logo/upload-url",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(createOrganizationLogoUploadUrlController),
);

settingsRouter.post(
  "/organization/logo/confirm",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(confirmOrganizationLogoController),
);

settingsRouter.delete(
  "/organization/logo",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(removeOrganizationLogoController),
);

settingsRouter.get(
  "/payment/paypal/connect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(getPayPalConnectUrlController),
);

export { settingsRouter };
