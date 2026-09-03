import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createProductAccount,
  deleteProductAccount,
  getProductAccount,
  listProductAccounts,
  updateProductAccount,
} from "../services/product.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "../validators/product.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listProductsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listProductsQuerySchema, req.query);
  const result = await listProductAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function getProductController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const product = await getProductAccount(actor, params.id);
  res.status(200).json(success({ product }));
}

export async function createProductController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createProductSchema, req.body);
  const product = await createProductAccount(actor, body);
  res.status(201).json(success({ product }));
}

export async function updateProductController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateProductSchema, req.body);
  const product = await updateProductAccount(actor, params.id, body);
  res.status(200).json(success({ product }));
}

export async function deleteProductController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  await deleteProductAccount(actor, params.id);
  res.status(200).json(success({ deleted: true }));
}
