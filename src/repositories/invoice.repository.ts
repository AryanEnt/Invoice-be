import type { CatalogKind, InvoiceEmailStatus, InvoiceStatus, Prisma } from "@prisma/client";
import { buildInvoiceUserAccessFilter } from "../lib/admin-scope.js";
import { startOfUtcDay } from "../lib/date-range.js";
import { money, moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import type { InvoiceRecord } from "../lib/invoice-view.js";
import type { AddressInput } from "../types/auth.js";

const invoicePaymentInclude = {
  invoice: {
    select: { id: true, invoiceNumber: true },
  },
  customer: {
    select: { id: true, name: true, company: true },
  },
  recordedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

const invoiceInclude = {
  organization: true,
  customer: true,
  createdBy: true,
  assignedMember: true,
  billingAddress: true,
  shippingAddress: true,
  items: true,
} as const;

const invoiceDetailInclude = {
  ...invoiceInclude,
  payments: {
    include: invoicePaymentInclude,
    orderBy: { createdAt: "asc" as const },
  },
};

function addressData(input: AddressInput) {
  return {
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country,
  };
}

export async function findInvoiceById(id: string): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: invoiceDetailInclude,
  });
}

export async function findInvoiceByShareToken(token: string): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: { shareToken: token },
    include: invoiceDetailInclude,
  });
}

export async function findInvoiceByOrganizationAndNumber(
  organizationId: string,
  invoiceNumber: string,
): Promise<InvoiceRecord | null> {
  return prisma.invoice.findUnique({
    where: {
      organizationId_invoiceNumber: { organizationId, invoiceNumber },
    },
    include: invoiceInclude,
  });
}

export async function findLatestInvoiceNumber(
  organizationId: string,
  prefix: string,
): Promise<string | null> {
  const rows = await prisma.invoice.findMany({
    where: {
      organizationId,
      invoiceNumber: { startsWith: prefix },
    },
    select: { invoiceNumber: true },
  });

  let max = 0;
  let latest: string | null = null;
  for (const row of rows) {
    const value = Number(row.invoiceNumber.slice(prefix.length));
    if (Number.isFinite(value) && value >= max) {
      max = value;
      latest = row.invoiceNumber;
    }
  }
  return latest;
}

export async function listInvoices(query: {
  search?: string;
  status?: InvoiceStatus;
  overdue?: boolean;
  boardColumn?: "new" | "sent" | "overdue" | "paid";
  customerId?: string;
  organizationId?: string;
  userIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "invoiceDate" | "dueDate" | "total" | "invoiceNumber" | "createdAt";
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
  now?: Date;
}): Promise<{ items: InvoiceRecord[]; total: number }> {
  const accessFilter: Prisma.InvoiceWhereInput | undefined = query.userIds
    ? query.userIds.length > 0
      ? buildInvoiceUserAccessFilter(query.userIds)
      : { id: { in: [] } }
    : undefined;

  const today = startOfUtcDay(query.now ?? new Date());
  const boardStatusFilter = ((): Prisma.InvoiceWhereInput | undefined => {
    if (!query.boardColumn) {
      return undefined;
    }
    switch (query.boardColumn) {
      case "new":
        return { status: "DRAFT" };
      case "sent":
        return {
          status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
          dueDate: { gte: today },
        };
      case "overdue":
        return {
          status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
          dueDate: { lt: today },
        };
      case "paid":
        return { status: "PAID" };
      default:
        return undefined;
    }
  })();

  const where: Prisma.InvoiceWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          invoiceDate: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNumber: { contains: query.search, mode: "insensitive" } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
            { customer: { company: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(boardStatusFilter
      ? boardStatusFilter
      : query.overdue
        ? {
            status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
            dueDate: { lt: today },
          }
        : query.status
          ? { status: query.status }
          : {}),
    ...(accessFilter ?? {}),
  };

  const sort = query.sort ?? "createdAt";
  const sortDir = query.sortDir ?? "desc";

  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { [sort]: sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { items, total };
}

export async function createInvoice(data: {
  organizationId: string;
  customerId: string;
  createdById: string;
  assignedMemberId?: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  terms?: string | null;
  billingAddress?: AddressInput | null;
  shippingAddress?: AddressInput | null;
  items: Array<{
    productId?: string | null;
    catalogKind?: CatalogKind | null;
    sku?: string | null;
    unit?: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate?: string | null;
    taxAmount: string;
    lineTotal: string;
    sortOrder: number;
  }>;
}): Promise<InvoiceRecord> {
  return prisma.$transaction(async (tx) => {
    const billingAddress = data.billingAddress
      ? await tx.address.create({ data: addressData(data.billingAddress) })
      : null;
    const shippingAddress = data.shippingAddress
      ? await tx.address.create({ data: addressData(data.shippingAddress) })
      : null;

    return tx.invoice.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        createdById: data.createdById,
        assignedMemberId: data.assignedMemberId ?? null,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        billingAddressId: billingAddress?.id,
        shippingAddressId: shippingAddress?.id,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId ?? null,
            catalogKind: item.catalogKind ?? null,
            sku: item.sku ?? null,
            unit: item.unit ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate ?? null,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: invoiceInclude,
    });
  });
}

