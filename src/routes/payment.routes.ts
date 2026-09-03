import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createPaymentController,
  getPaymentController,
  listPaymentsController,
} from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const paymentRouter = Router();

paymentRouter.use(requireAuth);

paymentRouter.get(
  "/",
  requirePermission(Permissions.PAYMENTS_VIEW),
  asyncHandler(listPaymentsController),
);
paymentRouter.post(
  "/",
  requirePermission(Permissions.PAYMENTS_CREATE),
  asyncHandler(createPaymentController),
);
paymentRouter.get(
  "/:id",
  requirePermission(Permissions.PAYMENTS_VIEW),
  asyncHandler(getPaymentController),
);

export { paymentRouter };
