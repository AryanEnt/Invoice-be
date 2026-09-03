import {
  assertAdministratorOwnsMember,
  resolveAdministratorId,
  resolveInvoiceUserScope,
} from "../lib/admin-scope.js";
import { resolveDateRange, type DatePreset } from "../lib/date-range.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { getSoleOrganizationId, listOrganizations } from "../repositories/organization.repository.js";
import { loadReport } from "../repositories/report.repository.js";
import {
  findAdminById,
  findMemberById,
  listMemberIdsByAdministrator,
} from "../repositories/user.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { ReportKind, ReportView } from "../types/report.js";
import { scopedOrganizationFilter } from "../utils/organization-scope.js";

async function resolveReportAccess(
  actor: AuthUser,
  query: { memberId?: string; administratorId?: string },
): Promise<{
  userIds?: string[];
  administratorId?: string;
  expenseCreatedById?: string;
  memberId: string | null;
}> {
  if (actor.role === "MEMBER") {
    return {
      userIds: [actor.id],
      administratorId: (await resolveAdministratorId(actor)) ?? undefined,
      expenseCreatedById: actor.id,
      memberId: actor.id,
    };
  }

  if (query.administratorId) {
    if (actor.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("You cannot filter reports by administrator");
    }

    const admin = await findAdminById(query.administratorId);
    if (!admin) {
      throw new NotFoundError("Administrator not found");
    }

    if (query.memberId) {
      const member = await findMemberById(query.memberId);
      if (!member) {
        throw new NotFoundError("Member not found");
      }
      if (member.administratorId !== admin.id) {
        throw new ForbiddenError("Member does not belong to this administrator");
      }

      return {
        userIds: [member.id],
        administratorId: admin.id,
        expenseCreatedById: member.id,
        memberId: member.id,
      };
    }

    const memberIds = await listMemberIdsByAdministrator(admin.id);
    return {
      userIds: memberIds,
      administratorId: admin.id,
      expenseCreatedById: undefined,
      memberId: null,
    };
  }

  if (query.memberId) {
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("You cannot filter reports by member");
    }

    const member = await findMemberById(query.memberId);
    if (!member) {
      throw new NotFoundError("Member not found");
    }

    assertAdministratorOwnsMember(actor, member);

    return {
      userIds: [member.id],
      administratorId:
        actor.role === "ADMIN" ? actor.id : (member.administratorId ?? undefined),
      expenseCreatedById: member.id,
      memberId: member.id,
    };
  }

  const userScope = await resolveInvoiceUserScope(actor);
  const administratorId = await resolveAdministratorId(actor);

  return {
    userIds: userScope?.userIds,
    administratorId: administratorId ?? undefined,
    expenseCreatedById: undefined,
    memberId: null,
  };
}

export async function getReport(
  actor: AuthUser,
  query: {
    kind: ReportKind;
    preset: DatePreset;
    dateFrom?: string;
    dateTo?: string;
    organizationId?: string;
    administratorId?: string;
    memberId?: string;
    page: number;
    pageSize: number;
    csv?: boolean;
  },
): Promise<ReportView & { memberId: string | null }> {
  const organizationId =
    actor.role === "SUPER_ADMIN"
      ? (query.organizationId ?? (await getSoleOrganizationId()) ?? undefined)
      : scopedOrganizationFilter(actor, query.organizationId);
  const range = resolveDateRange(query.preset, query.dateFrom, query.dateTo);
  const access = await resolveReportAccess(actor, {
    memberId: query.memberId,
    administratorId: query.administratorId,
  });

  const loaded = await loadReport({
    kind: query.kind,
    preset: query.preset,
    range,
    scope: {
      organizationId,
      userIds: access.userIds,
      administratorId: access.administratorId,
      expenseCreatedById: access.expenseCreatedById,
    },
    page: query.page,
    pageSize: query.pageSize,
    csv: query.csv,
  });

  const organizations =
    actor.role === "SUPER_ADMIN"
      ? (await listOrganizations()).map((organization) => ({
          id: organization.id,
          name: organization.name,
        }))
      : [];

  const isSystem = actor.role === "SUPER_ADMIN";

  return {
    ...loaded,
    role: actor.role,
    scope:
      actor.role === "MEMBER"
        ? "MEMBER"
        : actor.role === "ADMIN"
          ? "ADMIN"
          : isSystem
            ? "SYSTEM"
            : "ORGANIZATION",
    organizationId: organizationId ?? null,
    memberId: access.memberId,
    organizations,
    overview: loaded.overview,
    series: loaded.series,
    breakdown: loaded.breakdown,
    table: loaded.table,
  };
}
