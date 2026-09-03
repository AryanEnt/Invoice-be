import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import {
  cancelInvoiceAccount,
  createInvoiceAccount,
  deleteInvoiceAccount,
  duplicateInvoiceAccount,
  getInvoiceAccount,
  getInvoiceShareLink,
  getInvoiceSummaryCounts,
  getPublicInvoiceByToken,
  listInvoiceAccounts,
  recordInvoicePayment,
  sendInvoiceAccount,
  updateInvoiceAccount,
} from "../services/invoice.service.js";
import { getOrCreateInvoicePdfForAccount } from "../services/invoice-pdf.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  recordInvoicePaymentSchema,
  updateInvoiceSchema,
} from "../validators/invoice.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listInvoicesController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listInvoicesQuerySchema, req.query);
  const result = await listInvoiceAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function getInvoiceSummaryController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const summary = await getInvoiceSummaryCounts(actor);
  res.status(200).json(success({ summary }));
}

export async function getInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const invoice = await getInvoiceAccount(actor, params.id);
  res.status(200).json(success({ invoice }));
}

export async function createInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createInvoiceSchema, req.body);
  const invoice = await createInvoiceAccount(actor, body);
  res.status(201).json(success({ invoice }));
}

export async function updateInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateInvoiceSchema, req.body);
  const invoice = await updateInvoiceAccount(actor, params.id, body);
  res.status(200).json(success({ invoice }));
}

export async function deleteInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  await deleteInvoiceAccount(actor, params.id);
  res.status(200).json(success({ deleted: true }));
}

export async function duplicateInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const invoice = await duplicateInvoiceAccount(actor, params.id);
  res.status(201).json(success({ invoice }));
}

export async function sendInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const invoice = await sendInvoiceAccount(actor, params.id);
  res.status(200).json(success({ invoice }));
}

export async function shareInvoiceLinkController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const result = await getInvoiceShareLink(actor, params.id);
  res.status(200).json(success(result));
}

export async function getPublicInvoiceController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(token)) {
    throw new ValidationError("Invalid invoice link");
  }
  const invoice = await getPublicInvoiceByToken(token);
  res.status(200).json(success({ invoice }));
}

export async function cancelInvoiceController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const invoice = await cancelInvoiceAccount(actor, params.id);
  res.status(200).json(success({ invoice }));
}

export async function recordInvoicePaymentController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(recordInvoicePaymentSchema, req.body);
  const invoice = await recordInvoicePayment(actor, params.id, body);
  res.status(200).json(success({ invoice }));
}

export async function downloadInvoicePdfController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const invoice = await getInvoiceAccount(actor, params.id);
  const pdf = await getOrCreateInvoicePdfForAccount(actor, params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${invoice.invoiceNumber}.pdf"`,
  );
  res.status(200).send(pdf);
}
