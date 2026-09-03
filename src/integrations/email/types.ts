import type { InvoiceEmailProps } from "./templates/InvoiceSentEmail.js";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId?: string;
};

export type InvoiceEmailPayload = InvoiceEmailProps & {
  to: string;
  subject?: string;
  attachments?: EmailAttachment[];
};

export interface EmailSendResult {
  sent: boolean;
  provider: string;
  id?: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<EmailSendResult>;
}
