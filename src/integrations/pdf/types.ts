import type { InvoiceView } from "../../types/invoice.js";

export interface InvoicePdfLogo {
  body: Buffer;
  contentType?: string;
}

export interface InvoicePdfRenderOptions {
  logo?: InvoicePdfLogo | null;
  companyName?: string | null;
}

export interface InvoicePdfContext {
  invoice: InvoiceView;
  logo?: InvoicePdfLogo | null;
  companyName?: string | null;
}

export interface InvoicePdfTemplate {
  id: string;
  name: string;
  render(doc: PDFKit.PDFDocument, context: InvoicePdfContext): void;
}
