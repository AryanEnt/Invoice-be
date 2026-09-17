import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().min(1).default("sid"),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_SUPER_ADMIN_FIRST_NAME: z.string().optional(),
  BOOTSTRAP_SUPER_ADMIN_LAST_NAME: z.string().optional(),
  STRIPE_SECRET_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  STRIPE_CLIENT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  STRIPE_CLIENT_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  STRIPE_REDIRECT_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  PAYPAL_CLIENT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  PAYPAL_CLIENT_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  PAYPAL_ENV: z.preprocess((value) => {
    const environment = process.env.PAYPAL_ENVIRONMENT;
    const raw = value === "" || value == null ? environment : value;
    if (raw === "" || raw == null) {
      return "sandbox";
    }
    if (raw === "production") {
      return "live";
    }
    return raw;
  }, z.enum(["sandbox", "live"]).default("sandbox")),
  PAYPAL_WEBHOOK_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  PAYPAL_REDIRECT_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  /** Kept for compatibility; Connect always uses PayPal-hosted Log in / Connect. */
  PAYPAL_IDENTITY_CONNECT: z.preprocess((value) => {
    if (value === "false" || value === "0") return false;
    return true;
  }, z.boolean().default(true)),
  API_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  PAYMENT_TOKEN_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EMAIL_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EMAIL_FROM_NAME: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  EMAIL_REPLY_TO: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  R2_ACCOUNT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  R2_ACCESS_KEY_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  R2_SECRET_ACCESS_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  R2_BUCKET_NAME: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  R2_ENDPOINT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === "production" && !data.PAYMENT_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "Invalid environment configuration: PAYMENT_TOKEN_ENCRYPTION_KEY is required in production",
    );
  }

  return data;
}

export const env = parseEnv();

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

