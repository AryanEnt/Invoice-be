import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const createMemberSchema = z
  .object({
    email: emailField,
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    organizationId: z.string().uuid().optional(),
    temporaryPassword: z.string().min(8).optional(),
    password: z.string().min(8).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    email: emailField.optional(),
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    temporaryPassword: z.string().min(8).optional(),
    password: z.string().min(8).optional(),
  })
  .strict();

export const updateMemberStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const listMembersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  organizationId: z.string().uuid().optional(),
  administratorId: z.union([z.string().uuid(), z.literal("none")]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
