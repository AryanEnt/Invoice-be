import { buildInvoiceUserAccessFilter } from "../lib/admin-scope.js";
import {
  addUtcDays,
  periodKey,
  periodKeys,
  rangeDayCount,
  resolveDateRange,
  startOfUtcDay,
  type DatePreset,
  type DateRange,
} from "../lib/date-range.js";
import { money, moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export type ForecastTrendPreset = "this_month" | "last_month" | "last_3_months" | "this_year";

export interface ForecastSeriesPoint {
  period: string;
  collected: string;
  outstanding: string;
}

export interface ForecastSnapshot {
  currency: string;
  expectedThisMonth: string;
  expectedNext30Days: string;
  outstandingAmount: string;
  overdueAmount: string;
  dueWithin7Days: string;
  invoicesDueWithin7Days: number;
  collectedThisMonth: string;
  collectedLastMonth: string;
  openInvoiceCount: number;
  paymentCount: number;
  invoiceCount: number;
  trend: ForecastSeriesPoint[];
  trendGranularity: "day" | "month";
}

function buildInvoiceWhere(scope: {
  organizationId?: string;
  userIds?: string[];
}): Prisma.InvoiceWhereInput {
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

function monthRange(now: Date, offsetMonths: number): DateRange {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 1),
  );
  return { start, end };
}

export async function loadForecastSnapshot(
  scope: {
    organizationId?: string;
    userIds?: string[];
    trendPreset: ForecastTrendPreset;
  },
  now = new Date(),
): Promise<ForecastSnapshot> {
  const invoiceWhere = buildInvoiceWhere(scope);
  const today = startOfUtcDay(now);
  const thisMonth = monthRange(now, 0);
  const lastMonth = monthRange(now, -1);
  const next30End = addUtcDays(today, 31);
  const next7End = addUtcDays(today, 8);

  const openWhere: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
  };

  const paymentBase: Prisma.PaymentWhereInput = {
    status: "COMPLETED",
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
    ...(scope.userIds ? { invoice: invoiceWhere } : {}),
  };

  const trendRange = resolveDateRange(scope.trendPreset as DatePreset, undefined, undefined, now);
  const daily = rangeDayCount(trendRange) <= 31;
  const trendGranularity: "day" | "month" = daily ? "day" : "month";
  const keys = periodKeys(trendRange, daily);

  const [
    currencyRow,
    openInvoices,
    invoiceCount,
    paymentCount,
    collectedThisMonthAgg,
    collectedLastMonthAgg,
    trendPayments,
    trendOutstandingInvoices,
  ] = await Promise.all([
    prisma.invoice.findFirst({
      where: invoiceWhere,
      select: { currency: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: openWhere,
      select: { total: true, amountPaid: true, dueDate: true },
    }),
    prisma.invoice.count({
      where: { ...invoiceWhere, status: { not: "CANCELLED" } },
    }),
    prisma.payment.count({ where: paymentBase }),
    prisma.payment.aggregate({
      where: {
        ...paymentBase,
        paidAt: { gte: thisMonth.start, lt: thisMonth.end },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        ...paymentBase,
        paidAt: { gte: lastMonth.start, lt: lastMonth.end },
      },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: {
        ...paymentBase,
        paidAt: { gte: trendRange.start, lt: trendRange.end },
      },
      select: { amount: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: {
        ...openWhere,
        dueDate: { gte: trendRange.start, lt: trendRange.end },
      },
      select: { total: true, amountPaid: true, dueDate: true },
    }),
  ]);

  let expectedThisMonth = money(0);
  let expectedNext30Days = money(0);
  let outstandingAmount = money(0);
  let overdueAmount = money(0);
  let dueWithin7Days = money(0);
  let invoicesDueWithin7Days = 0;

  for (const invoice of openInvoices) {
    const balance = money(invoice.total.toString()).minus(invoice.amountPaid.toString());
    outstandingAmount = outstandingAmount.plus(balance);

    if (invoice.dueDate < today) {
      overdueAmount = overdueAmount.plus(balance);
    }

    if (invoice.dueDate >= thisMonth.start && invoice.dueDate < thisMonth.end) {
      expectedThisMonth = expectedThisMonth.plus(balance);
    }

    if (invoice.dueDate >= today && invoice.dueDate < next30End) {
      expectedNext30Days = expectedNext30Days.plus(balance);
    }

    if (invoice.dueDate >= today && invoice.dueDate < next7End) {
      dueWithin7Days = dueWithin7Days.plus(balance);
      invoicesDueWithin7Days += 1;
    }
  }

  const collectedBuckets = new Map<string, ReturnType<typeof money>>();
  const outstandingBuckets = new Map<string, ReturnType<typeof money>>();
  for (const key of keys) {
    collectedBuckets.set(key, money(0));
    outstandingBuckets.set(key, money(0));
  }

  for (const payment of trendPayments) {
    if (!payment.paidAt) continue;
    const key = periodKey(payment.paidAt, daily);
    const current = collectedBuckets.get(key);
    if (current) {
      collectedBuckets.set(key, current.plus(payment.amount.toString()));
    }
  }

  for (const invoice of trendOutstandingInvoices) {
    const key = periodKey(invoice.dueDate, daily);
    const current = outstandingBuckets.get(key);
    if (current) {
      outstandingBuckets.set(
        key,
        current.plus(invoice.total.toString()).minus(invoice.amountPaid.toString()),
      );
    }
  }

  return {
    currency: currencyRow?.currency ?? "USD",
    expectedThisMonth: moneyString(expectedThisMonth),
    expectedNext30Days: moneyString(expectedNext30Days),
    outstandingAmount: moneyString(outstandingAmount),
    overdueAmount: moneyString(overdueAmount),
    dueWithin7Days: moneyString(dueWithin7Days),
    invoicesDueWithin7Days,
    collectedThisMonth: moneyString(collectedThisMonthAgg._sum.amount?.toString() ?? "0"),
    collectedLastMonth: moneyString(collectedLastMonthAgg._sum.amount?.toString() ?? "0"),
    openInvoiceCount: openInvoices.length,
    paymentCount,
    invoiceCount,
    trendGranularity,
    trend: keys.map((period) => ({
      period,
      collected: moneyString(collectedBuckets.get(period) ?? money(0)),
      outstanding: moneyString(outstandingBuckets.get(period) ?? money(0)),
    })),
  };
}
