import { z } from "zod";

const moneyString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0 && /^-?\d+(\.\d+)?$/.test(value), {
    message: "Must be a valid decimal amount",
  });

const invoiceItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    description: z.string().trim().min(1).optional(),
    quantity: moneyString,
    unitPrice: moneyString.optional(),
    discount: moneyString.optional(),
    taxRate: moneyString.optional(),
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    customerId: z.string().uuid(),
    organizationId: z.string().uuid().optional(),
    invoiceNumber: z.string().trim().min(1).optional(),
    invoiceDate: z.string().min(1),
    dueDate: z.string().min(1),
    currency: z.string().trim().min(1).max(8).optional(),
    notes: z.string().trim().min(1).optional(),
    terms: z.string().trim().min(1).optional(),
    assignedMemberId: z.string().uuid().optional(),
    items: z.array(invoiceItemSchema).min(1),
  })
  .strict();

export const updateInvoiceSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    invoiceNumber: z.string().trim().min(1).optional(),
    invoiceDate: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    notes: z.string().trim().min(1).nullable().optional(),
    terms: z.string().trim().min(1).nullable().optional(),
    assignedMemberId: z.string().uuid().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1).optional(),
  })
  .strict();

export const listInvoicesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z
    .enum(["DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"])
    .optional(),
  boardColumn: z.enum(["new", "sent", "overdue", "paid"]).optional(),
  customerId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  administratorId: z.string().uuid().optional(),
  assignedMemberId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(["invoiceDate", "dueDate", "total", "invoiceNumber", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const recordInvoicePaymentSchema = z
  .object({
    amount: moneyString,
    method: z.enum(["CASH", "BANK_TRANSFER", "CHECK", "OTHER"]).optional(),
    paidAt: z.string().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    providerTransactionId: z.string().trim().min(1).optional(),
    reference: z.string().trim().min(1).optional(),
  })
  .strict();