export async function updateInvoice(
  id: string,
  data: {
    customerId?: string;
    assignedMemberId?: string | null;
    invoiceNumber?: string;
    invoiceDate?: Date;
    dueDate?: Date;
    currency?: string;
    subtotal?: string;
    discountAmount?: string;
    taxAmount?: string;
    total?: string;
    amountPaid?: string;
    notes?: string | null;
    terms?: string | null;
    status?: InvoiceStatus;
    shareToken?: string | null;
    pdfObjectKey?: string | null;
    emailStatus?: InvoiceEmailStatus;
    emailSentAt?: Date | null;
    emailLastError?: string | null;
    sentAt?: Date | null;
    viewedAt?: Date | null;
    billingAddress?: AddressInput | null;
    shippingAddress?: AddressInput | null;
    items?: Array<{
      productId?: string | null;
      catalogKind?: CatalogKind | null;
      sku?: string | null;
      unit?: string | null;
      description: string;
      quantity: string;
      unitPrice: string;
      discount: string;
      taxRate?: string | null;
      taxAmount: string;
      lineTotal: string;
      sortOrder: number;
    }>;
  },
): Promise<InvoiceRecord> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUnique({ where: { id } });
    if (!current) {
      throw new Error("Invoice not found");
    }

    let billingAddressId = current.billingAddressId;
    let shippingAddressId = current.shippingAddressId;

    if (data.billingAddress !== undefined) {
      billingAddressId = await replaceAddress(tx, current.billingAddressId, data.billingAddress);
    }
    if (data.shippingAddress !== undefined) {
      shippingAddressId = await replaceAddress(tx, current.shippingAddressId, data.shippingAddress);
    }

    if (data.items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        customerId: data.customerId,
        assignedMemberId: data.assignedMemberId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
        amountPaid: data.amountPaid,
        notes: data.notes,
        terms: data.terms,
        status: data.status,
        shareToken: data.shareToken,
        pdfObjectKey: data.pdfObjectKey,
        emailStatus: data.emailStatus,
        emailSentAt: data.emailSentAt,
        emailLastError: data.emailLastError,
        sentAt: data.sentAt,
        viewedAt: data.viewedAt,
        billingAddressId,
        shippingAddressId,
        ...(data.items
          ? {
              items: {
                create: data.items.map((item) => ({
                  productId: item.productId ?? null,
                  catalogKind: item.catalogKind ?? null,
                  sku: item.sku ?? null,
                  unit: item.unit ?? null,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discount: item.discount,
                  taxRate: item.taxRate ?? null,
                  taxAmount: item.taxAmount,
                  lineTotal: item.lineTotal,
                  sortOrder: item.sortOrder,
                })),
              },
            }
          : {}),
      },
      include: invoiceInclude,
    });

    return updated;
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await prisma.invoice.delete({ where: { id } });
}

export interface InvoiceBucketSummary {
  count: number;
  amount: string;
}

