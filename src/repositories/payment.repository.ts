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

export async function findPaymentByProviderTransactionId(
  provider: PaymentProvider,
  providerTransactionId: string,
): Promise<PaymentRecord | null> {
  return prisma.payment.findFirst({
    where: { provider, providerTransactionId },
    include: paymentInclude,
  });
}

export async function createPendingProviderPayment(data: {
  organizationId: string;
  invoiceId: string;
  customerId: string;
  recordedById: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerTransactionId: string;
}): Promise<PaymentRecord> {
  return prisma.payment.create({
    data: {
      ...data,
      status: "PENDING",
    },
    include: paymentInclude,
  });
}

export async function markProviderPaymentStatus(
  id: string,
  status: Extract<PaymentStatus, "FAILED" | "CANCELLED">,
): Promise<void> {
  await prisma.payment.update({
    where: { id },
    data: { status },
  });
}

export async function cancelPendingProviderPayments(input: {
  invoiceId: string;
  provider?: PaymentProvider;
  exceptTransactionId?: string;
}): Promise<number> {
  const result = await prisma.payment.updateMany({
    where: {
      invoiceId: input.invoiceId,
      status: "PENDING",
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.exceptTransactionId
        ? { providerTransactionId: { not: input.exceptTransactionId } }
        : {}),
    },
    data: { status: "CANCELLED" },
  });
  return result.count;
}

export async function findPendingProviderPayments(
  invoiceId: string,
  provider: PaymentProvider,
): Promise<PaymentRecord[]> {
  return prisma.payment.findMany({
    where: { invoiceId, provider, status: "PENDING" },
    include: paymentInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function markPaymentReceiptSent(id: string): Promise<boolean> {
  const result = await prisma.payment.updateMany({
    where: { id, receiptSentAt: null },
    data: { receiptSentAt: new Date() },
  });
  return result.count === 1;
}

export async function completeProviderPayment(data: {
  organizationId: string;
  invoiceId: string;
  customerId: string;
  recordedById: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerTransactionId: string;
  captureId?: string;
  paidAt: Date;
  notes?: string | null;
}): Promise<{ payment: PaymentRecord; amountPaid: string; status: InvoiceStatus; alreadyCompleted: boolean }> {
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

    const existing = await tx.payment.findFirst({
      where: {
        provider: data.provider,
        providerTransactionId: data.providerTransactionId,
      },
    });

    if (existing?.status === "COMPLETED") {
      const record = await tx.payment.findUniqueOrThrow({
        where: { id: existing.id },
        include: paymentInclude,
      });
      return {
        payment: record,
        amountPaid: moneyString(invoice.amountPaid.toString()),
        status: invoice.status,
        alreadyCompleted: true,
      };
    }

    const completed = await tx.payment.findMany({
      where: {
        invoiceId: data.invoiceId,
        status: "COMPLETED",
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { amount: true },
    });
    const recordedPaid = completed.reduce((sum, payment) => sum.plus(payment.amount), money(0));
    const nextPaid = recordedPaid.plus(data.amount);
    const total = money(invoice.total.toString());
    if (nextPaid.gt(total)) {
      throw new ValidationError("Payment exceeds the invoice balance");
    }

    const payment = existing
      ? await tx.payment.update({
          where: { id: existing.id },
          data: {
            amount: data.amount,
            currency: data.currency,
            status: "COMPLETED",
            paidAt: data.paidAt,
            notes: data.notes ?? existing.notes,
          },
        })
      : await tx.payment.create({
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

    const captureRef = data.captureId ?? data.providerTransactionId;
    const existingTxn = await tx.paymentTransaction.findFirst({
      where: { provider: data.provider, providerReference: captureRef },
    });
    if (!existingTxn) {
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          provider: data.provider,
          providerReference: captureRef,
          status: "COMPLETED",
          amount: data.amount,
          currency: data.currency,
          metadata: { source: data.provider.toLowerCase(), orderId: data.providerTransactionId, captureId: data.captureId ?? null },
        },
      });
    }

    const amountPaid = moneyString(nextPaid);
    const status: InvoiceStatus = nextPaid.gte(total) ? "PAID" : "PARTIALLY_PAID";
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid, status },
    });
    await tx.payment.updateMany({
      where: {
        invoiceId: invoice.id,
        status: "PENDING",
        id: { not: payment.id },
      },
      data: { status: "CANCELLED" },
    });

    const record = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: paymentInclude,
    });

    return { payment: record, amountPaid, status, alreadyCompleted: false };
  });
}

export async function applyProviderRefund(data: {
  provider: PaymentProvider;
  providerTransactionId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        provider: data.provider,
        providerTransactionId: data.providerTransactionId,
      },
    });
    if (!payment || payment.status === "REFUNDED") {
      return;
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED" },
    });

    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    const completed = await tx.payment.findMany({
      where: { invoiceId: invoice.id, status: "COMPLETED" },
      select: { amount: true },
    });
    const recordedPaid = completed.reduce((sum, row) => sum.plus(row.amount), money(0));
    const total = money(invoice.total.toString());
    const amountPaid = moneyString(recordedPaid);
    const nextStatus: InvoiceStatus = recordedPaid.lte(0)
      ? invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID"
        ? "SENT"
        : invoice.status
      : recordedPaid.gte(total)
        ? "PAID"
        : "PARTIALLY_PAID";
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid, status: nextStatus },
    });
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
