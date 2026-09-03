import { z } from "zod";
import { DATE_PRESETS } from "../lib/date-range.js";
import { REPORT_KINDS } from "../types/report.js";

export const reportKindParamSchema = z.object({
  kind: z.enum(REPORT_KINDS),
});

export const reportQuerySchema = z.object({
  preset: z.enum(DATE_PRESETS).default("this_month"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  administratorId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(25),
});
