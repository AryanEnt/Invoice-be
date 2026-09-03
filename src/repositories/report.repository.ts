import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  periodKey,
  rangeDayCount,
  startOfUtcDay,
  type DateRange,
} from "../lib/date-range.js";
import { buildInvoiceUserAccessFilter } from "../lib/admin-scope.js";
import { money, moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import type {
  ReportKind,
  ReportOverview,
  ReportQueryScope,
  ReportSeriesPoint,
  ReportTable,
  ReportView,
} from "../types/report.js";

const TABLE_PAGE_MAX = 25;
const CSV_ROW_CAP = 1000;

export interface ReportLoadInput {
  kind: ReportKind;
  preset: ReportView["preset"];
  range: DateRange;
  scope: ReportQueryScope;
  page: number;
  pageSize: number;
  csv?: boolean;
}

export async function loadReport(
  input: ReportLoadInput,
  now = new Date(),
): Promise<Omit<ReportView, "role" | "scope" | "organizationId" | "organizations">> {
  const pageSize = input.csv
    ? CSV_ROW_CAP
    : Math.min(Math.max(input.pageSize, 1), TABLE_PAGE_MAX);
  const page = input.csv ? 1 : Math.max(input.page, 1);
  const invoiceWhere = buildInvoiceWhere(input.scope);
  const invoiceInRange: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    invoiceDate: { gte: input.range.start, lt: input.range.end },
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    status: "COMPLETED",
    paidAt: { gte: input.range.start, lt: input.range.end },
    ...(input.scope.organizationId ? { organizationId: input.scope.organizationId } : {}),
    ...(hasInvoiceAccess(input.scope) ? { invoice: invoiceWhere } : {}),
  };
  const expenseWhere: Prisma.ExpenseWhereInput = {
    incurredOn: { gte: input.range.start, lt: input.range.end },
    ...(input.scope.organizationId ? { organizationId: input.scope.organizationId } : {}),
    ...(input.scope.expenseCreatedById
      ? { createdById: input.scope.expenseCreatedById }
      : input.scope.userIds
        ? { createdById: { in: input.scope.userIds } }
        : {}),
  };
  const overdueWhere: Prisma.InvoiceWhereInput = {
    ...invoiceWhere,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    dueDate: {
      gte: input.range.start,
      lt: input.range.end.getTime() < startOfUtcDay(now).getTime() ? input.range.end : startOfUtcDay(now),
    },
  };
  const outstandingWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
  };
  const paidWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: "PAID",
  };
  const taxInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...invoiceInRange,
    status: { not: "CANCELLED" },
  };

  const [
    revenueAgg,
    paymentCount,
    taxAgg,
    expenseAgg,
    invoiceCount,
    paidCount,
    outstandingAgg,
    overdueCount,
    currencySample,
  ] = await Promise.all([
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
    prisma.payment.count({ where: paymentWhere }),
    prisma.invoice.aggregate({ where: taxInvoiceWhere, _sum: { taxAmount: true } }),
    prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }),
    prisma.invoice.count({ where: invoiceInRange }),
    prisma.invoice.count({ where: paidWhere }),
    prisma.invoice.aggregate({
      where: outstandingWhere,
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.count({ where: overdueWhere }),
    prisma.invoice.findFirst({
      where: invoiceWhere,
      orderBy: { createdAt: "desc" },
      select: { currency: true },
    }),
  ]);

  const currency = currencySample?.currency ?? "USD";
  const outstandingBalance = moneyString(
    money(outstandingAgg._sum.total?.toString() ?? "0").minus(
      outstandingAgg._sum.amountPaid?.toString() ?? "0",
    ),
  );
  const overview: ReportOverview = {
    revenue: moneyString(revenueAgg._sum.amount?.toString() ?? "0"),
    taxCollected: moneyString(taxAgg._sum.taxAmount?.toString() ?? "0"),
    expenses: moneyString(expenseAgg._sum.amount?.toString() ?? "0"),
    payments: moneyString(revenueAgg._sum.amount?.toString() ?? "0"),
    invoices: invoiceCount,
    paidInvoices: paidCount,
    outstandingBalance,
    overdueInvoices: overdueCount,
  };

  const detail = await loadKindDetail({
    kind: input.kind,
    range: input.range,
    now,
    page,
    pageSize,
    currency,
    overview,
    invoiceInRange,
    paymentWhere,
    expenseWhere,
    overdueWhere,
    outstandingWhere,
    paidWhere,
    taxInvoiceWhere,
    paymentCount,
  });

  return {
    kind: input.kind,
    preset: input.preset,
    dateFrom: input.range.start.toISOString(),
    dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
    currency,
    overview,
    ...detail,
  };
}

