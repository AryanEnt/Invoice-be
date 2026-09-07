import { env } from "../../config/env.js";
import { UnconfiguredEmailProvider } from "./providers/unconfigured.provider.js";
import { SmtpEmailProvider } from "./providers/smtp.provider.js";
import type { EmailProvider } from "./types.js";

function smtpReady(): boolean {
  return Boolean(
    env.SMTP_HOST?.trim() &&
      env.SMTP_PORT &&
      env.SMTP_USER?.trim() &&
      env.SMTP_PASSWORD &&
      env.EMAIL_FROM?.trim(),
  );
}

export function getEmailProvider(): EmailProvider {
  if (smtpReady()) {
    return new SmtpEmailProvider();
  }
  return new UnconfiguredEmailProvider();
}
