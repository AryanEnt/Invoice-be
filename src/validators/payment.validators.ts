import { z } from "zod";

const moneyString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0 && /^-?\d+(\.\d+)?$/.test(value), {
    message: "Must be a valid decimal amount",
  });

const paymentMethod = z.enum(["CASH", "BANK_TRANSFER", "CHECK", "OTHER"]);

export const createPaymentSchema = z
  .object({
    invoiceId: z.string().uuid(),
    amount: moneyString,
    currency: z.string().trim().min(1).max(8).optional(),
    method: paymentMethod.optional(),
    paidAt: z.string().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    providerTransactionId: z.string().trim().min(1).optional(),
  })
  .strict();

export const listPaymentsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