async function loadKindDetail(input: {
  kind: ReportKind;
  range: DateRange;
  now: Date;
  page: number;
  pageSize: number;
  currency: string;
  overview: ReportOverview;
  invoiceInRange: Prisma.InvoiceWhereInput;
  paymentWhere: Prisma.PaymentWhereInput;
  expenseWhere: Prisma.ExpenseWhereInput;
  overdueWhere: Prisma.InvoiceWhereInput;
  outstandingWhere: Prisma.InvoiceWhereInput;
  paidWhere: Prisma.InvoiceWhereInput;
  taxInvoiceWhere: Prisma.InvoiceWhereInput;
  paymentCount: number;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  switch (input.kind) {
    case "revenue":
    case "payments":
      return loadPaymentReport(input);
    case "invoice-status":
      return loadStatusReport(input);
    case "paid":
      return loadInvoiceListReport(input.paidWhere, input, {
        countLabel: "paidInvoices",
        amountLabel: "collected",
      });
    case "outstanding":
      return loadInvoiceListReport(input.outstandingWhere, input, {
        countLabel: "outstandingInvoices",
        amountLabel: "outstanding",
      });
    case "overdue":
      return loadInvoiceListReport(input.overdueWhere, input, {
        countLabel: "overdueInvoices",
        amountLabel: "outstanding",
      });
    case "customer-balances":
      return loadCustomerBalanceReport(input);
    case "expenses":
      return loadExpenseReport(input);
    case "tax":
      return loadTaxReport(input);
    default:
      return loadSummaryReport(input);
  }
}

async function loadPaymentReport(input: {
  range: DateRange;
  page: number;
  pageSize: number;
  currency: string;
  overview: ReportOverview;
  paymentWhere: Prisma.PaymentWhereInput;
  paymentCount: number;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const [methods, payments] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"],
      where: input.paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: input.paymentWhere,
      select: { amount: true, paidAt: true, currency: true },
    }),
  ]);

  const series = bucketAmounts(
    payments
      .filter((row) => row.paidAt && row.currency === input.currency)
      .map((row) => ({ at: row.paidAt as Date, amount: row.amount.toString() })),
    input.range,
  );
  const breakdown = methods.map((row) => ({
    label: row.method,
    value: moneyString(row._sum.amount?.toString() ?? "0"),
  }));
  const tableRows = methods.map((row) => ({
    method: row.method.replaceAll("_", " "),
    count: String(row._count._all),
    amount: moneyString(row._sum.amount?.toString() ?? "0"),
  }));
  const paged = paginate(tableRows, input.page, input.pageSize);

  return {
    metrics: {
      revenue: input.overview.revenue,
      paymentCount: input.paymentCount,
      averagePayment:
        input.paymentCount > 0
          ? moneyString(money(input.overview.revenue).div(input.paymentCount))
          : moneyString(0),
    },
    series,
    breakdown,
    table: {
      columns: [
        { key: "method", label: "Method" },
        { key: "count", label: "Payments" },
        { key: "amount", label: "Amount" },
      ],
      ...paged,
    },
  };
}

