import { Resend } from "resend";
import { env } from "../../../config/env.js";
import { ServiceUnavailableError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import { InvoiceSentEmail } from "../templates/InvoiceSentEmail.js";
import type { EmailProvider, EmailSendResult, InvoiceEmailPayload } from "../types.js";

function resolveFromAddress(): string | null {
  const from = env.EMAIL_FROM?.trim();
  if (!from) {
    return null;
  }
  if (from.includes("<") && from.includes(">")) {
    return from;
  }
  const name = env.EMAIL_FROM_NAME?.trim();
  return name ? `${name} <${from}>` : from;
}

function resendErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("domain is not verified")) {
    return "The sender domain is not verified in Resend. Verify your domain at resend.com/domains, or use onboarding@resend.dev for local testing.";
  }

  if (normalized.includes("only send testing emails to your own email")) {
    return "Resend test mode only allows sending to your Resend account email. Use that address as the customer email, or verify your domain.";
  }

  if (normalized.includes("invalid") && normalized.includes("from")) {
    return "The configured sender address is not allowed by Resend. Check EMAIL_FROM in your environment settings.";
  }

  return env.NODE_ENV === "production"
    ? "We couldn't send this invoice email right now. Please try again later."
    : message;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  isConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY && resolveFromAddress());
  }

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<EmailSendResult> {
    const from = resolveFromAddress();
    if (!from) {
      throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
    }

    try {
      const { data, error } = await this.client.emails.send({
        from,
        to: payload.to,
        subject: payload.subject ?? `Invoice ${payload.invoiceNumber} from ${payload.companyName}`,
        react: InvoiceSentEmail({
          companyName: payload.companyName,
          companyLogoUrl: payload.companyLogoUrl,
          customerName: payload.customerName,
          invoiceNumber: payload.invoiceNumber,
          invoiceDate: payload.invoiceDate,
          dueDate: payload.dueDate,
          currencyCode: payload.currencyCode,
          currencySymbol: payload.currencySymbol,
          items: payload.items,
          subtotal: payload.subtotal,
          total: payload.total,
          invoiceUrl: payload.invoiceUrl,
          companyEmail: payload.companyEmail,
          companyPhone: payload.companyPhone,
          showPaymentButton: false,
          paymentUrl: payload.paymentUrl,
        }),
        attachments: payload.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          contentId: attachment.contentId,
          content_id: attachment.contentId,
        })),
      });

      if (error) {
        logger.error("Resend rejected invoice email", {
          invoiceNumber: payload.invoiceNumber,
          message: error.message,
        });
        throw new ServiceUnavailableError(
          resendErrorMessage(error.message),
          "EMAIL_SEND_FAILED",
        );
      }

      return {
        sent: true,
        provider: this.name,
        id: data?.id,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error("Resend invoice email failed", {
        invoiceNumber: payload.invoiceNumber,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw new ServiceUnavailableError(
        "We couldn't send this invoice email right now. Please try again later.",
        "EMAIL_SEND_FAILED",
      );
    }
  }
}
