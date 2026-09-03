import type {
  Address,
  Customer,
  Invoice,
  InvoiceItem,
  Organization,
  User,
} from "@prisma/client";
import { calculateInvoiceLine } from "./invoice-calc.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "./invoice-status.js";
import { money, moneyString } from "./money.js";
import { toAddressView } from "./customer-view.js";
import { toPaymentView, type PaymentRecord } from "./payment-view.js";
import { invoiceShareUrl } from "./invoice-share.js";
import type { InvoiceItemView, InvoiceView } from "../types/invoice.js";

export type InvoiceRecord = Invoice & {
  organization: Organization | null;
  customer: Customer;
  createdBy: User;
  assignedMember: User | null;
  billingAddress: Address | null;
  shippingAddress: Address | null;
  items: InvoiceItem[];
  payments?: PaymentRecord[];
};

export function toInvoiceItemView(item: InvoiceItem): InvoiceItemView {
  const calculated = calculateInvoiceLine({
    quantity: item.quantity.toString(),
    unitPrice: item.unitPrice.toString(),
  });

  return {
    id: item.id,
    productId: item.productId,
    catalogKind: item.catalogKind,
    sku: item.sku,
    unit: item.unit,
    description: item.description,
    quantity: moneyString(item.quantity.toString()),
    unitPrice: moneyString(item.unitPrice.toString()),
    discount: moneyString(item.discount.toString()),
    taxRate: item.taxRate === null ? null : moneyString(item.taxRate.toString()),
    taxAmount: calculated.taxAmount,
    lineSubtotal: calculated.lineSubtotal,
    lineTotal: calculated.lineTotal,
    sortOrder: item.sortOrder,
  };
}

export function toInvoiceView(invoice: InvoiceRecord, now = new Date()): InvoiceView {
  const subtotal = moneyString(invoice.subtotal.toString());
  const discountAmount = moneyString(invoice.discountAmount.toString());
  const taxAmount = moneyString(invoice.taxAmount.toString());
  const total = moneyString(invoice.total.toString());
  const amountPaid = moneyString(
    invoice.payments
      ? invoice.payments
          .filter((payment) => payment.status === "COMPLETED")
          .reduce((sum, payment) => sum.plus(payment.amount.toString()), money(0))
      : invoice.amountPaid.toString(),
  );
  const status = deriveInvoiceStatus({
    storedStatus: invoice.status,
    total,
    amountPaid,
    dueDate: invoice.dueDate,
    now,
  });
  const paymentStatus = derivePaymentStatus(total, amountPaid, status);
  const balanceDue = moneyString(money(total).minus(amountPaid).lt(0) ? 0 : money(total).minus(amountPaid));

  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    createdById: invoice.createdById,
    assignedMemberId: invoice.assignedMemberId,
    invoiceNumber: invoice.invoiceNumber,
    status,
    paymentStatus,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    currency: invoice.currency,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    amountPaid,
    balanceDue,
    notes: invoice.notes,
    terms: invoice.terms,
    shareUrl: invoice.shareToken ? invoiceShareUrl(invoice.shareToken) : null,
    emailStatus: invoice.emailStatus ?? "NOT_SENT",
    emailSentAt: invoice.emailSentAt?.toISOString() ?? null,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    viewedAt: invoice.viewedAt?.toISOString() ?? null,
    organization: invoice.organization
      ? {
          id: invoice.organization.id,
          name: invoice.organization.name,
          slug: invoice.organization.slug,
          isActive: invoice.organization.isActive,
          logoUrl: null,
        }
      : null,
    customer: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      company: invoice.customer.company,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
      taxNumber: invoice.customer.taxNumber,
    },
    createdBy: {
      id: invoice.createdBy.id,
      firstName: invoice.createdBy.firstName,
      lastName: invoice.createdBy.lastName,
      email: invoice.createdBy.email,
    },
    assignedMember: invoice.assignedMember
      ? {
          id: invoice.assignedMember.id,
          firstName: invoice.assignedMember.firstName,
          lastName: invoice.assignedMember.lastName,
          email: invoice.assignedMember.email,
        }
      : null,
    billingAddress: toAddressView(invoice.billingAddress),
    shippingAddress: toAddressView(invoice.shippingAddress),
    items: [...invoice.items]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(toInvoiceItemView),
    payments: (invoice.payments ?? []).map(toPaymentView),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}
