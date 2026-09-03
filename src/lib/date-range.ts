import { ValidationError } from "./errors.js";

export const DATE_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "this_quarter",
  "this_year",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export interface DateRange {
  start: Date;
  end: Date;
}

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function resolveDateRange(
  preset: DatePreset,
  dateFrom?: string,
  dateTo?: string,
  now = new Date(),
): DateRange {
  const today = startOfUtcDay(now);

  if (preset === "custom") {
    if (!dateFrom || !dateTo) {
      throw new ValidationError("Custom range requires dateFrom and dateTo");
    }
    const start = startOfUtcDay(new Date(dateFrom));
    const end = addUtcDays(startOfUtcDay(new Date(dateTo)), 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ValidationError("Custom range dates are invalid");
    }
    if (start >= end) {
      throw new ValidationError("dateFrom must be on or before dateTo");
    }
    return { start, end };
  }

  if (preset === "today") {
    return { start: today, end: addUtcDays(today, 1) };
  }

  if (preset === "this_week") {
    const weekday = today.getUTCDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    const start = addUtcDays(today, -mondayOffset);
    return { start, end: addUtcDays(start, 7) };
  }

  if (preset === "this_month") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { start, end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)) };
  }

  if (preset === "last_month") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    return { start, end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)) };
  }

  if (preset === "last_3_months") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
    return { start, end: addUtcDays(today, 1) };
  }

  if (preset === "last_6_months") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
    return { start, end: addUtcDays(today, 1) };
  }

  if (preset === "this_quarter") {
    const quarter = Math.floor(today.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(today.getUTCFullYear(), quarter, 1));
    return { start, end: new Date(Date.UTC(today.getUTCFullYear(), quarter + 3, 1)) };
  }

  const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  return { start, end: new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1)) };
}

export function rangeDayCount(range: DateRange): number {
  return Math.round((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000));
}

export function periodKey(value: Date, daily: boolean): string {
  if (daily) {
    return value.toISOString().slice(0, 10);
  }
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodKeys(range: DateRange, daily: boolean): string[] {
  const keys: string[] = [];
  if (daily) {
    for (let cursor = new Date(range.start); cursor < range.end; cursor = addUtcDays(cursor, 1)) {
      keys.push(periodKey(cursor, true));
    }
    return keys;
  }

  let cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  while (cursor < range.end) {
    keys.push(periodKey(cursor, false));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return keys;
}