async function loadStatusReport(input: {
  invoiceInRange: Prisma.InvoiceWhereInput;
  page: number;
  pageSize: number;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const groups = await prisma.invoice.groupBy({
    by: ["status"],
    where: input.invoiceInRange,
    _count: { _all: true },
    _sum: { total: true },
  });
  const rows = groups.map((row) => ({
    status: row.status,
    count: String(row._count._all),
    total: moneyString(row._sum.total?.toString() ?? "0"),
  }));
  const breakdown = groups.map((row) => ({
    label: row.status.replaceAll("_", " "),
    value: String(row._count._all),
  }));
  const paged = paginate(rows, input.page, input.pageSize);
  return {
    metrics: {
      statuses: groups.length,
      invoices: groups.reduce((sum, row) => sum + row._count._all, 0),
    },
    series: breakdown,
    breakdown,
    table: {
      columns: [
        { key: "status", label: "Status" },
        { key: "count", label: "Invoices" },
        { key: "total", label: "Billed" },
      ],
      ...paged,
    },
  };
}

async function loadInvoiceListReport(
  where: Prisma.InvoiceWhereInput,
  input: { page: number; pageSize: number; overview: ReportOverview },
  labels: { countLabel: string; amountLabel: string },
): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const [total, rows, statusGroups] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: invoiceRowSelect,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ]);
  const amountAgg = await prisma.invoice.aggregate({
    where,
    _sum: { total: true, amountPaid: true },
  });
  const billed = money(amountAgg._sum.total?.toString() ?? "0");
  const paid = money(amountAgg._sum.amountPaid?.toString() ?? "0");
  const metricAmount =
    labels.amountLabel === "collected" ? paid : billed.minus(paid);

  return {
    metrics: {
      [labels.countLabel]: total,
      billed: moneyString(billed),
      [labels.amountLabel]: moneyString(metricAmount.lt(0) ? 0 : metricAmount),
    },
    series: statusGroups.map((row) => ({
      label: row.status.replaceAll("_", " "),
      value: String(row._count._all),
    })),
    breakdown: statusGroups.map((row) => ({
      label: row.status.replaceAll("_", " "),
      value: String(row._count._all),
    })),
    table: {
      columns: invoiceTableColumns,
      rows: rows.map(toInvoiceTableRow),
      page: input.page,
      pageSize: input.pageSize,
      total,
    },
  };
}

async function loadCustomerBalanceReport(input: {
  outstandingWhere: Prisma.InvoiceWhereInput;
  page: number;
  pageSize: number;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const groups = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: input.outstandingWhere,
    _count: { _all: true },
    _sum: { total: true, amountPaid: true },
    orderBy: { _sum: { total: "desc" } },
  });
  const customers = await prisma.customer.findMany({
    where: { id: { in: groups.map((row) => row.customerId) } },
    select: { id: true, name: true },
  });
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  const rows = groups.map((row) => {
    const billed = money(row._sum.total?.toString() ?? "0");
    const paid = money(row._sum.amountPaid?.toString() ?? "0");
    return {
      customer: names.get(row.customerId) ?? "Customer",
      invoices: String(row._count._all),
      billed: moneyString(billed),
      paid: moneyString(paid),
      balance: moneyString(billed.minus(paid)),
    };
  });
  const paged = paginate(rows, input.page, input.pageSize);
  const top = rows.slice(0, 8).map((row) => ({ label: row.customer, value: row.balance }));
  return {
    metrics: {
      customers: rows.length,
      outstandingBalance: moneyString(
        rows.reduce((sum, row) => sum.plus(row.balance), money(0)),
      ),
    },
    series: top,
    breakdown: top,
    table: {
      columns: [
        { key: "customer", label: "Customer" },
        { key: "invoices", label: "Invoices" },
        { key: "billed", label: "Billed" },
        { key: "paid", label: "Paid" },
        { key: "balance", label: "Balance" },
      ],
      ...paged,
    },
  };
}

