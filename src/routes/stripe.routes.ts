import { Router } from "express";
import {
  disconnectStripeController,
  getStripeGatewayStatusController,
  startStripeConnectController,
  startStripeConnectRedirectController,
  stripeOAuthCallbackController,
  testStripeConnectionController,
} from "../controllers/stripe.controller.js";
import { Permissions } from "../config/permissions.js";
import { optionalAuth } from "../middleware/optional-auth.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireRole } from "../middleware/require-role.js";
import { stripeConnectRateLimit } from "../middleware/stripe-rate-limit.js";
import { asyncHandler } from "../utils/async-handler.js";

const stripeRouter = Router();

stripeRouter.get(
  "/status",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_VIEW),
  asyncHandler(getStripeGatewayStatusController),
);

stripeRouter.get(
  "/oauth/start",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  stripeConnectRateLimit,
  asyncHandler(startStripeConnectRedirectController),
);

stripeRouter.get(
  "/oauth/callback",
  optionalAuth,
  asyncHandler(stripeOAuthCallbackController),
);

stripeRouter.post(
  "/oauth/start",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  stripeConnectRateLimit,
  asyncHandler(startStripeConnectController),
);

stripeRouter.post(
  "/test",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  stripeConnectRateLimit,
  asyncHandler(testStripeConnectionController),
);

stripeRouter.post(
  "/disconnect",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  requirePermission(Permissions.SETTINGS_UPDATE),
  asyncHandler(disconnectStripeController),
);

export { stripeRouter };
