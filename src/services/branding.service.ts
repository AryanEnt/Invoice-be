import { env } from "../config/env.js";
import { ForbiddenError, ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { isR2Configured } from "../integrations/storage/r2.client.js";
import {
  assertLogoUploadMeta,
  buildAdminBrandingLogoKey,
  createPresignedDownloadUrl,
  deleteObject,
  getObject,
  isAdminBrandingLogoKey,
  uploadObject,
} from "../integrations/storage/r2.service.js";
import {
  findOrganizationById,
  getDefaultOrganizationId,
} from "../repositories/organization.repository.js";
import { findUserById, updateUser } from "../repositories/user.repository.js";
import type { AuthUser } from "../types/auth.js";
import { getInvoiceCompanyName } from "./invoice-settings.service.js";
import { recordAudit } from "./audit.service.js";

export type BrandingSource = "admin" | "platform";

export type EffectiveBranding = {
  companyName: string;
  companyLogoUrl: string | null;
  logoObjectKey: string | null;
  source: BrandingSource;
  adminId: string | null;
  organizationId: string | null;
  hasCustomName: boolean;
  hasCustomLogo: boolean;
};

export type AdminBrandingSettingsView = {
  companyName: string | null;
  companyLogoUrl: string | null;
  hasLogo: boolean;
  hasCustomBranding: boolean;
  platformCompanyName: string;
  platformLogoUrl: string | null;
};

type PlatformBranding = {
  organizationId: string | null;
  companyName: string;
  logoObjectKey: string | null;
};

async function resolvePlatformBranding(
  organizationIdHint?: string | null,
): Promise<PlatformBranding> {
  let organizationId = organizationIdHint ?? null;
  if (!organizationId) {
    organizationId = await getDefaultOrganizationId();
  }

  if (!organizationId) {
    return {
      organizationId: null,
      companyName: env.EMAIL_FROM_NAME?.trim() || "Company",
      logoObjectKey: null,
    };
  }

  const [organization, brandedName] = await Promise.all([
    findOrganizationById(organizationId),
    getInvoiceCompanyName(organizationId),
  ]);

  return {
    organizationId,
    companyName:
      brandedName?.trim() ||
      organization?.name?.trim() ||
      env.EMAIL_FROM_NAME?.trim() ||
      "Company",
    logoObjectKey: organization?.logoObjectKey ?? null,
  };
}

async function logoUrlFromKey(
  key: string | null,
  expiresInSeconds: number,
): Promise<string | null> {
  if (!key || !isR2Configured()) {
    return null;
  }
  return createPresignedDownloadUrl({ key, expiresInSeconds });
}

/**
 * Central branding resolver for invoices, emails, and PDFs.
 * Members inherit their Administrator's branding; missing admin fields fall back to platform defaults.
 */
export async function getEffectiveBranding(
  userId: string,
  options?: { expiresInSeconds?: number },
): Promise<EffectiveBranding> {
  const expiresInSeconds = options?.expiresInSeconds ?? 60 * 15;
  const user = await findUserById(userId);
  if (!user) {
    const platform = await resolvePlatformBranding(null);
    return {
      companyName: platform.companyName,
      companyLogoUrl: await logoUrlFromKey(platform.logoObjectKey, expiresInSeconds),
      logoObjectKey: platform.logoObjectKey,
      source: "platform",
      adminId: null,
      organizationId: platform.organizationId,
      hasCustomName: false,
      hasCustomLogo: false,
    };
  }

  let adminId: string | null = null;
  if (user.role === "ADMIN") {
    adminId = user.id;
  } else if (user.role === "MEMBER") {
    adminId = user.administratorId;
  }

  const platform = await resolvePlatformBranding(user.organizationId);
  const admin = adminId ? await findUserById(adminId) : null;

  const hasCustomName = Boolean(admin?.companyName?.trim());
  const hasCustomLogo = Boolean(admin?.companyLogoObjectKey);
  const logoObjectKey = admin?.companyLogoObjectKey || platform.logoObjectKey;
  const companyName = admin?.companyName?.trim() || platform.companyName;

  return {
    companyName,
    companyLogoUrl: await logoUrlFromKey(logoObjectKey, expiresInSeconds),
    logoObjectKey,
    source: hasCustomName || hasCustomLogo ? "admin" : "platform",
    adminId,
    organizationId: platform.organizationId ?? user.organizationId,
    hasCustomName,
    hasCustomLogo,
  };
}

export async function getEffectiveBrandingForInvoice(invoice: {
  createdById: string;
  assignedMemberId: string | null;
  organizationId: string;
}): Promise<EffectiveBranding> {
  const userId = invoice.assignedMemberId ?? invoice.createdById;
  return getEffectiveBranding(userId, { expiresInSeconds: 60 * 60 });
}

export async function getEffectiveBrandingLogoObject(userId: string): Promise<{
  body: Buffer;
  contentType?: string;
  key: string;
} | null> {
  const branding = await getEffectiveBranding(userId, { expiresInSeconds: 60 });
  if (!branding.logoObjectKey || !isR2Configured()) {
    return null;
  }
  return getObject(branding.logoObjectKey);
}

export async function getEffectiveBrandingLogoObjectForInvoice(invoice: {
  createdById: string;
  assignedMemberId: string | null;
  organizationId: string;
}): Promise<{ body: Buffer; contentType?: string; key: string } | null> {
  const userId = invoice.assignedMemberId ?? invoice.createdById;
  return getEffectiveBrandingLogoObject(userId);
}

function assertAdminActor(actor: AuthUser): void {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Only an Administrator can manage company branding");
  }
}

