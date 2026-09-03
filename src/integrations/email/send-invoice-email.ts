import { env } from "../../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../../lib/errors.js";
import { invoiceShareUrl } from "../../lib/invoice-share.js";
import type { InvoiceRecord } from "../../lib/invoice-view.js";
import { getInvoiceCompanyName } from "../../services/invoice-settings.service.js";
import { getOrganizationLogoObject } from "../../services/organization-logo.service.js";
import { ensureInvoicePdfStored } from "../../services/invoice-pdf.service.js";
import { formatInvoiceMoney, formatInvoiceQuantity, getCurrencySymbol } from "./currency.js";
import { getEmailProvider } from "./provider.js";
import type { EmailAttachment, EmailSendResult, InvoiceEmailPayload } from "./types.js";

const LOGO_CONTENT_ID = "organization-logo";

function formatEmailDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

function extensionForContentType(contentType?: string): string {
  switch (contentType?.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

export async function buildInvoiceEmailPayload(
  invoice: InvoiceRecord,
): Promise<InvoiceEmailPayload> {
  const recipient = invoice.customer.email?.trim();
  if (!recipient) {
    throw new ValidationError("This customer does not have an email address");
  }

  if (!invoice.shareToken) {
    throw new ValidationError("This invoice does not have a shareable link yet");
  }

  const currencyCode = invoice.currency;
  const items = [...invoice.items]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      description: item.description,
      quantity: formatInvoiceQuantity(item.quantity.toString()),
      unitPrice: formatInvoiceMoney(item.unitPrice.toString(), currencyCode),
      amount: formatInvoiceMoney(item.lineTotal.toString(), currencyCode),
    }));

  const attachments: EmailAttachment[] = [];
  let companyLogoUrl: string | undefined;

  const [logo, brandedName] = await Promise.all([
    invoice.organizationId ? getOrganizationLogoObject(invoice.organizationId) : Promise.resolve(null),
    invoice.organizationId ? getInvoiceCompanyName(invoice.organizationId) : Promise.resolve(null),
  ]);

  if (logo?.body.length) {
    const contentType = logo.contentType ?? "image/png";
    // Skip SVG for email CID — many clients reject it; fall back to company name only.
    if (contentType !== "image/svg+xml") {
      attachments.push({
        filename: `logo.${extensionForContentType(contentType)}`,
        content: logo.body,
        contentType,
        contentId: LOGO_CONTENT_ID,
      });
      companyLogoUrl = `cid:${LOGO_CONTENT_ID}`;
    }
  }

  const pdf = await ensureInvoicePdfStored(invoice);
  attachments.push({
    filename: `${invoice.invoiceNumber}.pdf`,
    content: pdf.buffer,
    contentType: "application/pdf",
  });

  return {
    to: recipient,
    companyName: brandedName ?? invoice.organization?.name ?? env.EMAIL_FROM_NAME ?? "Company",
    companyLogoUrl,
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatEmailDate(invoice.invoiceDate),
    dueDate: formatEmailDate(invoice.dueDate),
    currencyCode,
    currencySymbol: getCurrencySymbol(currencyCode),
    items,
    subtotal: formatInvoiceMoney(invoice.subtotal.toString(), currencyCode),
    total: formatInvoiceMoney(invoice.total.toString(), currencyCode),
    invoiceUrl: invoiceShareUrl(invoice.shareToken),
    showPaymentButton: false,
    attachments,
  };
}

export async function sendInvoiceEmail(invoice: InvoiceRecord): Promise<EmailSendResult> {
  const mailer = getEmailProvider();
  if (!mailer.isConfigured()) {
    throw new ServiceUnavailableError("Email sending is not configured yet.", "EMAIL_NOT_CONFIGURED");
  }

  return mailer.sendInvoiceEmail(await buildInvoiceEmailPayload(invoice));
}
