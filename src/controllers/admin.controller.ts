import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createAdmin,
  getAdminAccount,
  listAdminAccounts,
  resetAdminPassword,
  updateAdmin,
  updateAdminStatus,
} from "../services/admin.service.js";
import { success } from "../utils/api-response.js";
import {
  createAdminSchema,
  listAdminsQuerySchema,
  updateAdminSchema,
  updateAdminStatusSchema,
} from "../validators/admin.validators.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listAdminsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listAdminsQuerySchema, req.query);
  const result = await listAdminAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function getAdminController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const user = await getAdminAccount(actor, params.id);
  res.status(200).json(success({ user }));
}

export async function createAdminController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createAdminSchema, req.body);
  const result = await createAdmin(actor, body);
  res.status(201).json(success(result));
}

export async function updateAdminController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateAdminSchema, req.body);
  const user = await updateAdmin(actor, params.id, body);
  res.status(200).json(success({ user }));
}

export async function updateAdminStatusController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateAdminStatusSchema, req.body);
  const user = await updateAdminStatus(actor, params.id, body.status);
  res.status(200).json(success({ user }));
}

export async function resetAdminPasswordController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const result = await resetAdminPassword(actor, params.id);
  res.status(200).json(success(result));
}