export interface InvoiceSummaryCounts {
  all: number;
  paid: number;
  outstanding: number;
  overview: number;
  void: number;
  currency: string;
  overdue: InvoiceBucketSummary;
  awaitingPayment: InvoiceBucketSummary;
  notSent: InvoiceBucketSummary;
  paidInvoices: InvoiceBucketSummary;
}

function bucketAmount(
  totals: { total: { toString(): string } | null; amountPaid: { toString(): string } | null },
  kind: "balance" | "total" | "paid",
): string {
  const total = money(totals.total?.toString() ?? "0");
  const amountPaid = money(totals.amountPaid?.toString() ?? "0");
  if (kind === "balance") {
    return moneyString(total.minus(amountPaid));
  }
  if (kind === "total") {
    return moneyString(total);
  }
  return moneyString(amountPaid);
}

/**
 * Counts invoices for summary cards.
 * When userIds is set, only invoices the user can access are included.
 */
export async function countInvoiceSummary(query: {
  organizationId?: string;
  userIds?: string[];
  now?: Date;
}): Promise<InvoiceSummaryCounts> {
  const accessFilter: Prisma.InvoiceWhereInput | undefined =
    query.userIds && query.userIds.length > 0
      ? buildInvoiceUserAccessFilter(query.userIds)
      : undefined;

  const base: Prisma.InvoiceWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(accessFilter ?? {}),
  };

  const today = startOfUtcDay(query.now ?? new Date());
  const overdueWhere: Prisma.InvoiceWhereInput = {
    ...base,
    status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    dueDate: { lt: today },
  };
  const awaitingPaymentWhere: Prisma.InvoiceWhereInput = {
    ...base,
    status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
    dueDate: { gte: today },
  };
  const notSentWhere: Prisma.InvoiceWhereInput = {
    ...base,
    status: "DRAFT",
  };
  const paidWhere: Prisma.InvoiceWhereInput = {
    ...base,
    status: "PAID",
  };

  const [
    all,
    paid,
    voidCount,
    outstanding,
    overview,
    currencyRow,
    overdueAgg,
    awaitingAgg,
    notSentAgg,
    paidAgg,
  ] = await prisma.$transaction([
    prisma.invoice.count({ where: base }),
    prisma.invoice.count({ where: paidWhere }),
    prisma.invoice.count({ where: { ...base, status: "CANCELLED" } }),
    prisma.invoice.count({
      where: {
        ...base,
        status: { in: ["SENT", "VIEWED", "OVERDUE", "PARTIALLY_PAID"] },
      },
    }),
    prisma.invoice.count({
      where: {
        ...base,
        OR: [{ status: "DRAFT" }, overdueWhere],
      },
    }),
    prisma.invoice.findFirst({
      where: base,
      select: { currency: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.aggregate({
      where: overdueWhere,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: awaitingPaymentWhere,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: notSentWhere,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.invoice.aggregate({
      where: paidWhere,
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
  ]);

  return {
    all,
    paid,
    outstanding,
    overview,
    void: voidCount,
    currency: currencyRow?.currency ?? "USD",
    overdue: {
      count: overdueAgg._count._all,
      amount: bucketAmount(overdueAgg._sum, "balance"),
    },
    awaitingPayment: {
      count: awaitingAgg._count._all,
      amount: bucketAmount(awaitingAgg._sum, "balance"),
    },
    notSent: {
      count: notSentAgg._count._all,
      amount: bucketAmount(notSentAgg._sum, "total"),
    },
    paidInvoices: {
      count: paidAgg._count._all,
      amount: bucketAmount(paidAgg._sum, "paid"),
    },
  };
}

async function replaceAddress(
  tx: Prisma.TransactionClient,
  existingId: string | null,
  input: AddressInput | null,
): Promise<string | null> {
  if (input === null) {
    return null;
  }
  if (existingId) {
    await tx.address.update({
      where: { id: existingId },
      data: addressData(input),
    });
    return existingId;
  }
  const created = await tx.address.create({ data: addressData(input) });
  return created.id;
}
