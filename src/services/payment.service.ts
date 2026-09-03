import type { PaymentMethod } from "@prisma/client";
import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { resolveInvoiceUserScope } from "../lib/admin-scope.js";
import { assertInvoiceAccess } from "../lib/invoice-access.js";
import { canRecordPayment, deriveInvoiceStatus } from "../lib/invoice-status.js";
import { toInvoiceView } from "../lib/invoice-view.js";
import { money, moneyString } from "../lib/money.js";
import { parseDateValue } from "../lib/parse-date.js";
import { toPaymentView } from "../lib/payment-view.js";
import { findInvoiceById } from "../repositories/invoice.repository.js";
import {
  findPaymentById,
  listInvoicePayments,
  listPayments,
  recordCompletedPaymentAndSettleInvoice,
} from "../repositories/payment.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { InvoiceView } from "../types/invoice.js";
import type { PaymentView } from "../types/payment.js";
import { scopedTenantOrganizationId } from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

export interface RecordManualPaymentInput {
  invoiceId: string;
  amount: string;
  currency?: string;
  method?: PaymentMethod;
  paidAt?: string;
  notes?: string;
  providerTransactionId?: string;
}

export async function recordManualPayment(
  actor: AuthUser,
  input: RecordManualPaymentInput,
): Promise<{ payment: PaymentView; invoice: InvoiceView }> {
  const invoice = await findInvoiceById(input.invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  const displayStatus = deriveInvoiceStatus({
    storedStatus: invoice.status,
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    dueDate: invoice.dueDate,
  });

  if (!canRecordPayment(displayStatus)) {
    throw new ForbiddenError("Payments cannot be recorded on this invoice");
  }

  const amount = money(input.amount);
  if (!amount.gt(0)) {
    throw new ValidationError("Payment amount must be greater than zero");
  }

  if (input.currency && input.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
    throw new ValidationError("Payment currency must match the invoice currency");
  }

  const provider = PaymentProviderFactory.resolve(PaymentProviderName.MANUAL);
  const session = await provider.createPaymentSession({
    invoiceId: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    amount: moneyString(amount),
    currency: invoice.currency,
    method: input.method ?? "OTHER",
    notes: input.notes,
    providerTransactionId: input.providerTransactionId,
  });

  const settled = await recordCompletedPaymentAndSettleInvoice({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    recordedById: actor.id,
    amount: moneyString(amount),
    currency: invoice.currency,
    method: input.method ?? "OTHER",
    provider: "MANUAL",
    providerTransactionId: session.providerTransactionId,
    paidAt: input.paidAt ? parseDateValue(input.paidAt, "paidAt") : new Date(),
    notes: input.notes,
  });
  const payment = settled.payment;
  const updated = await findInvoiceById(invoice.id);
  if (!updated) {
    throw new NotFoundError("Invoice not found");
  }

  await recordAudit({
    actorId: actor.id,
    action: "PAYMENT_RECORDED",
    entity: "Payment",
    entityId: payment.id,
    organizationId: invoice.organizationId,
    metadata: {
      invoiceId: invoice.id,
      amount: moneyString(amount),
      provider: "MANUAL",
      method: input.method ?? "OTHER",
    },
  });

  return {
    payment: toPaymentView(payment),
    invoice: toInvoiceView(updated),
  };
}

export async function listPaymentRecords(
  actor: AuthUser,
  query: {
    search?: string;
    status?: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CANCELLED";
    customerId?: string;
    invoiceId?: string;
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: PaymentView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const organizationId = await scopedTenantOrganizationId(actor, query.organizationId);
  const userScope = await resolveInvoiceUserScope(actor);

  if (actor.role === "MEMBER" && query.invoiceId) {
    const invoice = await findInvoiceById(query.invoiceId);
    if (!invoice) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 };
    }
    try {
      await assertInvoiceAccess(actor, invoice);
    } catch {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 };
    }
  }

  const { items, total } = await listPayments({
    search: query.search,
    status: query.status,
    customerId: query.customerId,
    invoiceId: query.invoiceId,
    organizationId,
    userIds: userScope?.userIds,
    dateFrom: query.dateFrom ? parseDateValue(query.dateFrom, "dateFrom") : undefined,
    dateTo: query.dateTo ? parseDateValue(query.dateTo, "dateTo") : undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: items.map(toPaymentView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getPaymentRecord(actor: AuthUser, id: string): Promise<PaymentView> {
  const payment = await findPaymentById(id);
  if (!payment) {
    throw new NotFoundError("Payment not found");
  }

  const invoice = await findInvoiceById(payment.invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);
  return toPaymentView(payment);
}

export async function listPaymentsForInvoice(
  actor: AuthUser,
  invoiceId: string,
): Promise<PaymentView[]> {
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);
  const payments = await listInvoicePayments(invoiceId);
  return payments.map(toPaymentView);
}
