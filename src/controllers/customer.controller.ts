import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createCustomerAccount,
  deleteCustomerAccount,
  getCustomerAccount,
  listCustomerAccounts,
  updateCustomerAccount,
} from "../services/customer.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "../validators/customer.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listCustomersController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listCustomersQuerySchema, req.query);
  const result = await listCustomerAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function getCustomerController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const customer = await getCustomerAccount(actor, params.id);
  res.status(200).json(success({ customer }));
}

export async function createCustomerController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createCustomerSchema, req.body);
  const customer = await createCustomerAccount(actor, body);
  res.status(201).json(success({ customer }));
}

export async function updateCustomerController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateCustomerSchema, req.body);
  const customer = await updateCustomerAccount(actor, params.id, body);
  res.status(200).json(success({ customer }));
}

export async function deleteCustomerController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  await deleteCustomerAccount(actor, params.id);
  res.status(200).json(success({ deleted: true }));
}
