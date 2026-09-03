import { z } from "zod";

export const createOrganizationLogoUploadUrlSchema = z
  .object({
    contentType: z.enum([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ]),
    contentLength: z.number().int().positive().max(2 * 1024 * 1024),
  })
  .strict();

export const confirmOrganizationLogoSchema = z
  .object({
    objectKey: z.string().min(1).max(512),
    contentType: z.enum([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ]),
  })
  .strict();

export const updateInvoiceSettingsSchema = z
  .object({
    companyName: z.string().trim().min(1).max(120).optional(),
    currency: z.string().trim().min(3).max(3),
    language: z.string().trim().min(2).max(10),
    address: z
      .object({
        line1: z.string().trim().max(200),
        line2: z.string().trim().max(200),
        city: z.string().trim().max(100),
        region: z.string().trim().max(100),
        postalCode: z.string().trim().max(40),
        country: z.string().trim().max(100),
      })
      .strict(),
  })
  .strict();

export const updateEmailTemplatesSchema = z
  .object({
    unpaid: z
      .object({
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(10000),
      })
      .strict(),
    paid: z
      .object({
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(10000),
      })
      .strict(),
  })
  .strict();
