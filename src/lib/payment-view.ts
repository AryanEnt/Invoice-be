import type { Customer, Invoice, Payment, User } from "@prisma/client";
import { moneyString } from "./money.js";
import type { PaymentView } from "../types/payment.js";

export type PaymentRecord = Payment & {
  invoice: Pick<Invoice, "id" | "invoiceNumber">;
  customer: Pick<Customer, "id" | "name" | "company">;
  recordedBy: Pick<User, "id" | "firstName" | "lastName" | "email">;
};

export function toPaymentView(payment: PaymentRecord): PaymentView {
  return {
    id: payment.id,
    organizationId: payment.organizationId,
    invoiceId: payment.invoiceId,
    customerId: payment.customerId,
    amount: moneyString(payment.amount.toString()),
    currency: payment.currency,
    method: payment.method,
    provider: payment.provider,
    providerTransactionId: payment.providerTransactionId,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    notes: payment.notes,
    createdById: payment.recordedById,
    invoice: {
      id: payment.invoice.id,
      invoiceNumber: payment.invoice.invoiceNumber,
    },
    customer: {
      id: payment.customer.id,
      name: payment.customer.name,
      company: payment.customer.company,
    },
    createdBy: {
      id: payment.recordedBy.id,
      firstName: payment.recordedBy.firstName,
      lastName: payment.recordedBy.lastName,
      email: payment.recordedBy.email,
    },
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
