import type { CatalogKind, InvoiceEmailStatus, InvoiceStatus } from "@prisma/client";
import type { AddressView, OrganizationSummary } from "./auth.js";
import type { PaymentStatus } from "../lib/invoice-status.js";
import type { PaymentView } from "./payment.js";

export interface InvoiceItemView {
  id: string;
  productId: string | null;
  catalogKind: CatalogKind | null;
  sku: string | null;
  unit: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string | null;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  sortOrder: number;
}

export interface InvoicePartySummary {
  id: string;
  name: string;
}

export interface InvoiceUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface InvoiceView {
  id: string;
  organizationId: string;
  customerId: string;
  createdById: string;
  assignedMemberId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  shareUrl: string | null;
  emailStatus: InvoiceEmailStatus;
  emailSentAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  organization: OrganizationSummary | null;
  customer: InvoicePartySummary & {
    company: string | null;
    email: string | null;
    phone: string | null;
    taxNumber: string | null;
  };
  createdBy: InvoiceUserSummary;
  assignedMember: InvoiceUserSummary | null;
  billingAddress: AddressView | null;
  shippingAddress: AddressView | null;
  items: InvoiceItemView[];
  payments: PaymentView[];
  createdAt: string;
  updatedAt: string;
}
