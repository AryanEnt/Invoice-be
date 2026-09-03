import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  createProductController,
  deleteProductController,
  getProductController,
  listProductsController,
  updateProductController,
} from "../controllers/product.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get(
  "/",
  requirePermission(Permissions.PRODUCTS_VIEW),
  asyncHandler(listProductsController),
);
productRouter.post(
  "/",
  requirePermission(Permissions.PRODUCTS_CREATE),
  asyncHandler(createProductController),
);
productRouter.get(
  "/:id",
  requirePermission(Permissions.PRODUCTS_VIEW),
  asyncHandler(getProductController),
);
productRouter.patch(
  "/:id",
  requirePermission(Permissions.PRODUCTS_UPDATE),
  asyncHandler(updateProductController),
);
productRouter.delete(
  "/:id",
  requirePermission(Permissions.PRODUCTS_DELETE),
  asyncHandler(deleteProductController),
);

export { productRouter };
