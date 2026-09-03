import { z } from "zod";
import { DATE_PRESETS } from "../lib/date-range.js";

export const FORECAST_TREND_PRESETS = [
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
] as const;

export const dashboardQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  preset: z.enum(DATE_PRESETS).default("this_year"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const dashboardForecastQuerySchema = z.object({
  trendPreset: z.enum(FORECAST_TREND_PRESETS).default("this_month"),
});

export const updateCollectionTargetSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, "Enter a valid amount"),
  })
  .strict();
