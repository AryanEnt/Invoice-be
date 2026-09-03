import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createOrganizationAccount,
  getOrganizationOverview,
  listOrganizationAccounts,
  updateOrganizationAccount,
  updateOrganizationStatus,
} from "../services/organization.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  updateOrganizationStatusSchema,
} from "../validators/organization.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listOrganizationsController(_req: Request, res: Response): Promise<void> {
  const organizations = await listOrganizationAccounts();
  res.status(200).json(success({ organizations }));
}

export async function getOrganizationController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const organization = await getOrganizationOverview(actor, params.id);
  res.status(200).json(success({ organization }));
}

export async function createOrganizationController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createOrganizationSchema, req.body);
  const organization = await createOrganizationAccount(actor, body);
  res.status(201).json(success({ organization }));
}

export async function updateOrganizationController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateOrganizationSchema, req.body);
  const organization = await updateOrganizationAccount(actor, params.id, body);
  res.status(200).json(success({ organization }));
}

export async function updateOrganizationStatusController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateOrganizationStatusSchema, req.body);
  const organization = await updateOrganizationStatus(actor, params.id, body.isActive);
  res.status(200).json(success({ organization }));
}
