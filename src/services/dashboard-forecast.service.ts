import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { Prisma } from "@prisma/client";
import { money, moneyString } from "../lib/money.js";
import { resolveInvoiceUserScope } from "../lib/admin-scope.js";
import {
  getOrganizationSetting,
  upsertOrganizationSetting,
} from "../repositories/organization-setting.repository.js";
import {
  loadForecastSnapshot,
  type ForecastTrendPreset,
} from "../repositories/dashboard-forecast.repository.js";
import type { AuthUser } from "../types/auth.js";
import { scopedTenantOrganizationId } from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function collectionTargetKey(adminId: string): string {
  return `dashboard.collectionTarget.${adminId}`;
}

export interface DashboardForecastInsight {
  id: string;
  message: string;
  tone: "neutral" | "positive" | "warning";
}

export interface DashboardForecastView {
  currency: string;
  hasEnoughData: boolean;
  expectedThisMonth: string;
  expectedNext30Days: string;
  outstandingAmount: string;
  overdueAmount: string;
  target: {
    amount: string | null;
    collected: string;
    remaining: string;
    percentComplete: number;
  };
  insights: DashboardForecastInsight[];
  trendPreset: ForecastTrendPreset;
  trendGranularity: "day" | "month";
  trend: Array<{ period: string; collected: string; outstanding: string }>;
}

function buildInsights(snapshot: Awaited<ReturnType<typeof loadForecastSnapshot>>): DashboardForecastInsight[] {
  const insights: DashboardForecastInsight[] = [];
  const overdue = money(snapshot.overdueAmount);
  const due7 = money(snapshot.dueWithin7Days);
  const collectedThis = money(snapshot.collectedThisMonth);
  const collectedLast = money(snapshot.collectedLastMonth);
  const expectedThis = money(snapshot.expectedThisMonth);

  if (overdue.greaterThan(0)) {
    insights.push({
      id: "overdue",
      message: `${formatInsightMoney(snapshot.overdueAmount, snapshot.currency)} is currently overdue.`,
      tone: "warning",
    });
  }

  if (due7.greaterThan(0)) {
    insights.push({
      id: "due-7-days",
      message: `${formatInsightMoney(snapshot.dueWithin7Days, snapshot.currency)} in invoices are due within the next 7 days.`,
      tone: "neutral",
    });
  }

  if (snapshot.invoicesDueWithin7Days > 0) {
    insights.push({
      id: "may-overdue",
      message: `${snapshot.invoicesDueWithin7Days} invoice${snapshot.invoicesDueWithin7Days === 1 ? "" : "s"} may become overdue soon.`,
      tone: "warning",
    });
  }

  if (collectedLast.greaterThan(0)) {
    const change = collectedThis.minus(collectedLast).div(collectedLast).times(100);
    const pct = Math.round(Number(change.toFixed(1)));
    if (pct >= 5) {
      insights.push({
        id: "improving",
        message: "Collection performance is improving compared with the previous month.",
        tone: "positive",
      });
    } else if (pct <= -5) {
      insights.push({
        id: "collected-down",
        message: `Collection this month is ${Math.abs(pct)}% lower than last month.`,
        tone: "warning",
      });
    }
  }

  if (expectedThis.greaterThan(0) && collectedLast.greaterThan(0)) {
    const change = expectedThis.minus(collectedLast).div(collectedLast).times(100);
    const pct = Math.round(Number(change.toFixed(1)));
    if (pct >= 5) {
      insights.push({
        id: "expected-higher",
        message: `Expected collection is ${pct}% higher than last month.`,
        tone: "neutral",
      });
    }
  }

  return insights.slice(0, 5);
}

function formatInsightMoney(amount: string, currency: string): string {
  const value = Number(moneyString(amount));
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
}

export async function getDashboardForecast(
  actor: AuthUser,
  query: { trendPreset?: ForecastTrendPreset } = {},
): Promise<DashboardForecastView> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Forecast insights are available to administrators only");
  }

  const organizationId = await scopedTenantOrganizationId(actor);
  const userScope = await resolveInvoiceUserScope(actor);
  const trendPreset = query.trendPreset ?? "this_month";

  const snapshot = await loadForecastSnapshot({
    organizationId,
    userIds: userScope?.userIds,
    trendPreset,
  });

  const targetRaw = organizationId
    ? await getOrganizationSetting(organizationId, collectionTargetKey(actor.id))
    : null;
  const targetAmount =
    targetRaw && money(targetRaw).greaterThan(0) ? moneyString(targetRaw) : null;
  const collected = money(snapshot.collectedThisMonth);
  const target = targetAmount ? money(targetAmount) : null;
  const remaining = target
    ? moneyString(Prisma.Decimal.max(money(0), target.minus(collected)))
    : "0";
  const percentComplete =
    target && target.greaterThan(0)
      ? Math.min(100, Math.round(Number(collected.div(target).times(100).toFixed(0))))
      : 0;

  const hasEnoughData = snapshot.invoiceCount > 0 || snapshot.paymentCount > 0;

  return {
    currency: snapshot.currency,
    hasEnoughData,
    expectedThisMonth: snapshot.expectedThisMonth,
    expectedNext30Days: snapshot.expectedNext30Days,
    outstandingAmount: snapshot.outstandingAmount,
    overdueAmount: snapshot.overdueAmount,
    target: {
      amount: targetAmount,
      collected: snapshot.collectedThisMonth,
      remaining,
      percentComplete,
    },
    insights: hasEnoughData ? buildInsights(snapshot) : [],
    trendPreset,
    trendGranularity: snapshot.trendGranularity,
    trend: snapshot.trend,
  };
}

export async function updateCollectionTarget(
  actor: AuthUser,
  amount: string,
): Promise<{ amount: string }> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Only administrators can set a collection target");
  }

  const organizationId = await scopedTenantOrganizationId(actor);
  if (!organizationId) {
    throw new ValidationError("No organization is available for settings");
  }

  const parsed = money(amount);
  if (parsed.lessThan(0)) {
    throw new ValidationError("Target amount must be zero or greater");
  }

  const value = moneyString(parsed);
  await upsertOrganizationSetting(organizationId, collectionTargetKey(actor.id), value);

  await recordAudit({
    actorId: actor.id,
    action: "COLLECTION_TARGET_UPDATED",
    entity: "OrganizationSetting",
    entityId: organizationId,
    organizationId,
    metadata: { amount: value },
  });

  return { amount: value };
}

export async function getCollectionTarget(actor: AuthUser): Promise<{ amount: string | null; currency: string }> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Only administrators can view a collection target");
  }
  const organizationId = await scopedTenantOrganizationId(actor);
  const raw = organizationId
    ? await getOrganizationSetting(organizationId, collectionTargetKey(actor.id))
    : null;
  return {
    amount: raw && money(raw).greaterThan(0) ? moneyString(raw) : null,
    currency: "USD",
  };
}
