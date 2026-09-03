import type { ZodType } from "zod";
import { ValidationError } from "../lib/errors.js";

export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError("Request validation failed", result.error.flatten());
  }

  return result.data;
}