function assertStorageReady(): void {
  if (!isR2Configured()) {
    throw new ServiceUnavailableError(
      "File storage is not configured yet.",
      "R2_NOT_CONFIGURED",
    );
  }
}

export async function getAdminBrandingSettings(
  actor: AuthUser,
): Promise<AdminBrandingSettingsView> {
  assertAdminActor(actor);
  const admin = await findUserById(actor.id);
  if (!admin) {
    throw new ForbiddenError("Administrator account not found");
  }

  const platform = await resolvePlatformBranding(admin.organizationId);
  const companyName = admin.companyName?.trim() || null;
  const hasLogo = Boolean(admin.companyLogoObjectKey);

  return {
    companyName,
    companyLogoUrl: await logoUrlFromKey(admin.companyLogoObjectKey, 60 * 30),
    hasLogo,
    hasCustomBranding: Boolean(companyName) || hasLogo,
    platformCompanyName: platform.companyName,
    platformLogoUrl: await logoUrlFromKey(platform.logoObjectKey, 60 * 30),
  };
}

export async function updateAdminBrandingSettings(
  actor: AuthUser,
  input: { companyName?: string | null },
): Promise<AdminBrandingSettingsView> {
  assertAdminActor(actor);

  if (input.companyName !== undefined) {
    if (input.companyName === null || input.companyName.trim() === "") {
      await updateUser(actor.id, { companyName: null });
    } else {
      const name = input.companyName.trim();
      if (name.length > 150) {
        throw new ValidationError("Company name must be 150 characters or fewer");
      }
      await updateUser(actor.id, { companyName: name });
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_BRANDING_UPDATED",
    entity: "User",
    entityId: actor.id,
    organizationId: actor.organizationId,
    metadata: {
      companyNameUpdated: input.companyName !== undefined,
    },
  });

  return getAdminBrandingSettings(actor);
}

export async function uploadAdminBrandingLogo(
  actor: AuthUser,
  input: { contentType: string; body: Buffer },
): Promise<AdminBrandingSettingsView> {
  assertAdminActor(actor);
  assertStorageReady();

  const contentType = input.contentType === "image/jpg" ? "image/jpeg" : input.contentType;
  assertLogoUploadMeta({ contentType, contentLength: input.body.byteLength });

  const admin = await findUserById(actor.id);
  if (!admin) {
    throw new ForbiddenError("Administrator account not found");
  }

  const objectKey = buildAdminBrandingLogoKey(actor.id, contentType);
  await uploadObject({
    key: objectKey,
    body: input.body,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  const previousKey = admin.companyLogoObjectKey;
  await updateUser(actor.id, { companyLogoObjectKey: objectKey });

  if (previousKey && previousKey !== objectKey && isAdminBrandingLogoKey(actor.id, previousKey)) {
    try {
      await deleteObject(previousKey);
    } catch {
      // Best-effort cleanup.
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_BRANDING_LOGO_UPDATED",
    entity: "User",
    entityId: actor.id,
    organizationId: actor.organizationId,
    metadata: { logoObjectKey: objectKey },
  });

  return getAdminBrandingSettings(actor);
}

export async function removeAdminBrandingLogo(
  actor: AuthUser,
): Promise<AdminBrandingSettingsView> {
  assertAdminActor(actor);
  const admin = await findUserById(actor.id);
  if (!admin) {
    throw new ForbiddenError("Administrator account not found");
  }

  const previousKey = admin.companyLogoObjectKey;
  await updateUser(actor.id, { companyLogoObjectKey: null });

  if (previousKey && isR2Configured() && isAdminBrandingLogoKey(actor.id, previousKey)) {
    try {
      await deleteObject(previousKey);
    } catch {
      // Ignore orphan cleanup failures.
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_BRANDING_LOGO_REMOVED",
    entity: "User",
    entityId: actor.id,
    organizationId: actor.organizationId,
  });

  return getAdminBrandingSettings(actor);
}
