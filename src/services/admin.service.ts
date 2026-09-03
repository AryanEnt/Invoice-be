import type { AccountStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { toAdminView } from "../lib/public-user.js";
import { createInvitationToken, generateTemporaryPassword } from "../lib/temporary-credentials.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import { deleteSessionsByUserId } from "../repositories/session.repository.js";
import {
  createUser,
  findAdminById,
  findUserByEmail,
  listAdmins,
  updateUser,
} from "../repositories/user.repository.js";
import type { AdminView, AuthUser } from "../types/auth.js";
import { resolveManagedOrganizationId } from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

async function requireSuperAdmin(actor: AuthUser): Promise<void> {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a SUPER_ADMIN can manage ADMIN accounts");
  }
}

async function requireOrganization(organizationId: string) {
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }
  return organization;
}

export async function listAdminAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: AccountStatus;
    organizationId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: AdminView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  await requireSuperAdmin(actor);

  const { items, total } = await listAdmins(query);

  return {
    items: items.map((item) => toAdminView(item)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getAdminAccount(actor: AuthUser, id: string): Promise<AdminView> {
  await requireSuperAdmin(actor);

  const admin = await findAdminById(id);
  if (!admin) {
    throw new NotFoundError("Administrator not found");
  }

  return toAdminView(admin);
}

export async function createAdmin(
  actor: AuthUser,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    organizationId?: string;
    temporaryPassword?: string;
    password?: string;
    status?: AccountStatus;
  },
): Promise<{ user: AdminView; temporaryPassword: string | null; invitationToken: string }> {
  await requireSuperAdmin(actor);

  const resolvedOrganizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await requireOrganization(resolvedOrganizationId);
  const email = input.email.toLowerCase();

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const providedPassword = input.temporaryPassword ?? input.password;
  const generatedPassword = providedPassword ? null : generateTemporaryPassword();
  const passwordToHash = providedPassword ?? generatedPassword;
  if (!passwordToHash) {
    throw new ConflictError("A temporary password is required");
  }

  const invitation = createInvitationToken();

  const created = await createUser({
    email,
    passwordHash: await hashPassword(passwordToHash),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? null,
    role: "ADMIN",
    status: input.status ?? "ACTIVE",
    organizationId: organization.id,
    passwordResetToken: invitation.tokenHash,
    passwordResetExpires: invitation.expiresAt,
  });

  const admin = await findAdminById(created.id);
  if (!admin) {
    throw new NotFoundError("Administrator not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_CREATED",
    entity: "User",
    entityId: admin.id,
    organizationId: organization.id,
    metadata: { email: admin.email, status: admin.status },
  });

  return {
    user: toAdminView(admin),
    temporaryPassword: generatedPassword ?? providedPassword ?? null,
    invitationToken: invitation.token,
  };
}

export async function updateAdmin(
  actor: AuthUser,
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    organizationId?: string;
    teamIds?: string[];
    role?: unknown;
  },
): Promise<AdminView> {
  await requireSuperAdmin(actor);

  if (input.role !== undefined) {
    throw new ForbiddenError("Role cannot be changed through this endpoint");
  }

  const admin = await findAdminById(id);
  if (!admin) {
    throw new NotFoundError("Administrator not found");
  }

  let organizationId = admin.organizationId;
  if (input.organizationId) {
    const organization = await requireOrganization(input.organizationId);
    organizationId = organization.id;
  }

  if (input.email) {
    const email = input.email.toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== admin.id) {
      throw new ConflictError("A user with this email already exists");
    }
  }

  await updateUser(admin.id, {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    organizationId,
  });

  const updated = await findAdminById(admin.id);
  if (!updated) {
    throw new NotFoundError("Administrator not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_UPDATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email },
  });

  return toAdminView(updated);
}

export async function updateAdminStatus(
  actor: AuthUser,
  id: string,
  status: AccountStatus,
): Promise<AdminView> {
  await requireSuperAdmin(actor);

  const admin = await findAdminById(id);
  if (!admin) {
    throw new NotFoundError("Administrator not found");
  }

  await updateUser(admin.id, { status });

  if (status === "INACTIVE") {
    await deleteSessionsByUserId(admin.id);
  }

  const updated = await findAdminById(admin.id);
  if (!updated) {
    throw new NotFoundError("Administrator not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: status === "ACTIVE" ? "ADMIN_ACTIVATED" : "ADMIN_DEACTIVATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email, status },
  });

  return toAdminView(updated);
}

export async function resetAdminPassword(
  actor: AuthUser,
  id: string,
): Promise<{ temporaryPassword: string }> {
  await requireSuperAdmin(actor);
  const admin = await findAdminById(id);
  if (!admin) {
    throw new NotFoundError("Administrator not found");
  }
  const temporaryPassword = generateTemporaryPassword();
  await updateUser(admin.id, { passwordHash: await hashPassword(temporaryPassword) });
  await deleteSessionsByUserId(admin.id);
  await recordAudit({
    actorId: actor.id,
    action: "ADMIN_PASSWORD_RESET",
    entity: "User",
    entityId: admin.id,
    organizationId: admin.organizationId,
    metadata: { email: admin.email },
  });
  return { temporaryPassword };
}
