import { ForbiddenError, NotFoundError, ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { isR2Configured } from "../integrations/storage/r2.client.js";
import {
  assertLogoUploadMeta,
  buildOrganizationLogoKey,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  getObject,
  headObject,
  isOrganizationLogoKey,
  uploadObject,
} from "../integrations/storage/r2.service.js";
import {
  findOrganizationById,
  getDefaultOrganizationId,
  updateOrganization,
} from "../repositories/organization.repository.js";
import type { AuthUser } from "../types/auth.js";
import { assertOrganizationAccess } from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function assertStorageReady(): void {
  if (!isR2Configured()) {
    throw new ServiceUnavailableError(
      "File storage is not configured yet.",
      "R2_NOT_CONFIGURED",
    );
  }
}

async function requireOrganizationForActor(actor: AuthUser) {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a Super Admin can manage the organization logo");
  }

  let id = actor.organizationId;
  if (!id && actor.role === "SUPER_ADMIN") {
    id = await getDefaultOrganizationId();
  }

  if (!id) {
    throw new ValidationError("No organization is available for logo settings");
  }

  assertOrganizationAccess(actor, id);
  const organization = await findOrganizationById(id);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }
  return organization;
}

export async function getOrganizationLogoUrl(
  organizationId: string,
  options?: { expiresInSeconds?: number; actor?: AuthUser },
): Promise<string | null> {
  if (options?.actor) {
    assertOrganizationAccess(options.actor, organizationId);
  }

  const organization = await findOrganizationById(organizationId);
  if (!organization?.logoObjectKey) {
    return null;
  }

  if (!isR2Configured()) {
    return null;
  }

  return createPresignedDownloadUrl({
    key: organization.logoObjectKey,
    expiresInSeconds: options?.expiresInSeconds ?? 60 * 15,
  });
}

export async function getOrganizationLogoObject(
  organizationId: string,
): Promise<{ body: Buffer; contentType?: string; key: string } | null> {
  const organization = await findOrganizationById(organizationId);
  if (!organization?.logoObjectKey || !isR2Configured()) {
    return null;
  }
  return getObject(organization.logoObjectKey);
}

export async function getOrganizationSettings(actor: AuthUser): Promise<{
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  hasLogo: boolean;
  logoUrl: string | null;
}> {
  const organization = await requireOrganizationForActor(actor);
  const logoUrl = organization.logoObjectKey
    ? await getOrganizationLogoUrl(organization.id, { expiresInSeconds: 60 * 30 })
    : null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    isActive: organization.isActive,
    hasLogo: Boolean(organization.logoObjectKey),
    logoUrl,
  };
}

export async function createOrganizationLogoUploadUrl(
  actor: AuthUser,
  input: { contentType: string; contentLength: number },
): Promise<{ uploadUrl: string; objectKey: string; expiresInSeconds: number }> {
  assertStorageReady();
  const organization = await requireOrganizationForActor(actor);
  assertLogoUploadMeta(input);

  const objectKey = buildOrganizationLogoKey(organization.id, input.contentType);
  const expiresInSeconds = 60 * 5;
  const uploadUrl = await createPresignedUploadUrl({
    key: objectKey,
    contentType: input.contentType,
    expiresInSeconds,
  });

  return { uploadUrl, objectKey, expiresInSeconds };
}

export async function uploadOrganizationLogo(
  actor: AuthUser,
  input: { contentType: string; body: Buffer },
): Promise<{
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  hasLogo: boolean;
  logoUrl: string | null;
}> {
  assertStorageReady();
  const organization = await requireOrganizationForActor(actor);
  const contentType = input.contentType === "image/jpg" ? "image/jpeg" : input.contentType;
  assertLogoUploadMeta({ contentType, contentLength: input.body.byteLength });

  const objectKey = buildOrganizationLogoKey(organization.id, contentType);
  await uploadObject({
    key: objectKey,
    body: input.body,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  return persistOrganizationLogo(actor, organization, objectKey);
}

export async function confirmOrganizationLogoUpload(
  actor: AuthUser,
  input: { objectKey: string; contentType: string },
): Promise<{
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  hasLogo: boolean;
  logoUrl: string | null;
}> {
  assertStorageReady();
  const organization = await requireOrganizationForActor(actor);

  if (!isOrganizationLogoKey(organization.id, input.objectKey)) {
    throw new ValidationError("Invalid logo upload key");
  }

  assertLogoUploadMeta({ contentType: input.contentType, contentLength: 1 });

  const head = await headObject(input.objectKey);
  if (!head) {
    throw new ValidationError("Logo upload was not found. Please try again.");
  }
  if (head.contentLength !== undefined) {
    assertLogoUploadMeta({
      contentType: input.contentType,
      contentLength: head.contentLength,
    });
  }

  return persistOrganizationLogo(actor, organization, input.objectKey);
}

async function persistOrganizationLogo(
  actor: AuthUser,
  organization: Awaited<ReturnType<typeof requireOrganizationForActor>>,
  objectKey: string,
): Promise<{
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  hasLogo: boolean;
  logoUrl: string | null;
}> {
  const previousKey = organization.logoObjectKey;
  const updated = await updateOrganization(organization.id, {
    logoObjectKey: objectKey,
  });

  if (previousKey && previousKey !== objectKey) {
    try {
      await deleteObject(previousKey);
    } catch {
      // Best-effort cleanup; new logo is already committed.
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: "ORGANIZATION_LOGO_UPDATED",
    entity: "Organization",
    entityId: updated.id,
    organizationId: updated.id,
    metadata: { logoObjectKey: objectKey },
  });

  const logoUrl = await getOrganizationLogoUrl(updated.id, { expiresInSeconds: 60 * 30 });

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    isActive: updated.isActive,
    hasLogo: true,
    logoUrl,
  };
}

export async function removeOrganizationLogo(actor: AuthUser): Promise<{
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  hasLogo: boolean;
  logoUrl: null;
}> {
  const organization = await requireOrganizationForActor(actor);
  const previousKey = organization.logoObjectKey;

  const updated = await updateOrganization(organization.id, {
    logoObjectKey: null,
  });

  if (previousKey && isR2Configured()) {
    try {
      await deleteObject(previousKey);
    } catch {
      // Ignore orphan cleanup failures.
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: "ORGANIZATION_LOGO_REMOVED",
    entity: "Organization",
    entityId: updated.id,
    organizationId: updated.id,
  });

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    isActive: updated.isActive,
    hasLogo: false,
    logoUrl: null,
  };
}
