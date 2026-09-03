import type { PaymentMethod, PaymentProvider, PaymentStatus } from "@prisma/client";

export interface PaymentPartySummary {
  id: string;
  name: string;
}

export interface PaymentUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface PaymentView {
  id: string;
  organizationId: string;
  invoiceId: string;
  customerId: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  notes: string | null;
  createdById: string;
  invoice: {
    id: string;
    invoiceNumber: string;
  };
  customer: PaymentPartySummary & {
    company: string | null;
  };
  createdBy: PaymentUserSummary;
  createdAt: string;
  updatedAt: string;
}
