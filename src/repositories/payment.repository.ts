import { buildInvoiceUserAccessFilter } from "../lib/admin-scope.js";
import type { InvoiceStatus, PaymentMethod, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { money, moneyString } from "../lib/money.js";
import type { PaymentRecord } from "../lib/payment-view.js";

const paymentInclude = {
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

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
  return prisma.payment.findUnique({
    where: { id },
    include: paymentInclude,
  });
}

export async function listPayments(query: {
  search?: string;
  status?: PaymentStatus;
  provider?: PaymentProvider;
  customerId?: string;
  invoiceId?: string;
  organizationId?: string;
  invoiceIds?: string[];
  userIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}): Promise<{ items: PaymentRecord[]; total: number }> {
  const invoiceAccessFilter =
    query.userIds && query.userIds.length > 0
      ? { invoice: buildInvoiceUserAccessFilter(query.userIds) }
      : {};

  const where: Prisma.PaymentWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
    ...(query.invoiceIds ? { invoiceId: { in: query.invoiceIds } } : {}),
    ...invoiceAccessFilter,
    ...(query.status ? { status: query.status } : {}),
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          paidAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { providerTransactionId: { contains: query.search, mode: "insensitive" } },
            { notes: { contains: query.search, mode: "insensitive" } },
            { invoice: { invoiceNumber: { contains: query.search, mode: "insensitive" } } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
            { customer: { company: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total };
}

export async function listInvoicePayments(invoiceId: string): Promise<PaymentRecord[]> {
  return prisma.payment.findMany({
    where: { invoiceId },
    include: paymentInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function recordCompletedPaymentAndSettleInvoice(data: {
  organizationId: string;
  invoiceId: string;
  customerId: string;
  recordedById: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerTransactionId: string;
  paidAt: Date;
  notes?: string | null;
}): Promise<{ payment: PaymentRecord; amountPaid: string; status: InvoiceStatus }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundError("Invoice not found");
    }

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: data.invoiceId },
    });

    const completed = await tx.payment.findMany({
      where: { invoiceId: data.invoiceId, status: "COMPLETED" },
      select: { amount: true },
    });
    const recordedPaid = completed.reduce((sum, payment) => sum.plus(payment.amount), money(0));
    const nextPaid = recordedPaid.plus(data.amount);
    const total = money(invoice.total.toString());
    if (nextPaid.gt(total)) {
      throw new ValidationError("Payment exceeds the invoice balance");
    }

    const payment = await tx.payment.create({
      data: {
        organizationId: data.organizationId,
        invoiceId: data.invoiceId,
        customerId: data.customerId,
        recordedById: data.recordedById,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        provider: data.provider,
        providerTransactionId: data.providerTransactionId,
        status: "COMPLETED",
        paidAt: data.paidAt,
        notes: data.notes ?? null,
      },
    });

    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        provider: data.provider,
        providerReference: data.providerTransactionId,
        status: "COMPLETED",
        amount: data.amount,
        currency: data.currency,
        metadata: { source: "manual" },
      },
    });

    const amountPaid = moneyString(nextPaid);
    const status: InvoiceStatus = nextPaid.gte(total) ? "PAID" : "PARTIALLY_PAID";
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid, status },
    });

    const record = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: paymentInclude,
    });

    return { payment: record, amountPaid, status };
  });
}