async function loadExpenseReport(input: {
  expenseWhere: Prisma.ExpenseWhereInput;
  range: DateRange;
  page: number;
  pageSize: number;
  currency: string;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const [agg, count, expenses] = await Promise.all([
    prisma.expense.aggregate({ where: input.expenseWhere, _sum: { amount: true } }),
    prisma.expense.count({ where: input.expenseWhere }),
    prisma.expense.findMany({
      where: input.expenseWhere,
      select: {
        amount: true,
        incurredOn: true,
        currency: true,
        category: { select: { name: true } },
      },
    }),
  ]);
  const byCategory = new Map<string, ReturnType<typeof money>>();
  for (const expense of expenses) {
    const key = expense.category.name;
    byCategory.set(key, (byCategory.get(key) ?? money(0)).plus(expense.amount.toString()));
  }
  const rows = [...byCategory.entries()].map(([category, amount]) => ({
    category,
    amount: moneyString(amount),
  }));
  const paged = paginate(rows, input.page, input.pageSize);
  const series = bucketAmounts(
    expenses
      .filter((row) => row.currency === input.currency)
      .map((row) => ({ at: row.incurredOn, amount: row.amount.toString() })),
    input.range,
  );
  const breakdown = rows.map((row) => ({ label: row.category, value: row.amount }));
  return {
    metrics: {
      expenses: moneyString(agg._sum.amount?.toString() ?? "0"),
      expenseCount: count,
      categories: rows.length,
    },
    series,
    breakdown,
    table: {
      columns: [
        { key: "category", label: "Category" },
        { key: "amount", label: "Amount" },
      ],
      ...paged,
    },
  };
}

async function loadTaxReport(input: {
  taxInvoiceWhere: Prisma.InvoiceWhereInput;
  page: number;
  pageSize: number;
}): Promise<{
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
}> {
  const groups = await prisma.invoiceItem.groupBy({
    by: ["taxRate"],
    where: { invoice: input.taxInvoiceWhere },
    _sum: { taxAmount: true },
    _count: { _all: true },
  });
  const rows = groups.map((row) => ({
    taxRate: row.taxRate === null ? "0" : moneyString(row.taxRate.toString()),
    lines: String(row._count._all),
    taxAmount: moneyString(row._sum.taxAmount?.toString() ?? "0"),
  }));
  const paged = paginate(rows, input.page, input.pageSize);
  const breakdown = rows.map((row) => ({
    label: `${row.taxRate}%`,
    value: row.taxAmount,
  }));
  const totalTax = rows.reduce((sum, row) => sum.plus(row.taxAmount), money(0));
  return {
    metrics: {
      taxCollected: moneyString(totalTax),
      rates: rows.length,
    },
    series: breakdown,
    breakdown,
    table: {
      columns: [
        { key: "taxRate", label: "Rate" },
        { key: "lines", label: "Lines" },
        { key: "taxAmount", label: "Tax" },
      ],
      ...paged,
    },
  };
}

function loadSummaryReport(input: {
  overview: ReportOverview;
}): {
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
} {
  const rows = [
    { report: "Revenue", value: input.overview.revenue },
    { report: "Payments", value: input.overview.payments },
    { report: "Tax collected", value: input.overview.taxCollected },
    { report: "Expenses", value: input.overview.expenses },
    { report: "Outstanding", value: input.overview.outstandingBalance },
    { report: "Paid invoices", value: String(input.overview.paidInvoices) },
    { report: "Overdue invoices", value: String(input.overview.overdueInvoices) },
  ];
  return {
    metrics: {
      revenue: input.overview.revenue,
      expenses: input.overview.expenses,
      outstandingBalance: input.overview.outstandingBalance,
      taxCollected: input.overview.taxCollected,
    },
    series: [
      { label: "Revenue", value: input.overview.revenue },
      { label: "Expenses", value: input.overview.expenses },
      { label: "Tax", value: input.overview.taxCollected },
    ],
    breakdown: [
      { label: "Paid invoices", value: String(input.overview.paidInvoices) },
      { label: "Overdue invoices", value: String(input.overview.overdueInvoices) },
    ],
    table: {
      columns: [
        { key: "report", label: "Report" },
        { key: "value", label: "Value" },
      ],
      rows,
      page: 1,
      pageSize: rows.length,
      total: rows.length,
    },
  };
}

const invoiceRowSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  invoiceDate: true,
  dueDate: true,
  total: true,
  amountPaid: true,
  currency: true,
  customer: { select: { name: true } },
} as const;

const invoiceTableColumns = [
  { key: "invoiceNumber", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "date", label: "Date" },
  { key: "total", label: "Total" },
  { key: "balance", label: "Balance" },
];

function toInvoiceTableRow(row: {
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: Date;
  dueDate: Date;
  total: { toString(): string };
  amountPaid: { toString(): string };
  customer: { name: string };
}): Record<string, string> {
  const total = money(row.total.toString());
  const paid = money(row.amountPaid.toString());
  return {
    invoiceNumber: row.invoiceNumber,
    customer: row.customer.name,
    status: row.status.replaceAll("_", " "),
    date: row.invoiceDate.toISOString().slice(0, 10),
    total: moneyString(total),
    balance: moneyString(total.minus(paid)),
  };
}

function buildInvoiceWhere(scope: ReportQueryScope): Prisma.InvoiceWhereInput {
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

function hasInvoiceAccess(scope: ReportQueryScope): boolean {
  return Boolean(scope.userIds && scope.userIds.length > 0);
}

function bucketAmounts(
  items: Array<{ at: Date; amount: string }>,
  range: DateRange,
): ReportSeriesPoint[] {
  const daily = rangeDayCount(range) <= 45;
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const item of items) {
    const key = periodKey(item.at, daily);
    buckets.set(key, (buckets.get(key) ?? money(0)).plus(item.amount));
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, amount]) => ({ label, value: moneyString(amount) }));
}

function paginate<T>(rows: T[], page: number, pageSize: number): {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
} {
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page,
    pageSize,
    total: rows.length,
  };
}
