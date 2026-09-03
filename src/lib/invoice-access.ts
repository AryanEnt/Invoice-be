import { resolveInvoiceUserScope } from "./admin-scope.js";
import { ForbiddenError } from "./errors.js";
import type { AuthUser } from "../types/auth.js";

export interface InvoiceAccessTarget {
  organizationId: string;
  createdById: string;
  assignedMemberId: string | null;
}

export async function assertInvoiceAccess(
  actor: AuthUser,
  invoice: InvoiceAccessTarget,
): Promise<void> {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }
  if (actor.organizationId !== invoice.organizationId) {
    throw new ForbiddenError("You do not have access to this organization");
  }

  const scope = await resolveInvoiceUserScope(actor);
  if (!scope) {
    return;
  }

  const allowed =
    scope.userIds.includes(invoice.createdById) ||
    (invoice.assignedMemberId !== null && scope.userIds.includes(invoice.assignedMemberId));

  if (!allowed) {
    throw new ForbiddenError("You do not have access to this invoice");
  }
}
