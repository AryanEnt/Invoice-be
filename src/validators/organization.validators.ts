import { z } from "zod";

const slugField = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers, and hyphens");

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: slugField.optional(),
  })
  .strict();

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: slugField.optional(),
  })
  .strict();

export const updateOrganizationStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();
