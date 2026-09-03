import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import {
  createOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  findOrganizationOverviewById,
  listOrganizationOverviews,
  updateOrganization,
  type OrganizationOverviewRecord,
} from "../repositories/organization.repository.js";
import type { AuthUser, OrganizationRecord } from "../types/auth.js";
import { slugify } from "../utils/slug.js";
import { recordAudit } from "./audit.service.js";

function toOrganizationView(organization: {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    isActive: organization.isActive,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

async function requireSuperAdmin(actor: AuthUser): Promise<void> {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a SUPER_ADMIN can manage organizations");
  }
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let suffix = 2;

  while (await findOrganizationBySlug(candidate, excludeId)) {
    const extra = `-${suffix}`;
    candidate = `${root.slice(0, Math.max(1, 60 - extra.length))}${extra}`;
    suffix += 1;
  }

  return candidate;
}

export async function getOrganization(id: string): Promise<OrganizationRecord> {
  const organization = await findOrganizationById(id);

  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  return organization;
}

function toOrganizationOverview(organization: OrganizationOverviewRecord) {
  return {
    ...toOrganizationView(organization),
    admin: organization.admin,
    adminCount: organization.adminCount,
    memberCount: organization.memberCount,
    customerCount: organization.customerCount,
    invoiceCount: organization.invoiceCount,
  };
}

export async function listOrganizationAccounts(): Promise<
  ReturnType<typeof toOrganizationOverview>[]
> {
  const organizations = await listOrganizationOverviews();
  return organizations.map(toOrganizationOverview);
}

export async function getOrganizationOverview(
  actor: AuthUser,
  id: string,
): Promise<ReturnType<typeof toOrganizationOverview>> {
  if (actor.role === "SUPER_ADMIN") {
    const organization = await findOrganizationOverviewById(id);
    if (!organization) {
      throw new NotFoundError("Organization not found");
    }
    return toOrganizationOverview(organization);
  }

  if (actor.organizationId !== id) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const organization = await findOrganizationOverviewById(id);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }
  return toOrganizationOverview(organization);
}

export async function createOrganizationAccount(
  actor: AuthUser,
  input: { name: string; slug?: string },
): Promise<ReturnType<typeof toOrganizationView>> {
  await requireSuperAdmin(actor);

  const slug = input.slug ? slugify(input.slug) : await uniqueSlug(input.name);
  const existing = await findOrganizationBySlug(slug);
  if (existing) {
    throw new ConflictError("An organization with this slug already exists");
  }

  const organization = await createOrganization({
    name: input.name.trim(),
    slug,
  });

  await recordAudit({
    actorId: actor.id,
    action: "ORGANIZATION_CREATED",
    entity: "Organization",
    entityId: organization.id,
    organizationId: organization.id,
    metadata: { name: organization.name, slug: organization.slug },
  });

  return toOrganizationView(organization);
}

export async function updateOrganizationAccount(
  actor: AuthUser,
  id: string,
  input: { name?: string; slug?: string },
): Promise<ReturnType<typeof toOrganizationView>> {
  await requireSuperAdmin(actor);
  const current = await getOrganization(id);

  const nextName = input.name?.trim() ?? current.name;
  const nextSlug = input.slug ? slugify(input.slug) : current.slug;

  if (nextSlug !== current.slug) {
    const existing = await findOrganizationBySlug(nextSlug, current.id);
    if (existing) {
      throw new ConflictError("An organization with this slug already exists");
    }
  }

  const organization = await updateOrganization(current.id, {
    name: nextName,
    slug: nextSlug,
  });

  await recordAudit({
    actorId: actor.id,
    action: "ORGANIZATION_UPDATED",
    entity: "Organization",
    entityId: organization.id,
    organizationId: organization.id,
    metadata: { name: organization.name, slug: organization.slug },
  });

  return toOrganizationView(organization);
}

export async function updateOrganizationStatus(
  actor: AuthUser,
  id: string,
  isActive: boolean,
): Promise<ReturnType<typeof toOrganizationView>> {
  await requireSuperAdmin(actor);
  await getOrganization(id);

  const organization = await updateOrganization(id, { isActive });

  await recordAudit({
    actorId: actor.id,
    action: isActive ? "ORGANIZATION_ACTIVATED" : "ORGANIZATION_DEACTIVATED",
    entity: "Organization",
    entityId: organization.id,
    organizationId: organization.id,
  });

  return toOrganizationView(organization);
}

export { toOrganizationView };
