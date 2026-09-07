import express, { Router } from "express";
import {
  confirmOrganizationLogoController,
  getAdminBrandingController,
  getEmailTemplatesController,
  getInvoiceSettingsController,
  getOrganizationSettingsController,
  createOrganizationLogoUploadUrlController,
  removeAdminBrandingLogoController,
  removeOrganizationLogoController,
  updateAdminBrandingController,
  updateEmailTemplatesController,
  updateInvoiceSettingsController,
  uploadAdminBrandingLogoController,
  uploadOrganizationLogoController,
} from "../controllers/settings.controller.js";
import {
  disconnectPayPalController,
  getPayPalGatewayStatusController,
  payPalOAuthCallbackController,
  startPayPalConnectController,
  testPayPalConnectionController,
} from "../controllers/paypal.controller.js";
import {
  disconnectStripeController,
  getStripeGatewayStatusController,
  startStripeConnectController,
  stripeOAuthCallbackController,
  testStripeConnectionController,
} from "../controllers/stripe.controller.js";
import { Permissions } from "../config/permissions.js";
import { optionalAuth } from "../middleware/optional-auth.js";
import { paypalConnectRateLimit } from "../middleware/paypal-rate-limit.js";
import { stripeConnectRateLimit } from "../middleware/stripe-rate-limit.js";
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
  "/branding",
  requireAuth,
  requireRole("ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getAdminBrandingController),
);

settingsRouter.put(
  "/branding",
  requireAuth,
  requireRole("ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(updateAdminBrandingController),
);

settingsRouter.post(
  "/branding/logo",
  requireAuth,
  requireRole("ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  express.raw({ type: LOGO_RAW_TYPES, limit: "2mb" }),
  asyncHandler(uploadAdminBrandingLogoController),
);

settingsRouter.delete(
  "/branding/logo",
  requireAuth,
  requireRole("ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(removeAdminBrandingLogoController),
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
  "/payment/paypal",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getPayPalGatewayStatusController),
);

settingsRouter.post(
  "/payment/paypal/connect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  paypalConnectRateLimit,
  asyncHandler(startPayPalConnectController),
);

settingsRouter.get(
  "/payment/paypal/callback",
  optionalAuth,
  asyncHandler(payPalOAuthCallbackController),
);

settingsRouter.post(
  "/payment/paypal/test",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  paypalConnectRateLimit,
  asyncHandler(testPayPalConnectionController),
);

settingsRouter.post(
  "/payment/paypal/disconnect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(disconnectPayPalController),
);

settingsRouter.get(
  "/payment/stripe",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getStripeGatewayStatusController),
);

settingsRouter.post(
  "/payment/stripe/connect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  stripeConnectRateLimit,
  asyncHandler(startStripeConnectController),
);

settingsRouter.get(
  "/payment/stripe/callback",
  optionalAuth,
  asyncHandler(stripeOAuthCallbackController),
);

settingsRouter.post(
  "/payment/stripe/test",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  stripeConnectRateLimit,
  asyncHandler(testStripeConnectionController),
);

settingsRouter.post(
  "/payment/stripe/disconnect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(disconnectStripeController),
);

export { settingsRouter };
