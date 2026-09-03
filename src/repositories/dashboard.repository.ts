import { buildInvoiceUserAccessFilter } from "../lib/admin-scope.js";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  periodKey,
  periodKeys,
  rangeDayCount,
  startOfUtcDay,
  type DateRange,
} from "../lib/date-range.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "../lib/invoice-status.js";
import { money, moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import type {
  DashboardAdministratorOverview,
  DashboardEmailDelivery,
  DashboardGranularity,
  DashboardInvoiceSummary,
  DashboardMemberPerformance,
  DashboardMoneyByCurrency,
  DashboardOrganizationActivity,
  DashboardPaymentSummary,
  DashboardRecentCustomer,
  DashboardSeriesPoint,
  DashboardStatusCount,
  DashboardTopCustomer,
} from "../types/dashboard.js";

export interface DashboardQueryScope {
  organizationId?: string;
  userIds?: string[];
  administratorId?: string;
  range: DateRange;
}

export interface DashboardSnapshot {
  organizationCount: number;
  adminCount: number;
  memberCount: number;
  customerCount: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  partiallyPaidInvoiceCount: number;
  expenseTotal: string;
  revenue: string;
  paidAmount: string;
  outstandingBalance: string;
  overdueAmount: string;
  draftInvoiceCount: number;
  sentInvoiceCount: number;
  viewedInvoiceCount: number;
  cancelledInvoiceCount: number;
  failedEmailCount: number;
  adminsWithoutMembers: number;
  currency: string;
  currencies: string[];
  granularity: DashboardGranularity;
  statusCounts: DashboardStatusCount[];
  revenueSeries: DashboardSeriesPoint[];
  invoiceCountSeries: DashboardSeriesPoint[];
  invoiceCreatedSeries: DashboardSeriesPoint[];
  invoiceSentSeries: DashboardSeriesPoint[];
  invoicePaidSeries: DashboardSeriesPoint[];
  paymentSeries: DashboardSeriesPoint[];
  expenseSeries: DashboardSeriesPoint[];
  revenueByCurrency: DashboardMoneyByCurrency[];
  outstandingByCurrency: DashboardMoneyByCurrency[];
  overdueByCurrency: DashboardMoneyByCurrency[];
  emailDelivery: DashboardEmailDelivery;
  memberPerformance: DashboardMemberPerformance[];
  topCustomers: DashboardTopCustomer[];
  organizationActivity: DashboardOrganizationActivity[];
  administratorOverview: DashboardAdministratorOverview[];
  recentCustomers: DashboardRecentCustomer[];
  recentInvoices: DashboardInvoiceSummary[];
  recentPayments: DashboardPaymentSummary[];
  overdueInvoices: DashboardInvoiceSummary[];
  organizations: Array<{ id: string; name: string }>;
}

export async function loadDashboardSnapshot(
  scope: DashboardQueryScope,
  now = new Date(),
): Promise<DashboardSnapshot> {
  const invoiceWhere = buildInvoiceWhere(scope);
  const invoiceInRange: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    invoiceDate: { gte: scope.range.start, lt: scope.range.end },
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    status: "COMPLETED",
    paidAt: { gte: scope.range.start, lt: scope.range.end },
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.userIds ? { invoice: invoiceWhere } : {}),
  };
  const expenseWhere: Prisma.ExpenseWhereInput = {
    incurredOn: { gte: scope.range.start, lt: scope.range.end },
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
  };
  const userWhere = scope.organizationId ? { organizationId: scope.organizationId } : {};
  const overdueWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    dueDate: { lt: startOfUtcDay(now) },
  };
  const outstandingWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { notIn: ["DRAFT", "CANCELLED"] },
  };
  const daily = rangeDayCount(scope.range) <= 31;
  const granularity: DashboardGranularity = daily ? "day" : "month";

  const [
    organizationCount,
    adminCount,
    memberCount,
    customerCount,
    invoiceCount,
    paidInvoiceCount,
    unpaidInvoiceCount,
    overdueInvoiceCount,
    partialInvoiceCount,
    cancelledInvoiceCount,
    draftInvoiceCount,
    sentInvoiceCount,
    viewedInvoiceCount,
    emailStatusGroups,
    currencyGroups,
    paymentCurrencyGroups,
    outstandingRows,
    overdueRows,
    sentInvoiceDates,
    paidInvoiceDates,
    allInRangeInvoices,
    administratorRows,
    recentCustomerRows,
    revenueAgg,
    outstandingAgg,
    overdueAgg,
    currencySample,
    recentInvoiceRows,
    overdueInvoiceRows,
    recentPaymentRows,
    seriesPayments,
    seriesExpenses,
    seriesInvoiceDates,
    customerGroups,
    memberGroups,
    organizationGroups,
    organizations,
  ] = await Promise.all([
    prisma.organization.count({
      where: scope.organizationId ? { id: scope.organizationId } : undefined,
    }),
    prisma.user.count({ where: { ...userWhere, role: "ADMIN" } }),
    prisma.user.count({ where: { ...userWhere, role: "MEMBER", ...(scope.administratorId ? { administratorId: scope.administratorId } : {}) } }),
    scope.administratorId
      ? prisma.customer.count({
          where: {
            ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
            administratorId: scope.administratorId,
          },
        })
      : scope.userIds
        ? prisma.invoice
            .findMany({ where: invoiceInRange, select: { customerId: true }, distinct: ["customerId"] })
            .then((rows) => rows.length)
        : prisma.customer.count({
            where: scope.organizationId ? { organizationId: scope.organizationId } : undefined,
          }),
    prisma.invoice.count({ where: invoiceInRange }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "PAID" } }),
    prisma.invoice.count({
      where: { ...invoiceInRange, status: { notIn: ["PAID", "CANCELLED"] } },
    }),
    prisma.invoice.count({ where: overdueWhere }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "PARTIALLY_PAID" } }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "CANCELLED" } }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "DRAFT" } }),
    prisma.invoice.count({ where: { ...invoiceInRange, status: "SENT" } }),
    prisma.invoice.count({
      where: {
        ...invoiceInRange,
        status: "VIEWED",
        dueDate: { gte: startOfUtcDay(now) },
      },
    }),
    prisma.invoice.groupBy({
      by: ["emailStatus"],
      where: invoiceInRange,
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ["currency"],
      where: invoiceWhere,
      _count: { _all: true },
      orderBy: { _count: { currency: "desc" } },
    }),
    prisma.payment.groupBy({
      by: ["currency"],
      where: paymentWhere,
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: outstandingWhere,
      select: { currency: true, total: true, amountPaid: true },
    }),
    prisma.invoice.findMany({
      where: overdueWhere,
      select: { currency: true, total: true, amountPaid: true },
    }),
    prisma.invoice.findMany({
      where: { ...invoiceInRange, sentAt: { not: null } },
      select: { sentAt: true },
    }),
    prisma.invoice.findMany({
      where: { ...invoiceInRange, status: "PAID" },
      select: { updatedAt: true },
    }),
    prisma.invoice.findMany({
      where: invoiceInRange,
      select: {
        createdById: true,
        assignedMemberId: true,
        status: true,
        currency: true,
        total: true,
        amountPaid: true,
      },
    }),
    prisma.user.findMany({
      where: { ...userWhere, role: "ADMIN" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        organizationId: true,
        _count: { select: { managedMembers: true, managedCustomers: true } },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.customer.findMany({
      where: {
        ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
        ...(scope.administratorId ? { administratorId: scope.administratorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.payment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: outstandingWhere,
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: overdueWhere,
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.findFirst({
      where: invoiceWhere,
      select: { currency: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: invoiceInRange,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: invoiceSummarySelect,
    }),
    prisma.invoice.findMany({
      where: overdueWhere,
      orderBy: { dueDate: "asc" },
      take: 5,
      select: invoiceSummarySelect,
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { paidAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        currency: true,
        paidAt: true,
        invoiceId: true,
        invoice: {
          select: {
            invoiceNumber: true,
            organization: { select: { name: true } },
          },
        },
        customer: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      select: { amount: true, paidAt: true, currency: true },
    }),
    prisma.expense.findMany({
      where: expenseWhere,
      select: { amount: true, incurredOn: true, currency: true },
    }),
    prisma.invoice.findMany({
      where: invoiceInRange,
      select: { invoiceDate: true, createdAt: true },
    }),
    prisma.invoice.groupBy({
      by: ["customerId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
      orderBy: { _sum: { total: "desc" } },
      take: 8,
    }),
    prisma.invoice.groupBy({
      by: ["assignedMemberId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.groupBy({
      by: ["organizationId"],
      where: invoiceInRange,
      _count: { _all: true },
      _sum: { amountPaid: true },
      orderBy: { _sum: { amountPaid: "desc" } },
      take: 8,
    }),
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const currency = currencySample?.currency ?? currencyGroups[0]?.currency ?? "USD";
  const currencies = currencyGroups.map((group) => group.currency);
  if (!currencies.includes(currency)) {
    currencies.unshift(currency);
  }
  const outstandingTotal = money(outstandingAgg._sum.total?.toString() ?? "0");
  const outstandingPaid = money(outstandingAgg._sum.amountPaid?.toString() ?? "0");
  const overdueTotal = money(overdueAgg._sum.total?.toString() ?? "0");
  const overduePaid = money(overdueAgg._sum.amountPaid?.toString() ?? "0");
  const collected = moneyString(
    paymentCurrencyGroups.find((group) => group.currency === currency)?._sum.amount?.toString() ??
      revenueAgg._sum.amount?.toString() ??
      "0",
  );

  const emailDelivery: DashboardEmailDelivery = {
    sent: 0,
    failed: 0,
    notSent: 0,
  };
  for (const group of emailStatusGroups) {
    if (group.emailStatus === "SENT") {
      emailDelivery.sent = group._count._all;
    } else if (group.emailStatus === "FAILED") {
      emailDelivery.failed = group._count._all;
    } else if (group.emailStatus === "NOT_SENT") {
      emailDelivery.notSent = group._count._all;
    }
  }

  const revenueByCurrency = paymentCurrencyGroups
    .map((group) => ({
      currency: group.currency,
      amount: moneyString(group._sum.amount?.toString() ?? "0"),
    }))
    .sort((left, right) => money(right.amount).comparedTo(money(left.amount)));
  const outstandingByCurrency = sumBalancesByCurrency(outstandingRows);
  const overdueByCurrency = sumBalancesByCurrency(overdueRows);

  const customerIds = customerGroups.map((group) => group.customerId);
  const memberIds = memberGroups
    .map((group) => group.assignedMemberId)
    .filter((id): id is string => id !== null);
  const organizationIds = organizationGroups.map((group) => group.organizationId);
  const recentCustomerIds = recentCustomerRows.map((customer) => customer.id);

  const [customers, members, activityOrgs, recentCustomerInvoiceGroups] = await Promise.all([
    customerIds.length
      ? prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.user.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, firstName: true, lastName: true, administratorId: true },
        })
      : Promise.resolve([]),
    organizationIds.length
      ? prisma.organization.findMany({
          where: { id: { in: organizationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    recentCustomerIds.length
      ? prisma.invoice.groupBy({
          by: ["customerId"],
          where: {
            ...invoiceInRange,
            customerId: { in: recentCustomerIds },
          },
          _count: { _all: true },
          _sum: { amountPaid: true },
        })
      : Promise.resolve([]),
  ]);

  const customerNames = new Map(customers.map((item) => [item.id, item.name]));
  const memberNames = new Map(
    members.map((item) => [item.id, `${item.firstName} ${item.lastName}`.trim()]),
  );
  const orgNames = new Map(activityOrgs.map((item) => [item.id, item.name]));

  const revenueSeries = buildMoneySeries(seriesPayments, scope.range, daily, currency, (row) => row.paidAt);
  const invoiceCountSeries = buildCountSeries(
    seriesInvoiceDates.map((row) => row.invoiceDate),
    scope.range,
    daily,
  );
  const invoiceCreatedSeries = invoiceCountSeries;
  const invoiceSentSeries = buildCountSeries(
    sentInvoiceDates.map((row) => row.sentAt).filter((value): value is Date => value instanceof Date),
    scope.range,
    daily,
  );
  const invoicePaidSeries = buildCountSeries(
    paidInvoiceDates.map((row) => row.updatedAt),
    scope.range,
    daily,
  );
  const expenseSeries = buildMoneySeries(
    seriesExpenses,
    scope.range,
    daily,
    currency,
    (row) => row.incurredOn,
  );

  return {
    organizationCount,
    adminCount,
    memberCount,
    customerCount,
    invoiceCount,
    paidInvoiceCount,
    unpaidInvoiceCount,
    overdueInvoiceCount,
    partiallyPaidInvoiceCount: partialInvoiceCount,
    expenseTotal: moneyString(
      seriesExpenses.reduce((sum, row) => sum.plus(row.amount.toString()), money(0)),
    ),
    revenue: collected,
    paidAmount: collected,
    outstandingBalance: moneyString(outstandingTotal.minus(outstandingPaid)),
    overdueAmount: moneyString(overdueTotal.minus(overduePaid)),
    draftInvoiceCount,
    sentInvoiceCount,
    viewedInvoiceCount,
    cancelledInvoiceCount,
    failedEmailCount: emailDelivery.failed,
    adminsWithoutMembers: administratorRows.filter((admin) => admin._count.managedMembers === 0).length,
    currency,
    currencies: currencies.length > 0 ? currencies : [currency],
    granularity,
    statusCounts: [
      { status: "DRAFT", count: draftInvoiceCount },
      { status: "SENT", count: sentInvoiceCount },
      { status: "VIEWED", count: viewedInvoiceCount },
      { status: "PAID", count: paidInvoiceCount },
      { status: "OVERDUE", count: overdueInvoiceCount },
      { status: "CANCELLED", count: cancelledInvoiceCount },
    ],
    revenueSeries,
    invoiceCountSeries,
    invoiceCreatedSeries,
    invoiceSentSeries,
    invoicePaidSeries,
    paymentSeries: revenueSeries,
    expenseSeries,
    revenueByCurrency,
    outstandingByCurrency,
    overdueByCurrency,
    emailDelivery,
    memberPerformance: memberGroups
      .map((group) => {
        const total = money(group._sum.total?.toString() ?? "0");
        const paid = money(group._sum.amountPaid?.toString() ?? "0");
        return {
          memberId: group.assignedMemberId,
          memberName: group.assignedMemberId
            ? (memberNames.get(group.assignedMemberId) ?? "Member")
            : "Unassigned",
          invoiceCount: group._count._all,
          revenue: moneyString(paid),
          outstanding: moneyString(total.minus(paid)),
        };
      })
      .sort((left, right) => money(right.revenue).comparedTo(money(left.revenue))),
    topCustomers: customerGroups.map((group) => {
      const total = money(group._sum.total?.toString() ?? "0");
      const paid = money(group._sum.amountPaid?.toString() ?? "0");
      return {
        customerId: group.customerId,
        customerName: customerNames.get(group.customerId) ?? "Customer",
        invoiceCount: group._count._all,
        total: moneyString(total),
        paid: moneyString(paid),
        outstanding: moneyString(total.minus(paid)),
      };
    }),
    organizationActivity: organizationGroups.map((group) => ({
      organizationId: group.organizationId,
      organizationName: orgNames.get(group.organizationId) ?? "Organization",
      invoiceCount: group._count._all,
      revenue: moneyString(group._sum.amountPaid?.toString() ?? "0"),
    })),
    administratorOverview: buildAdministratorOverview({
      administrators: administratorRows,
      members,
      invoices: allInRangeInvoices,
      currency,
    }),
    recentCustomers: recentCustomerRows.map((customer) => {
      const invoiceGroup = recentCustomerInvoiceGroups.find((group) => group.customerId === customer.id);
      return {
        customerId: customer.id,
        customerName: customer.name,
        createdAt: customer.createdAt.toISOString(),
        invoiceCount: invoiceGroup?._count._all ?? 0,
        paid: moneyString(invoiceGroup?._sum.amountPaid?.toString() ?? "0"),
        currency,
      };
    }),
    recentInvoices: recentInvoiceRows.map((row) => toInvoiceSummary(row, now)),
    recentPayments: recentPaymentRows.map(toPaymentSummary),
    overdueInvoices: overdueInvoiceRows.map((row) => toInvoiceSummary(row, now)),
    organizations,
  };
}

function buildAdministratorOverview(input: {
  administrators: Array<{
    id: string;
    firstName: string;
    lastName: string;
    status: string;
    _count: { managedMembers: number; managedCustomers: number };
  }>;
  members: Array<{ id: string; administratorId: string | null }>;
  invoices: Array<{
    createdById: string;
    assignedMemberId: string | null;
    status: InvoiceStatus;
    currency: string;
    total: { toString(): string };
    amountPaid: { toString(): string };
  }>;
  currency: string;
}): DashboardAdministratorOverview[] {
  const memberToAdmin = new Map(
    input.members
      .filter((member) => member.administratorId)
      .map((member) => [member.id, member.administratorId as string]),
  );

  return input.administrators.map((admin) => {
    const related = input.invoices.filter((invoice) => {
      if (invoice.currency !== input.currency) {
        return false;
      }
      if (invoice.createdById === admin.id) {
        return true;
      }
      const assignedAdmin =
        invoice.assignedMemberId === admin.id
          ? admin.id
          : invoice.assignedMemberId
            ? memberToAdmin.get(invoice.assignedMemberId)
            : undefined;
      return assignedAdmin === admin.id;
    });
    const total = related.reduce((sum, invoice) => sum.plus(invoice.total.toString()), money(0));
    const paid = related.reduce((sum, invoice) => sum.plus(invoice.amountPaid.toString()), money(0));
    return {
      administratorId: admin.id,
      administratorName: `${admin.firstName} ${admin.lastName}`.trim(),
      status: admin.status,
      memberCount: admin._count.managedMembers,
      customerCount: admin._count.managedCustomers,
      invoiceCount: related.length,
      paidInvoiceCount: related.filter((invoice) => invoice.status === "PAID").length,
      revenue: moneyString(paid),
      outstanding: moneyString(total.minus(paid)),
      currency: input.currency,
    };
  });
}

function sumBalancesByCurrency(
  rows: Array<{ currency: string; total: { toString(): string }; amountPaid: { toString(): string } }>,
): DashboardMoneyByCurrency[] {
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const row of rows) {
    const current = buckets.get(row.currency) ?? money(0);
    buckets.set(row.currency, current.plus(row.total.toString()).minus(row.amountPaid.toString()));
  }
  return [...buckets.entries()]
    .map(([currency, amount]) => ({ currency, amount: moneyString(amount) }))
    .sort((left, right) => money(right.amount).comparedTo(money(left.amount)));
}

const invoiceSummarySelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  total: true,
  amountPaid: true,
  dueDate: true,
  currency: true,
  customer: { select: { name: true } },
  organization: { select: { name: true } },
} as const;

function buildInvoiceWhere(scope: DashboardQueryScope): Prisma.InvoiceWhereInput {
  if (scope.userIds && scope.userIds.length === 0) {
    return {
      ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
      id: { in: [] },
    };
  }

  const access =
    scope.userIds && scope.userIds.length > 0 ? buildInvoiceUserAccessFilter(scope.userIds) : undefined;

  return {
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(access ?? {}),
  };
}

function toInvoiceSummary(
  row: {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    total: { toString(): string };
    amountPaid: { toString(): string };
    dueDate: Date;
    currency: string;
    customer: { name: string };
    organization: { name: string } | null;
  },
  now: Date,
): DashboardInvoiceSummary {
  const total = moneyString(row.total.toString());
  const amountPaid = moneyString(row.amountPaid.toString());
  const status = deriveInvoiceStatus({
    storedStatus: row.status,
    total,
    amountPaid,
    dueDate: row.dueDate,
    now,
  });
  const balance = money(total).minus(amountPaid);

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    status,
    paymentStatus: derivePaymentStatus(total, amountPaid, status),
    total,
    amountPaid,
    balanceDue: moneyString(balance.lt(0) ? 0 : balance),
    dueDate: row.dueDate.toISOString(),
    currency: row.currency,
    customerName: row.customer.name,
    organizationName: row.organization?.name ?? null,
  };
}

function toPaymentSummary(row: {
  id: string;
  amount: { toString(): string };
  currency: string;
  paidAt: Date | null;
  invoiceId: string;
  invoice: { invoiceNumber: string; organization: { name: string } | null };
  customer: { name: string };
}): DashboardPaymentSummary {
  return {
    id: row.id,
    amount: moneyString(row.amount.toString()),
    currency: row.currency,
    paidAt: row.paidAt?.toISOString() ?? null,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.invoiceNumber,
    customerName: row.customer.name,
    organizationName: row.invoice.organization?.name ?? null,
  };
}

function buildMoneySeries(
  rows: Array<{ amount: { toString(): string }; currency: string } & Record<string, unknown>>,
  range: DateRange,
  daily: boolean,
  currency: string,
  dateOf: (row: { paidAt?: Date | null; incurredOn?: Date } & Record<string, unknown>) => Date | null | undefined,
): DashboardSeriesPoint[] {
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const key of periodKeys(range, daily)) {
    buckets.set(key, money(0));
  }

  for (const row of rows) {
    const at = dateOf(row);
    if (!at || row.currency !== currency) {
      continue;
    }
    const key = periodKey(at, daily);
    const current = buckets.get(key);
    if (current) {
      buckets.set(key, current.plus(row.amount.toString()));
    }
  }

  return [...buckets.entries()].map(([period, amount]) => ({
    period,
    amount: moneyString(amount),
  }));
}

function buildCountSeries(dates: Date[], range: DateRange, daily: boolean): DashboardSeriesPoint[] {
  const buckets = new Map<string, number>();
  for (const key of periodKeys(range, daily)) {
    buckets.set(key, 0);
  }

  for (const at of dates) {
    const key = periodKey(at, daily);
    const current = buckets.get(key);
    if (current !== undefined) {
      buckets.set(key, current + 1);
    }
  }

  return [...buckets.entries()].map(([period, count]) => ({
    period,
    amount: String(count),
  }));
}

