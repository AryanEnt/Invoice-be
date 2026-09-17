import { render } from "@react-email/render";
import { createElement } from "react";
import { ServiceUnavailableError } from "../../../lib/errors.js";
import { isEmailConfigured, sendEmail } from "../../../services/email.service.js";
import { InvoiceSentEmail } from "../templates/InvoiceSentEmail.js";
import type { EmailProvider, EmailSendResult, InvoiceEmailPayload } from "../types.js";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  isConfigured(): boolean {
    return isEmailConfigured();
  }

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
    }

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

    const result = await sendEmail({
      to: payload.to,
      subject: payload.subject ?? `Invoice ${payload.invoiceNumber} from ${payload.companyName}`,
      html,
      replyTo: payload.companyEmail?.trim() || undefined,
      attachments: payload.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        contentId: attachment.contentId,
      })),
    });

    return {
      sent: result.sent,
      provider: this.name,
      id: result.id,
    };
  }
}
