import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMailFn = vi.fn();
  const createTransportFn = vi.fn(() => ({ sendMail: sendMailFn }));
  return { sendMail: sendMailFn, createTransport: createTransportFn };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html>invoice</html>"),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    SMTP_HOST: "smtp.spacemail.com",
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    SMTP_USER: "info@invoicelink.com",
    SMTP_PASSWORD: "secret",
    EMAIL_FROM: "info@invoicelink.com",
    EMAIL_FROM_NAME: "InvoiceHub",
  },
}));

import { render } from "@react-email/render";
import { SmtpEmailProvider } from "../src/integrations/email/providers/smtp.provider.js";
import type { InvoiceEmailPayload } from "../src/integrations/email/types.js";

function basePayload(overrides: Partial<InvoiceEmailPayload> = {}): InvoiceEmailPayload {
  return {
    to: "customer@example.com",
    companyName: "Acme Co",
    companyLogoUrl: "cid:organization-logo",
    customerName: "Jane Buyer",
    invoiceNumber: "INV-100",
    invoiceDate: "Sep 1, 2026",
    dueDate: "Sep 15, 2026",
    currencyCode: "USD",
    currencySymbol: "$",
    items: [
      {
        description: "Consulting",
        quantity: 1,
        unitPrice: "$100.00",
        amount: "$100.00",
      },
    ],
    subtotal: "$100.00",
    total: "$100.00",
    invoiceUrl: "http://localhost:3000/invoice/token",
    showPaymentButton: true,
    paymentUrl: "http://localhost:3000/invoice/token",
    attachments: [
      {
        filename: "logo.png",
        content: Buffer.from("logo"),
        contentType: "image/png",
        contentId: "organization-logo",
      },
      {
        filename: "INV-100.pdf",
        content: Buffer.from("%PDF"),
        contentType: "application/pdf",
      },
    ],
    ...overrides,
  };
}

describe("SmtpEmailProvider", () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
    vi.mocked(render).mockClear();
  });

  it("sends HTML mail with CID logo and PDF attachments", async () => {
    sendMail.mockResolvedValue({ messageId: "smtp-message-1" });
    const provider = new SmtpEmailProvider();

    const result = await provider.sendInvoiceEmail(basePayload());

    expect(provider.isConfigured()).toBe(true);
    expect(result).toEqual({ sent: true, provider: "smtp", id: "smtp-message-1" });
    expect(render).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Acme Co <info@invoicelink.com>",
        to: "customer@example.com",
        subject: "Invoice INV-100 from Acme Co",
        html: "<html>invoice</html>",
        attachments: [
          expect.objectContaining({
            filename: "logo.png",
            cid: "organization-logo",
            contentType: "image/png",
          }),
          expect.objectContaining({
            filename: "INV-100.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
    );
  });

  it("uses custom subject for payment receipts", async () => {
    sendMail.mockResolvedValue({ messageId: "receipt-1" });
    const provider = new SmtpEmailProvider();

    await provider.sendInvoiceEmail(
      basePayload({
        subject: "Payment received for invoice INV-100",
        showPaymentButton: false,
        paymentUrl: undefined,
        paymentReceipt: {
          method: "PayPal",
          amount: "100.00",
          currency: "USD",
          paidAt: "2026-09-07",
          transactionId: "CAP-1",
        },
      }),
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Payment received for invoice INV-100",
      }),
    );
  });

  it("maps authentication failures to a safe error", async () => {
    const authError = Object.assign(new Error("Invalid login"), { code: "EAUTH" });
    sendMail.mockRejectedValue(authError);
    const provider = new SmtpEmailProvider();

    await expect(provider.sendInvoiceEmail(basePayload())).rejects.toMatchObject({
      message: "Email server authentication failed. Check SMTP username and password.",
      code: "EMAIL_SEND_FAILED",
    });
  });

  it("maps connection failures to a safe error", async () => {
    const connError = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    sendMail.mockRejectedValue(connError);
    const provider = new SmtpEmailProvider();

    await expect(provider.sendInvoiceEmail(basePayload())).rejects.toMatchObject({
      message: "Could not connect to the email server. Check SMTP host and port.",
      code: "EMAIL_SEND_FAILED",
    });
  });
});
