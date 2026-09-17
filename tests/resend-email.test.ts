import { beforeEach, describe, expect, it, vi } from "vitest";

const { emailsSend } = vi.hoisted(() => ({
  emailsSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: emailsSend };
  },
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html>invoice</html>"),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Invoice <invoice@send.entegrasources.com>",
    EMAIL_FROM_NAME: "Invoice",
    EMAIL_REPLY_TO: undefined,
  },
}));

import { render } from "@react-email/render";
import { ResendEmailProvider } from "../src/integrations/email/providers/resend.provider.js";
import type { InvoiceEmailPayload } from "../src/integrations/email/types.js";
import { clearResendClientCache } from "../src/services/email.service.js";

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

describe("ResendEmailProvider", () => {
  beforeEach(() => {
    emailsSend.mockReset();
    clearResendClientCache();
    vi.mocked(render).mockClear();
  });

  it("sends HTML mail with CID logo and PDF attachments via Resend", async () => {
    emailsSend.mockResolvedValue({ data: { id: "re_msg_1" }, error: null });
    const provider = new ResendEmailProvider();

    const result = await provider.sendInvoiceEmail(basePayload());

    expect(provider.isConfigured()).toBe(true);
    expect(result).toEqual({ sent: true, provider: "resend", id: "re_msg_1" });
    expect(render).toHaveBeenCalled();
    expect(emailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Invoice <invoice@send.entegrasources.com>",
        to: ["customer@example.com"],
        subject: "Invoice INV-100 from Acme Co",
        html: "<html>invoice</html>",
        attachments: [
          expect.objectContaining({
            filename: "logo.png",
            contentId: "organization-logo",
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
    emailsSend.mockResolvedValue({ data: { id: "receipt-1" }, error: null });
    const provider = new ResendEmailProvider();

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

    expect(emailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Payment received for invoice INV-100",
      }),
    );
  });

  it("maps Resend API failures to a safe EMAIL_SEND_FAILED error", async () => {
    emailsSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });
    const provider = new ResendEmailProvider();

    await expect(provider.sendInvoiceEmail(basePayload())).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
    });
  });

  it("maps API key failures to a safe authentication message", async () => {
    emailsSend.mockRejectedValue(new Error("API key is invalid"));
    const provider = new ResendEmailProvider();

    await expect(provider.sendInvoiceEmail(basePayload())).rejects.toMatchObject({
      message: "Email provider authentication failed. Check RESEND_API_KEY.",
      code: "EMAIL_SEND_FAILED",
    });
  });
});
