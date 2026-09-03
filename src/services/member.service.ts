import type { AccountStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { assertAdministratorOwnsMember } from "../lib/admin-scope.js";
import { toMemberView } from "../lib/member-view.js";
import { hashPassword } from "../lib/password.js";
import { createInvitationToken, generateTemporaryPassword } from "../lib/temporary-credentials.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import { deleteSessionsByUserId } from "../repositories/session.repository.js";
import {
  createUser,
  findMemberById,
  findUserByEmail,
  listMemberAdministrators,
  listMembers,
  updateUser,
} from "../repositories/user.repository.js";
import type { AuthUser, MemberView } from "../types/auth.js";
import {
  resolveManagedOrganizationId,
  scopedOrganizationFilter,
} from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function canViewMembers(actor: AuthUser): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
}

function canCreateMembers(actor: AuthUser): boolean {
  return actor.role === "ADMIN";
}

export async function listMemberAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: AccountStatus;
    organizationId?: string;
    administratorId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: MemberView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  if (!canViewMembers(actor)) {
    throw new ForbiddenError("You cannot view members");
  }

  const organizationId = scopedOrganizationFilter(actor, query.organizationId);
  const administratorId =
    actor.role === "ADMIN" ? actor.id : query.administratorId;

  const { items, total } = await listMembers({
    ...query,
    organizationId,
    administratorId,
  });

  return {
    items: items.map((member) => toMemberView(member, member.organization, member.administrator)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listMemberAdministratorOptions(
  actor: AuthUser,
  query: { organizationId?: string } = {},
): Promise<{
  items: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  unassignedCount: number;
}> {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("You cannot view member administrator filters");
  }

  const organizationId = scopedOrganizationFilter(actor, query.organizationId);
  return listMemberAdministrators({ organizationId });
}

export async function getMemberAccount(actor: AuthUser, id: string): Promise<MemberView> {
  if (!canViewMembers(actor)) {
    throw new ForbiddenError("You cannot view members");
  }

  const member = await findMemberById(id);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  assertAdministratorOwnsMember(actor, member);

  return toMemberView(member, member.organization, member.administrator);
}

export async function createMember(
  actor: AuthUser,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    organizationId?: string;
    temporaryPassword?: string;
    password?: string;
    status?: AccountStatus;
    role?: unknown;
  },
): Promise<{ user: MemberView; temporaryPassword: string | null; invitationToken: string }> {
  if (input.role !== undefined) {
    throw new ForbiddenError("Role cannot be assigned through this endpoint");
  }

  if (!canCreateMembers(actor)) {
    throw new ForbiddenError("You cannot create members");
  }

  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

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
    phone: null,
    role: "MEMBER",
    status: input.status ?? "ACTIVE",
    organizationId,
    administratorId: actor.id,
    passwordResetToken: invitation.tokenHash,
    passwordResetExpires: invitation.expiresAt,
  });

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_CREATED",
    entity: "User",
    entityId: created.id,
    organizationId,
    metadata: { email: created.email, administratorId: actor.id },
  });

  const member = await findMemberById(created.id);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  return {
    user: toMemberView(member, member.organization, member.administrator),
    temporaryPassword: providedPassword ?? generatedPassword,
    invitationToken: invitation.token,
  };
}

export async function updateMember(
  actor: AuthUser,
  memberId: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    temporaryPassword?: string;
    password?: string;
    role?: unknown;
  },
): Promise<{ user: MemberView; temporaryPassword: string | null }> {
  if (input.role !== undefined) {
    throw new ForbiddenError("Role cannot be changed through this endpoint");
  }

  if (!canViewMembers(actor)) {
    throw new ForbiddenError("You cannot update members");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  assertAdministratorOwnsMember(actor, member);

  if (input.email) {
    const email = input.email.toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== member.id) {
      throw new ConflictError("A user with this email already exists");
    }
  }

  const nextPassword = input.temporaryPassword ?? input.password;

  await updateUser(member.id, {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    ...(nextPassword ? { passwordHash: await hashPassword(nextPassword) } : {}),
  });

  if (nextPassword) {
    await deleteSessionsByUserId(member.id);
  }

  const updated = await findMemberById(member.id);
  if (!updated) {
    throw new NotFoundError("Member not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_UPDATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email },
  });

  return {
    user: toMemberView(updated, updated.organization, updated.administrator),
    temporaryPassword: nextPassword ?? null,
  };
}

export async function resetMemberPassword(
  actor: AuthUser,
  memberId: string,
): Promise<{ temporaryPassword: string }> {
  if (!canViewMembers(actor)) {
    throw new ForbiddenError("You cannot update members");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  assertAdministratorOwnsMember(actor, member);

  const temporaryPassword = generateTemporaryPassword();
  await updateUser(member.id, { passwordHash: await hashPassword(temporaryPassword) });
  await deleteSessionsByUserId(member.id);

  await recordAudit({
    actorId: actor.id,
    action: "MEMBER_PASSWORD_RESET",
    entity: "User",
    entityId: member.id,
    organizationId: member.organizationId,
    metadata: { email: member.email },
  });

  return { temporaryPassword };
}

export async function updateMemberStatus(
  actor: AuthUser,
  memberId: string,
  status: AccountStatus,
): Promise<MemberView> {
  if (!canViewMembers(actor)) {
    throw new ForbiddenError("You cannot update members");
  }

  const member = await findMemberById(memberId);
  if (!member) {
    throw new NotFoundError("Member not found");
  }

  assertAdministratorOwnsMember(actor, member);

  await updateUser(member.id, { status });

  if (status === "INACTIVE") {
    await deleteSessionsByUserId(member.id);
  }

  const updated = await findMemberById(member.id);
  if (!updated) {
    throw new NotFoundError("Member not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: status === "ACTIVE" ? "MEMBER_UPDATED" : "MEMBER_DEACTIVATED",
    entity: "User",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { email: updated.email, status },
  });

  return toMemberView(updated, updated.organization, updated.administrator);
}
