import { ForbiddenError } from "./errors.js";
import { findUserById, listMemberIdsByAdministrator } from "../repositories/user.repository.js";
import type { AuthUser } from "../types/auth.js";

export interface InvoiceUserScope {
  userIds: string[];
}

export function buildInvoiceUserAccessFilter(userIds: string[]) {
  return {
    OR: [{ createdById: { in: userIds } }, { assignedMemberId: { in: userIds } }],
  };
}

export async function resolveInvoiceUserScope(
  actor: AuthUser,
): Promise<InvoiceUserScope | undefined> {
  if (actor.role === "SUPER_ADMIN") {
    return undefined;
  }
  if (actor.role === "MEMBER") {
    return { userIds: [actor.id] };
  }
  if (actor.role === "ADMIN") {
    const memberIds = await listMemberIdsByAdministrator(actor.id);
    return { userIds: memberIds };
  }
  const memberIds = await listMemberIdsByAdministrator(actor.id);
  return { userIds: [actor.id, ...memberIds] };
}

export async function resolveAdministratorId(actor: AuthUser): Promise<string | null> {
  if (actor.role === "ADMIN") {
    return actor.id;
  }
  if (actor.role === "MEMBER") {
    const user = await findUserById(actor.id);
    return user?.administratorId ?? null;
  }
  return null;
}

export function assertAdministratorOwnsMember(
  actor: AuthUser,
  member: { organizationId: string | null; administratorId: string | null },
): void {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("You do not have access to this member");
  }
  if (member.organizationId !== actor.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }
  if (member.administratorId !== actor.id) {
    throw new ForbiddenError("You do not have access to this member");
  }
}

export async function assertCustomerScope(
  actor: AuthUser,
  customer: { organizationId: string; administratorId: string | null },
): Promise<void> {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }
  if (actor.role === "ADMIN") {
    throw new ForbiddenError("Administrators cannot access customer records");
  }
  if (actor.organizationId !== customer.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }
  const adminId = await resolveAdministratorId(actor);
  if (customer.administratorId !== adminId) {
    throw new ForbiddenError("You do not have access to this customer");
  }
}
