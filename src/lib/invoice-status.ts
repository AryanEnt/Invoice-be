import type { InvoiceStatus } from "@prisma/client";
import { money } from "./money.js";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "NONE";

const EDITABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set(["DRAFT"]);
const SENDABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set(["DRAFT"]);
const CANCELLABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  "DRAFT",
  "SENT",
  "VIEWED",
  "OVERDUE",
]);
const PAYABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  "SENT",
  "VIEWED",
  "OVERDUE",
  "PARTIALLY_PAID",
]);

export function derivePaymentStatus(
  total: string,
  amountPaid: string,
  status: InvoiceStatus,
): PaymentStatus {
  if (status === "CANCELLED") {
    return "NONE";
  }
  const paid = money(amountPaid);
  const due = money(total);
  if (status !== "DRAFT" && due.lte(0)) {
    return "PAID";
  }
  if (paid.lte(0)) {
    return "UNPAID";
  }
  if (paid.gte(due)) {
    return "PAID";
  }
  return "PARTIALLY_PAID";
}

export function deriveInvoiceStatus(input: {
  storedStatus: InvoiceStatus;
  total: string;
  amountPaid: string;
  dueDate: Date;
  now?: Date;
}): InvoiceStatus {
  const paymentStatus = derivePaymentStatus(input.total, input.amountPaid, input.storedStatus);

  if (input.storedStatus === "CANCELLED") {
    return "CANCELLED";
  }
  if (input.storedStatus === "DRAFT") {
    return "DRAFT";
  }
  if (paymentStatus === "PAID") {
    return "PAID";
  }
  if (paymentStatus === "PARTIALLY_PAID") {
    return "PARTIALLY_PAID";
  }

  const now = input.now ?? new Date();
  if (input.dueDate.getTime() < startOfDay(now).getTime()) {
    return "OVERDUE";
  }

  return input.storedStatus;
}

export function canEditInvoice(status: InvoiceStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function canSendInvoice(status: InvoiceStatus): boolean {
  return SENDABLE_STATUSES.has(status);
}

export function canCancelInvoice(status: InvoiceStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

export function canDeleteInvoice(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function canRecordPayment(status: InvoiceStatus): boolean {
  return PAYABLE_STATUSES.has(status);
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
