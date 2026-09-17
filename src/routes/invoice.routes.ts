import { Router } from "express";
import { Permissions } from "../config/permissions.js";
import {
  cancelInvoiceController,
  createInvoiceController,
  deleteInvoiceController,
  downloadInvoicePdfController,
  duplicateInvoiceController,
  getInvoiceController,
  getInvoiceSummaryController,
  listInvoicesController,
  recordInvoicePaymentController,
  shareInvoiceLinkController,
  sendInvoiceController,
  updateInvoiceController,
} from "../controllers/invoice.controller.js";
import { invoicePdfRateLimit, invoiceMutationRateLimit, invoiceSendRateLimit } from "../middleware/app-rate-limits.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requirePermission } from "../middleware/require-permission.js";
import { asyncHandler } from "../utils/async-handler.js";

const invoiceRouter = Router();

invoiceRouter.use(requireAuth);

invoiceRouter.get(
  "/",
  requirePermission(Permissions.INVOICES_VIEW),
  asyncHandler(listInvoicesController),
);
invoiceRouter.get(
  "/summary",
  requirePermission(Permissions.INVOICES_VIEW),
  asyncHandler(getInvoiceSummaryController),
);
invoiceRouter.post(
  "/",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_CREATE),
  asyncHandler(createInvoiceController),
);
invoiceRouter.get(
  "/:id/pdf",
  invoicePdfRateLimit,
  requirePermission(Permissions.INVOICES_VIEW),
  asyncHandler(downloadInvoicePdfController),
);
invoiceRouter.post(
  "/:id/send",
  invoiceSendRateLimit,
  requirePermission(Permissions.INVOICES_SEND),
  asyncHandler(sendInvoiceController),
);
invoiceRouter.post(
  "/:id/share-link",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_VIEW),
  asyncHandler(shareInvoiceLinkController),
);
invoiceRouter.post(
  "/:id/duplicate",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_CREATE),
  asyncHandler(duplicateInvoiceController),
);
invoiceRouter.post(
  "/:id/cancel",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_UPDATE),
  asyncHandler(cancelInvoiceController),
);
invoiceRouter.post(
  "/:id/payments",
  invoiceMutationRateLimit,
  requirePermission(Permissions.PAYMENTS_CREATE),
  asyncHandler(recordInvoicePaymentController),
);
invoiceRouter.get(
  "/:id",
  requirePermission(Permissions.INVOICES_VIEW),
  asyncHandler(getInvoiceController),
);
invoiceRouter.patch(
  "/:id",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_UPDATE),
  asyncHandler(updateInvoiceController),
);
invoiceRouter.delete(
  "/:id",
  invoiceMutationRateLimit,
  requirePermission(Permissions.INVOICES_DELETE),
  asyncHandler(deleteInvoiceController),
);

export { invoiceRouter };
