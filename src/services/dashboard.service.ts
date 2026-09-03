import { Permissions } from "../config/permissions.js";
import { resolveDateRange, type DatePreset } from "../lib/date-range.js";
import { resolveAdministratorId, resolveInvoiceUserScope } from "../lib/admin-scope.js";
import { loadDashboardSnapshot } from "../repositories/dashboard.repository.js";
import { getSoleOrganizationId, listOrganizations } from "../repositories/organization.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { DashboardView } from "../types/dashboard.js";
import { scopedOrganizationFilter } from "../utils/organization-scope.js";

export async function getDashboard(
  actor: AuthUser,
  query: {
    organizationId?: string;
    preset?: DatePreset;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<DashboardView> {
  const organizationId =
    actor.role === "SUPER_ADMIN"
      ? (query.organizationId ?? (await getSoleOrganizationId()) ?? undefined)
      : scopedOrganizationFilter(actor, query.organizationId);
  const range = resolveDateRange(query.preset ?? "this_year", query.dateFrom, query.dateTo);
  const isAdmin = actor.role === "ADMIN";
  const userScope = await resolveInvoiceUserScope(actor);
  const administratorId = await resolveAdministratorId(actor);

  const snapshot = await loadDashboardSnapshot({
    organizationId,
    userIds: userScope?.userIds,
    administratorId: isAdmin ? actor.id : (administratorId ?? undefined),
    range,
  });

  const isSuperAdmin = actor.role === "SUPER_ADMIN";
  const isMember = actor.role === "MEMBER";
  const isSystem = isSuperAdmin;
  const canViewExpenses =
    !isMember && !isAdmin && actor.permissions.includes(Permissions.EXPENSES_VIEW);

  const platformOrganizations = isSuperAdmin ? await listOrganizations() : [];
  const activeOrganizations = isSuperAdmin
    ? platformOrganizations.filter((organization) => organization.isActive).length
    : null;
  const inactiveOrganizations = isSuperAdmin
    ? platformOrganizations.filter((organization) => !organization.isActive).length
    : null;

  return {
    role: actor.role,
    scope: isAdmin ? "ADMIN" : isMember ? "MEMBER" : isSystem ? "SYSTEM" : "ORGANIZATION",
    organizationId: organizationId ?? null,
    currency: snapshot.currency,
    granularity: snapshot.granularity,
    range: {
      preset: query.preset ?? "this_year",
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    metrics: {
      organizations: isMember ? null : snapshot.organizationCount,
      activeOrganizations,
      inactiveOrganizations,
      admins: isSuperAdmin ? snapshot.adminCount : null,
      members: isMember ? null : snapshot.memberCount,
      customers: snapshot.customerCount,
      invoices: snapshot.invoiceCount,
      paidInvoices: snapshot.paidInvoiceCount,
      unpaidInvoices: snapshot.unpaidInvoiceCount,
      overdueInvoices: snapshot.overdueInvoiceCount,
      partiallyPaidInvoices: snapshot.partiallyPaidInvoiceCount,
      expenses: canViewExpenses ? snapshot.expenseTotal : "0",
      revenue: snapshot.revenue,
      paidAmount: snapshot.paidAmount,
      outstandingBalance: snapshot.outstandingBalance,
      overdueAmount: snapshot.overdueAmount,
      draftInvoices: snapshot.draftInvoiceCount,
      sentInvoices: snapshot.sentInvoiceCount,
      viewedInvoices: snapshot.viewedInvoiceCount,
      cancelledInvoices: snapshot.cancelledInvoiceCount,
      failedEmails: snapshot.failedEmailCount,
      adminsWithoutMembers: snapshot.adminsWithoutMembers,
    },
    invoiceStatusSeries: snapshot.statusCounts,
    revenueSeries: snapshot.revenueSeries,
    invoiceCountSeries: snapshot.invoiceCountSeries,
    paymentSeries: snapshot.paymentSeries,
    expenseSeries: canViewExpenses ? snapshot.expenseSeries : [],
    memberPerformance: snapshot.memberPerformance,
    topCustomers: snapshot.topCustomers,
    organizationActivity: snapshot.organizationActivity,
    recentInvoices: snapshot.recentInvoices,
    recentPayments: snapshot.recentPayments,
    overdueInvoices: snapshot.overdueInvoices,
    organizations: platformOrganizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
    })),
    currencies: snapshot.currencies,
    revenueByCurrency: snapshot.revenueByCurrency,
    outstandingByCurrency: snapshot.outstandingByCurrency,
    overdueByCurrency: snapshot.overdueByCurrency,
    emailDelivery: snapshot.emailDelivery,
    invoiceCreatedSeries: snapshot.invoiceCreatedSeries,
    invoiceSentSeries: snapshot.invoiceSentSeries,
    invoicePaidSeries: snapshot.invoicePaidSeries,
    administratorOverview: snapshot.administratorOverview,
    recentCustomers: snapshot.recentCustomers,
  };
}
