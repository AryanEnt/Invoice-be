import { formatInvoiceMoney } from "../../email/currency.js";
import type { InvoicePdfContext, InvoicePdfTemplate } from "../types.js";

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;
const LOGO_MAX_WIDTH = 96;
const LOGO_MAX_HEIGHT = 48;

function money(value: string, currency: string): string {
  return formatInvoiceMoney(value, currency);
}

function formatDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  const bottom = 780;
  if (y + needed > bottom) {
    doc.addPage();
    return 50;
  }
  return y;
}

function drawLogo(
  doc: PDFKit.PDFDocument,
  logo: NonNullable<InvoicePdfContext["logo"]>,
  x: number,
  y: number,
): void {
  try {
    doc.image(logo.body, x, y, {
      fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT],
    });
  } catch {
    // Fall back to company name text when the image cannot be embedded (e.g. SVG).
  }
}

export const standardInvoiceTemplate: InvoicePdfTemplate = {
  id: "standard",
  name: "Standard invoice",
  render(doc, context: InvoicePdfContext) {
    const { invoice, logo, companyName: brandedName } = context;
    let y = 50;
    const companyName = brandedName?.trim() || invoice.organization?.name || "Company";

    if (logo?.body?.length) {
      drawLogo(doc, logo, PAGE_LEFT, y);
      doc.fillColor("#0f172a").fontSize(16).text(companyName, PAGE_LEFT + LOGO_MAX_WIDTH + 16, y + 4, {
        width: 220,
      });
      doc.fontSize(10).fillColor("#475569").text("Invoice", PAGE_LEFT + LOGO_MAX_WIDTH + 16, y + 26);
    } else {
      doc.fillColor("#0f172a").fontSize(20).text(companyName, PAGE_LEFT, y);
      doc.fontSize(10).fillColor("#475569").text("Invoice", PAGE_LEFT, y + 26);
    }

    doc.fontSize(16).fillColor("#0f172a").text(invoice.invoiceNumber, PAGE_RIGHT - 200, y, {
      align: "right",
      width: 200,
    });
    doc.fontSize(10).fillColor("#475569").text(`Status: ${invoice.status}`, PAGE_RIGHT - 200, y + 22, {
      align: "right",
      width: 200,
    });
    doc.text(`Payment: ${invoice.paymentStatus}`, PAGE_RIGHT - 200, y + 36, {
      align: "right",
      width: 200,
    });

    y = 130;
    doc.fillColor("#0f172a").fontSize(11).text("Bill to", PAGE_LEFT, y);
    doc.fontSize(10).fillColor("#334155");
    doc.text(invoice.customer.name, PAGE_LEFT, y + 16);
    if (invoice.customer.company) {
      doc.text(invoice.customer.company, PAGE_LEFT, y + 30);
    }
    if (invoice.billingAddress) {
      const address = [
        invoice.billingAddress.line1,
        invoice.billingAddress.line2,
        [invoice.billingAddress.city, invoice.billingAddress.region, invoice.billingAddress.postalCode]
          .filter(Boolean)
          .join(", "),
        invoice.billingAddress.country,
      ]
        .filter(Boolean)
        .join("\n");
      doc.text(address, PAGE_LEFT, y + 44, { width: 240 });
    }

    doc.fillColor("#0f172a").text(`Invoice date: ${formatDate(invoice.invoiceDate)}`, PAGE_RIGHT - 200, y, {
      align: "right",
      width: 200,
    });
    doc.text(`Due date: ${formatDate(invoice.dueDate)}`, PAGE_RIGHT - 200, y + 16, {
      align: "right",
      width: 200,
    });
    doc.text(`Currency: ${invoice.currency}`, PAGE_RIGHT - 200, y + 32, {
      align: "right",
      width: 200,
    });

    y = 240;
    const columns = {
      description: { x: PAGE_LEFT, width: 250 },
      qty: { x: 310, width: 45 },
      unitPrice: { x: 360, width: 85 },
      amount: { x: 450, width: PAGE_RIGHT - 450 },
    };

    y = ensureSpace(doc, y, 30);
    doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 22).fill("#f1f5f9");
    doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold");
    doc.text("Description", columns.description.x + 4, y + 6, { width: columns.description.width });
    doc.text("Qty", columns.qty.x, y + 6, { width: columns.qty.width, align: "right" });
    doc.text("Unit Price", columns.unitPrice.x, y + 6, { width: columns.unitPrice.width, align: "right" });
    doc.text("Amount", columns.amount.x, y + 6, { width: columns.amount.width, align: "right" });

    y += 28;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");

    for (const item of invoice.items) {
      const descriptionHeight = doc.heightOfString(item.description, {
        width: columns.description.width - 8,
      });
      const rowHeight = Math.max(20, descriptionHeight + 8);

      y = ensureSpace(doc, y, rowHeight + 4);

      doc.text(item.description, columns.description.x + 4, y, {
        width: columns.description.width - 8,
      });
      doc.text(Number(item.quantity).toString(), columns.qty.x, y, {
        width: columns.qty.width,
        align: "right",
      });
      doc.text(money(item.unitPrice, invoice.currency), columns.unitPrice.x, y, {
        width: columns.unitPrice.width,
        align: "right",
      });
      doc.text(money(item.lineTotal, invoice.currency), columns.amount.x, y, {
        width: columns.amount.width,
        align: "right",
      });

      y += rowHeight;
    }

    y = ensureSpace(doc, y + 16, 90);

    const summaryLabelX = 380;
    const summaryValueX = 450;
    const summaryValueWidth = PAGE_RIGHT - summaryValueX;

    function drawSummaryRow(label: string, value: string, size = 10, bold = false): void {
      doc.fontSize(size).fillColor("#0f172a");
      if (bold) {
        doc.font("Helvetica-Bold");
      } else {
        doc.font("Helvetica");
      }
      doc.text(label, summaryLabelX, y, { width: 65 });
      doc.text(value, summaryValueX, y, { width: summaryValueWidth, align: "right" });
      y += bold ? 22 : 16;
    }

    doc.moveTo(summaryLabelX, y - 4).lineTo(PAGE_RIGHT, y - 4).strokeColor("#e2e8f0").stroke();
    drawSummaryRow("Subtotal", money(invoice.subtotal, invoice.currency));
    drawSummaryRow("Total", money(invoice.total, invoice.currency), 12, true);
    drawSummaryRow("Amount paid", money(invoice.amountPaid, invoice.currency));
    drawSummaryRow("Balance due", money(invoice.balanceDue, invoice.currency));

    y += 12;
    y = ensureSpace(doc, y, 60);

    if (invoice.notes) {
      doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text("Notes", PAGE_LEFT, y);
      const notesHeight = doc.heightOfString(invoice.notes, { width: CONTENT_WIDTH });
      doc.fontSize(10).fillColor("#334155").text(invoice.notes, PAGE_LEFT, y + 16, { width: CONTENT_WIDTH });
      y += notesHeight + 28;
    }

    if (invoice.terms) {
      y = ensureSpace(doc, y, 40);
      doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text("Terms", PAGE_LEFT, y);
      doc.fontSize(10).fillColor("#334155").text(invoice.terms, PAGE_LEFT, y + 16, { width: CONTENT_WIDTH });
    }
  },
};

export function getInvoicePdfTemplate(templateId?: string): InvoicePdfTemplate {
  if (!templateId || templateId === standardInvoiceTemplate.id) {
    return standardInvoiceTemplate;
  }
  return standardInvoiceTemplate;
}
