import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const addressInputSchema = z
  .object({
    line1: z.string().trim().min(1),
    line2: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1),
    region: z.string().trim().min(1).optional(),
    postalCode: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1),
  })
  .strict();

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1),
    company: z.string().trim().min(1).optional(),
    email: emailField.optional(),
    phone: z.string().trim().min(1).optional(),
    taxNumber: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    organizationId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
    billingAddress: addressInputSchema.optional(),
    shippingAddress: addressInputSchema.optional(),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    company: z.string().trim().min(1).nullable().optional(),
    email: emailField.nullable().optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    taxNumber: z.string().trim().min(1).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    billingAddress: addressInputSchema.nullable().optional(),
    shippingAddress: addressInputSchema.nullable().optional(),
  })
  .strict();

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  organizationId: z.string().uuid().optional(),
  invoiceLifecycle: z.enum(["NEW", "OLD"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
