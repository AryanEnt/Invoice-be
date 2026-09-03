import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export const createAvatarUploadUrlSchema = z
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

export const confirmAvatarSchema = z
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
