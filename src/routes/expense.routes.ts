import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import { createExpenseController } from "../controllers/expense.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const expenseRouter = Router();

expenseRouter.use(requireAuth);

expenseRouter.post(
  "/",
  requirePermission(Permissions.EXPENSES_CREATE),
  asyncHandler(createExpenseController),
);

export { expenseRouter };
