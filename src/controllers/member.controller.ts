import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  createMember,
  getMemberAccount,
  listMemberAccounts,
  listMemberAdministratorOptions,
  resetMemberPassword,
  updateMember,
  updateMemberStatus,
} from "../services/member.service.js";
import { success } from "../utils/api-response.js";
import { uuidParamSchema } from "../validators/common.validators.js";
import {
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
  updateMemberStatusSchema,
} from "../validators/member.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function listMembersController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const query = validate(listMembersQuerySchema, req.query);
  const result = await listMemberAccounts(actor, query);
  res.status(200).json(success(result));
}

export async function listMemberAdministratorsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const organizationId =
    typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
  const result = await listMemberAdministratorOptions(actor, { organizationId });
  res.status(200).json(success(result));
}

export async function getMemberController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const user = await getMemberAccount(actor, params.id);
  res.status(200).json(success({ user }));
}

export async function createMemberController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createMemberSchema, req.body);
  const result = await createMember(actor, body);
  res.status(201).json(success(result));
}

export async function updateMemberController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateMemberSchema, req.body);
  const result = await updateMember(actor, params.id, body);
  res.status(200).json(success(result));
}

export async function resetMemberPasswordController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const result = await resetMemberPassword(actor, params.id);
  res.status(200).json(success(result));
}

export async function updateMemberStatusController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(uuidParamSchema, req.params);
  const body = validate(updateMemberStatusSchema, req.body);
  const user = await updateMemberStatus(actor, params.id, body.status);
  res.status(200).json(success({ user }));
}
