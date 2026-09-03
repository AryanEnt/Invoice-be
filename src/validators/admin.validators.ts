import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const createAdminSchema = z
  .object({
    email: emailField,
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    phone: z.string().trim().min(1).optional(),
    organizationId: z.string().uuid().optional(),
    temporaryPassword: z.string().min(8).optional(),
    password: z.string().min(8).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export const updateAdminSchema = z
  .object({
    email: emailField.optional(),
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateAdminStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const listAdminsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  organizationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
