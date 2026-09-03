import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createCustomerController,
  deleteCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from "../controllers/customer.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const customerRouter = Router();

customerRouter.use(requireAuth);

customerRouter.get(
  "/",
  requirePermission(Permissions.CUSTOMERS_VIEW),
  asyncHandler(listCustomersController),
);
customerRouter.post(
  "/",
  requirePermission(Permissions.CUSTOMERS_CREATE),
  asyncHandler(createCustomerController),
);
customerRouter.get(
  "/:id",
  requirePermission(Permissions.CUSTOMERS_VIEW),
  asyncHandler(getCustomerController),
);
customerRouter.patch(
  "/:id",
  requirePermission(Permissions.CUSTOMERS_UPDATE),
  asyncHandler(updateCustomerController),
);
customerRouter.delete(
  "/:id",
  requirePermission(Permissions.CUSTOMERS_DELETE),
  asyncHandler(deleteCustomerController),
);

export { customerRouter };
