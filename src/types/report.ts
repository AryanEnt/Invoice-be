import type { DatePreset } from "../lib/date-range.js";
import type { UserRole } from "@prisma/client";

export const REPORT_KINDS = [
  "summary",
  "revenue",
  "invoice-status",
  "paid",
  "outstanding",
  "overdue",
  "customer-balances",
  "payments",
  "expenses",
  "tax",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportScopeKind = "SYSTEM" | "ORGANIZATION" | "MEMBER" | "ADMIN";

export interface ReportTableColumn {
  key: string;
  label: string;
}

export interface ReportTable {
  columns: ReportTableColumn[];
  rows: Array<Record<string, string>>;
  page: number;
  pageSize: number;
  total: number;
}

export interface ReportSeriesPoint {
  label: string;
  value: string;
}

export interface ReportOverview {
  revenue: string;
  taxCollected: string;
  expenses: string;
  payments: string;
  invoices: number;
  paidInvoices: number;
  outstandingBalance: string;
  overdueInvoices: number;
}

export interface ReportView {
  kind: ReportKind;
  preset: DatePreset;
  dateFrom: string;
  dateTo: string;
  role: UserRole;
  scope: ReportScopeKind;
  organizationId: string | null;
  memberId?: string | null;
  currency: string;
  overview: ReportOverview;
  metrics: Record<string, string | number>;
  series: ReportSeriesPoint[];
  breakdown: ReportSeriesPoint[];
  table: ReportTable;
  organizations: Array<{ id: string; name: string }>;
}

export interface ReportQueryScope {
  organizationId?: string;
  userIds?: string[];
  administratorId?: string;
  expenseCreatedById?: string;
}
