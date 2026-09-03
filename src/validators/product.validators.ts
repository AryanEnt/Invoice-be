import { z } from "zod";

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1),
    kind: z.enum(["PRODUCT", "SERVICE"]),
    description: z.string().trim().min(1).optional(),
    sku: z.string().trim().min(1).optional(),
    unit: z.string().trim().min(1).optional(),
    unitPrice: z.number().finite().min(0),
    currency: z.string().trim().min(1).max(8).optional(),
    taxRate: z.number().finite().min(0).max(100).optional(),
    organizationId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    kind: z.enum(["PRODUCT", "SERVICE"]).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    sku: z.string().trim().min(1).nullable().optional(),
    unit: z.string().trim().min(1).nullable().optional(),
    unitPrice: z.number().finite().min(0).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    taxRate: z.number().finite().min(0).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const listProductsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  kind: z.enum(["PRODUCT", "SERVICE"]).optional(),
  organizationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
