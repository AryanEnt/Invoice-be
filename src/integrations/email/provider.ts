import { UnconfiguredEmailProvider } from "./providers/unconfigured.provider.js";
import { ResendEmailProvider } from "./providers/resend.provider.js";
import { isEmailConfigured } from "../../services/email.service.js";
import type { EmailProvider } from "./types.js";

export function getEmailProvider(): EmailProvider {
  if (isEmailConfigured()) {
    return new ResendEmailProvider();
  }
  return new UnconfiguredEmailProvider();
}
