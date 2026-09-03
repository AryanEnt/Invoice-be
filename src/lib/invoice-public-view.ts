import type { InvoiceRecord } from "./invoice-view.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "./invoice-status.js";
import { money, moneyString } from "./money.js";

export interface PublicInvoiceView {
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  organizationName: string;
  organizationLogoUrl: string | null;
  customer: {
    name: string;
    company: string | null;
  };
  billingAddress: {
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
  } | null;
  items: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
}

export function toPublicInvoiceView(
  invoice: InvoiceRecord,
  now = new Date(),
  organizationLogoUrl: string | null = null,
  companyName?: string | null,
): PublicInvoiceView {
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
  const billing = invoice.billingAddress;

  return {
    invoiceNumber: invoice.invoiceNumber,
    status,
    paymentStatus,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    currency: invoice.currency,
    subtotal: moneyString(invoice.subtotal.toString()),
    total,
    amountPaid,
    balanceDue,
    notes: invoice.notes,
    terms: invoice.terms,
    organizationName: companyName?.trim() || invoice.organization?.name || "Company",
    organizationLogoUrl,
    customer: {
      name: invoice.customer.name,
      company: invoice.customer.company,
    },
    billingAddress: billing
      ? {
          line1: billing.line1,
          line2: billing.line2,
          city: billing.city,
          region: billing.region,
          postalCode: billing.postalCode,
          country: billing.country,
        }
      : null,
    items: [...invoice.items]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        description: item.description,
        quantity: moneyString(item.quantity.toString()),
        unitPrice: moneyString(item.unitPrice.toString()),
        lineTotal: moneyString(item.lineTotal.toString()),
      })),
  };
}
