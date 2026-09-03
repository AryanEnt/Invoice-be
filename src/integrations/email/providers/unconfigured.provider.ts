import { ServiceUnavailableError } from "../../../lib/errors.js";
import type { EmailProvider, EmailSendResult, InvoiceEmailPayload } from "../types.js";

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "unconfigured";

  isConfigured(): boolean {
    return false;
  }

  sendInvoiceEmail(_payload: InvoiceEmailPayload): Promise<EmailSendResult> {
    throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
  }
}
