import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  getPaymentRecord,
  listPaymentRecords,
  recordManualPayment,
} from "../services/payment.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import { createPaymentSchema, listPaymentsQuerySchema } from "../validators/payment.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listPaymentsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listPaymentsQuerySchema, req.query);
  const result = await listPaymentRecords(actor, query);
  res.status(200).json(success(result));
}

export async function getPaymentController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const payment = await getPaymentRecord(actor, params.id);
  res.status(200).json(success({ payment }));
}

export async function createPaymentController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createPaymentSchema, req.body);
  const result = await recordManualPayment(actor, body);
  res.status(201).json(success(result));
}
