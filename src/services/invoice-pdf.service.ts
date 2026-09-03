import { isR2Configured } from "../integrations/storage/r2.client.js";
import {
  buildInvoicePdfKey,
  getObject,
  uploadObject,
} from "../integrations/storage/r2.service.js";
import { renderInvoicePdf } from "../integrations/pdf/render-invoice-pdf.js";
import { assertInvoiceAccess } from "../lib/invoice-access.js";
import { NotFoundError } from "../lib/errors.js";
import { toInvoiceView, type InvoiceRecord } from "../lib/invoice-view.js";
import { findInvoiceById, updateInvoice } from "../repositories/invoice.repository.js";
import type { AuthUser } from "../types/auth.js";
import type { InvoiceView } from "../types/invoice.js";
import { getInvoiceCompanyName } from "./invoice-settings.service.js";
import { getOrganizationLogoObject } from "./organization-logo.service.js";

export async function generateInvoicePdfBuffer(invoice: InvoiceView): Promise<Buffer> {
  const [logo, companyName] = await Promise.all([
    invoice.organizationId ? getOrganizationLogoObject(invoice.organizationId) : Promise.resolve(null),
    invoice.organizationId ? getInvoiceCompanyName(invoice.organizationId) : Promise.resolve(null),
  ]);

  return renderInvoicePdf(invoice, undefined, {
    logo: logo
      ? {
          body: logo.body,
          contentType: logo.contentType,
        }
      : null,
    companyName,
  });
}

/**
 * Prefer the historically stored PDF when present so logo changes do not alter past documents.
 * Otherwise generate a fresh PDF (with the current org logo) and optionally persist it.
 */
export async function ensureInvoicePdfStored(
  invoice: InvoiceRecord,
  options?: { persist?: boolean },
): Promise<{ buffer: Buffer; objectKey: string | null }> {
  const persist = options?.persist ?? true;

  if (invoice.pdfObjectKey && isR2Configured()) {
    const existing = await getObject(invoice.pdfObjectKey);
    if (existing) {
      return { buffer: existing.body, objectKey: invoice.pdfObjectKey };
    }
  }

  const buffer = await generateInvoicePdfBuffer(toInvoiceView(invoice));
  const objectKey = buildInvoicePdfKey(invoice.id);

  if (persist && isR2Configured()) {
    await uploadObject({
      key: objectKey,
      body: buffer,
      contentType: "application/pdf",
      cacheControl: "private, max-age=31536000",
    });

    if (invoice.pdfObjectKey !== objectKey) {
      await updateInvoice(invoice.id, { pdfObjectKey: objectKey });
    }

    return { buffer, objectKey };
  }

  return { buffer, objectKey: invoice.pdfObjectKey };
}

export async function getOrCreateInvoicePdfForAccount(
  actor: AuthUser,
  invoiceId: string,
): Promise<Buffer> {
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  // Keep historical PDFs stable once stored; drafts without a stored PDF use the current logo.
  const result = await ensureInvoicePdfStored(invoice, {
    persist: Boolean(invoice.pdfObjectKey) || invoice.status !== "DRAFT",
  });
  return result.buffer;
}
