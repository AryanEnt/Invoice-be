import { env } from "../../config/env.js";
import { UnconfiguredEmailProvider } from "./providers/unconfigured.provider.js";
import { ResendEmailProvider } from "./providers/resend.provider.js";
import type { EmailProvider } from "./types.js";

export function getEmailProvider(): EmailProvider {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (apiKey && from) {
    return new ResendEmailProvider(apiKey);
  }
  return new UnconfiguredEmailProvider();
}
