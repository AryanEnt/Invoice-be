import { Router } from "express";
import {
  capturePublicPayPalOrderController,
  createPublicPayPalOrderController,
  getPublicPayPalPaymentStatusController,
} from "../controllers/paypal.controller.js";
import { createPublicStripeCheckoutController } from "../controllers/stripe.controller.js";
import { getPublicInvoiceController } from "../controllers/invoice.controller.js";
import { paypalPublicPaymentRateLimit } from "../middleware/paypal-rate-limit.js";
import { stripePublicPaymentRateLimit } from "../middleware/stripe-rate-limit.js";
import { asyncHandler } from "../utils/async-handler.js";

const publicInvoiceRouter = Router();

publicInvoiceRouter.post(
  "/:token/paypal/create-order",
  paypalPublicPaymentRateLimit,
  asyncHandler(createPublicPayPalOrderController),
);
publicInvoiceRouter.post(
  "/:token/paypal/capture-order",
  paypalPublicPaymentRateLimit,
  asyncHandler(capturePublicPayPalOrderController),
);
publicInvoiceRouter.post(
  "/:token/stripe/create-checkout",
  stripePublicPaymentRateLimit,
  asyncHandler(createPublicStripeCheckoutController),
);
publicInvoiceRouter.get(
  "/:token/payment-status",
  asyncHandler(getPublicPayPalPaymentStatusController),
);
publicInvoiceRouter.get("/:token", asyncHandler(getPublicInvoiceController));

export { publicInvoiceRouter };
