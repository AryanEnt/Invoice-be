import { z } from "zod";

const moneyString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0 && /^-?\d+(\.\d+)?$/.test(value), {
    message: "Must be a valid decimal amount",
  });

export const createExpenseSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    categoryName: z.string().trim().min(1).max(80),
    amount: moneyString,
    currency: z.string().trim().min(1).max(8).optional(),
    incurredOn: z.string().min(1),
    vendor: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .strict();
