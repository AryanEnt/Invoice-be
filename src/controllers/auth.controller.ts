import type { Request, Response } from "express";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../lib/cookies.js";
import { UnauthorizedError } from "../lib/errors.js";
import {
  changePassword,
  confirmAvatarUpload,
  createAvatarUploadUrl,
  getAuthenticatedUser,
  login,
  logout,
  removeAvatar,
  updateProfile,
} from "../services/auth.service.js";
import { success } from "../utils/api-response.js";
import { validate } from "../validators/validate.js";
import {
  changePasswordSchema,
  confirmAvatarSchema,
  createAvatarUploadUrlSchema,
  loginSchema,
  updateProfileSchema,
} from "../validators/auth.validators.js";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = validate(loginSchema, req.body);
  const result = await login({
    ...body,
    ...requestMeta(req),
  });

  setSessionCookie(res, result.token);
  res.status(200).json(success({ user: result.user }));
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }

  await logout({
    token: readSessionToken(req),
    actorId: req.authUser.id,
    organizationId: req.authUser.organizationId,
    ...requestMeta(req),
  });

  clearSessionCookie(res);
  res.status(200).json(success({ loggedOut: true }));
}

export async function meController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }

  const user = await getAuthenticatedUser(req.authUser.id);
  res.status(200).json(success({ user }));
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(updateProfileSchema, req.body);
  const user = await updateProfile(actor.id, body);
  res.status(200).json(success({ user }));
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(changePasswordSchema, req.body);
  await changePassword(actor.id, body);
  res.status(200).json(success({ changed: true }));
}

export async function createAvatarUploadUrlController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createAvatarUploadUrlSchema, req.body);
  const upload = await createAvatarUploadUrl(actor.id, body);
  res.status(200).json(success(upload));
}

export async function confirmAvatarController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(confirmAvatarSchema, req.body);
  const user = await confirmAvatarUpload(actor.id, body);
  res.status(200).json(success({ user }));
}

export async function removeAvatarController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const user = await removeAvatar(actor.id);
  res.status(200).json(success({ user }));
}
