import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import {
  confirmOrganizationLogoUpload,
  createOrganizationLogoUploadUrl,
  getOrganizationSettings,
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from "../services/organization-logo.service.js";
import {
  getEmailTemplateSettings,
  getInvoiceSettings,
  updateEmailTemplateSettings,
  updateInvoiceSettings,
} from "../services/invoice-settings.service.js";
import { success } from "../utils/api-response.js";
import { validate } from "../validators/validate.js";
import {
  confirmOrganizationLogoSchema,
  createOrganizationLogoUploadUrlSchema,
  updateEmailTemplatesSchema,
  updateInvoiceSettingsSchema,
} from "../validators/settings.validators.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function getOrganizationSettingsController(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = requireActor(req);
  const organization = await getOrganizationSettings(actor);
  res.status(200).json(success({ organization }));
}

export async function uploadOrganizationLogoController(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = requireActor(req);
  const contentType = String(req.headers["content-type"] ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const body = req.body;

  if (!contentType || !Buffer.isBuffer(body) || body.byteLength === 0) {
    throw new ValidationError("Upload a PNG, JPG, WebP, or SVG logo file");
  }

  const organization = await uploadOrganizationLogo(actor, { contentType, body });
  res.status(200).json(success({ organization }));
}

export async function createOrganizationLogoUploadUrlController(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = requireActor(req);
  const body = validate(createOrganizationLogoUploadUrlSchema, req.body);
  const upload = await createOrganizationLogoUploadUrl(actor, body);
  res.status(200).json(success(upload));
}

export async function confirmOrganizationLogoController(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = requireActor(req);
  const body = validate(confirmOrganizationLogoSchema, req.body);
  const organization = await confirmOrganizationLogoUpload(actor, body);
  res.status(200).json(success({ organization }));
}

export async function removeOrganizationLogoController(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = requireActor(req);
  const organization = await removeOrganizationLogo(actor);
  res.status(200).json(success({ organization }));
}

export async function getInvoiceSettingsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const settings = await getInvoiceSettings(actor);
  res.status(200).json(success({ settings }));
}

export async function updateInvoiceSettingsController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(updateInvoiceSettingsSchema, req.body);
  const settings = await updateInvoiceSettings(actor, body);
  res.status(200).json(success({ settings }));
}

export async function getEmailTemplatesController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const templates = await getEmailTemplateSettings(actor);
  res.status(200).json(success({ templates }));
}

export async function updateEmailTemplatesController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const body = validate(updateEmailTemplatesSchema, req.body);
  const templates = await updateEmailTemplateSettings(actor, body);
  res.status(200).json(success({ templates }));
}
