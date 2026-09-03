import type { InvoiceStatus, UserRole } from "@prisma/client";
import type { PaymentStatus } from "../lib/invoice-status.js";

export type DashboardScopeKind = "SYSTEM" | "ORGANIZATION" | "MEMBER" | "ADMIN";
export type DashboardGranularity = "day" | "month";

export interface DashboardInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  total: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string;
  currency: string;
  customerName: string;
  organizationName: string | null;
}

export interface DashboardPaymentSummary {
  id: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  organizationName: string | null;
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface DashboardSeriesPoint {
  period: string;
  amount: string;
}

export interface DashboardMemberPerformance {
  memberId: string | null;
  memberName: string;
  invoiceCount: number;
  revenue: string;
  outstanding: string;
}

export interface DashboardTopCustomer {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  total: string;
  paid: string;
  outstanding: string;
}

export interface DashboardOrganizationActivity {
  organizationId: string;
  organizationName: string;
  invoiceCount: number;
  revenue: string;
}

export interface DashboardMoneyByCurrency {
  currency: string;
  amount: string;
}

export interface DashboardEmailDelivery {
  sent: number;
  failed: number;
  notSent: number;
}

export interface DashboardAdministratorOverview {
  administratorId: string;
  administratorName: string;
  status: string;
  memberCount: number;
  customerCount: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  revenue: string;
  outstanding: string;
  currency: string;
}

export interface DashboardRecentCustomer {
  customerId: string;
  customerName: string;
  createdAt: string;
  invoiceCount: number;
  paid: string;
  currency: string;
}

export interface DashboardOrganizationOption {
  id: string;
  name: string;
}

export interface DashboardMetrics {
  organizations: number | null;
  activeOrganizations: number | null;
  inactiveOrganizations: number | null;
  admins: number | null;
  members: number | null;
  customers: number | null;
  invoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  partiallyPaidInvoices: number;
  expenses: string;
  revenue: string;
  paidAmount: string;
  outstandingBalance: string;
  overdueAmount: string;
  draftInvoices: number;
  sentInvoices: number;
  viewedInvoices: number;
  cancelledInvoices: number;
  failedEmails: number;
  adminsWithoutMembers: number;
}

export interface DashboardView {
  role: UserRole;
  scope: DashboardScopeKind;
  organizationId: string | null;
  currency: string;
  granularity: DashboardGranularity;
  range: { preset: string; start: string; end: string };
  metrics: DashboardMetrics;
  invoiceStatusSeries: DashboardStatusCount[];
  revenueSeries: DashboardSeriesPoint[];
  invoiceCountSeries: DashboardSeriesPoint[];
  paymentSeries: DashboardSeriesPoint[];
  expenseSeries: DashboardSeriesPoint[];
  memberPerformance: DashboardMemberPerformance[];
  topCustomers: DashboardTopCustomer[];
  organizationActivity: DashboardOrganizationActivity[];
  recentInvoices: DashboardInvoiceSummary[];
  recentPayments: DashboardPaymentSummary[];
  overdueInvoices: DashboardInvoiceSummary[];
  organizations: DashboardOrganizationOption[];
  currencies: string[];
  revenueByCurrency: DashboardMoneyByCurrency[];
  outstandingByCurrency: DashboardMoneyByCurrency[];
  overdueByCurrency: DashboardMoneyByCurrency[];
  emailDelivery: DashboardEmailDelivery;
  invoiceCreatedSeries: DashboardSeriesPoint[];
  invoiceSentSeries: DashboardSeriesPoint[];
  invoicePaidSeries: DashboardSeriesPoint[];
  administratorOverview: DashboardAdministratorOverview[];
  recentCustomers: DashboardRecentCustomer[];
}
