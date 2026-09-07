import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { render } from "@react-email/render";
import { createElement } from "react";
import { env } from "../../../config/env.js";
import { ServiceUnavailableError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import { InvoiceSentEmail } from "../templates/InvoiceSentEmail.js";
import type { EmailProvider, EmailSendResult, InvoiceEmailPayload } from "../types.js";

function resolveFromAddress(displayName?: string | null): string | null {
  const from = env.EMAIL_FROM?.trim();
  if (!from) {
    return null;
  }
  if (from.includes("<") && from.includes(">")) {
    return from;
  }
  const name = displayName?.trim() || env.EMAIL_FROM_NAME?.trim();
  return name ? `${name} <${from}>` : from;
}

function smtpConfigured(): boolean {
  return Boolean(
    env.SMTP_HOST?.trim() &&
      env.SMTP_PORT &&
      env.SMTP_USER?.trim() &&
      env.SMTP_PASSWORD &&
      resolveFromAddress(),
  );
}

function smtpErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown email error";
  const normalized = message.toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  if (
    code === "EAUTH" ||
    normalized.includes("invalid login") ||
    normalized.includes("authentication failed")
  ) {
    return "Email server authentication failed. Check SMTP username and password.";
  }

  if (
    code === "ECONNECTION" ||
    code === "ESOCKET" ||
    code === "ETIMEDOUT" ||
    normalized.includes("connect etimedout") ||
    normalized.includes("connect econnrefused")
  ) {
    return "Could not connect to the email server. Check SMTP host and port.";
  }

  if (
    normalized.includes("recipient") ||
    normalized.includes("mailbox") ||
    normalized.includes("invalid address")
  ) {
    return "The recipient email address was rejected by the email server.";
  }

  return env.NODE_ENV === "production"
    ? "We couldn't send this invoice email right now. Please try again later."
    : message.slice(0, 500);
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });

    return this.transporter;
  }

  isConfigured(): boolean {
    return smtpConfigured();
  }

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<EmailSendResult> {
    const from = resolveFromAddress(payload.companyName);
    if (!from || !this.isConfigured()) {
      throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
    }

    try {
      const html = await render(
        createElement(InvoiceSentEmail, {
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
          showPaymentButton: payload.showPaymentButton,
          paymentUrl: payload.paymentUrl,
          paymentReceipt: payload.paymentReceipt,
        }),
      );

      const info = await this.getTransporter().sendMail({
        from,
        to: payload.to,
        subject: payload.subject ?? `Invoice ${payload.invoiceNumber} from ${payload.companyName}`,
        html,
        attachments: payload.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          cid: attachment.contentId,
        })),
      });

      return {
        sent: true,
        provider: this.name,
        id: typeof info.messageId === "string" ? info.messageId : undefined,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      logger.error("SMTP invoice email failed", {
        invoiceNumber: payload.invoiceNumber,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        message: error instanceof Error ? error.message : "Unknown error",
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code ?? "")
            : undefined,
      });
      throw new ServiceUnavailableError(smtpErrorMessage(error), "EMAIL_SEND_FAILED");
    }
  }
}
