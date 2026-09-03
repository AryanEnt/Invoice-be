import { Router } from "express";
import { getPublicInvoiceController } from "../controllers/invoice.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

const publicInvoiceRouter = Router();

publicInvoiceRouter.get("/:token", asyncHandler(getPublicInvoiceController));

export { publicInvoiceRouter };
