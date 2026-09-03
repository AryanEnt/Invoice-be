import { describe, expect, it } from "vitest";
import { PaymentProviderFactory } from "../src/integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../src/integrations/payments/types.js";
import { NotImplementedError } from "../src/lib/errors.js";

const sessionInput = {
  invoiceId: "11111111-1111-1111-1111-111111111111",
  organizationId: "22222222-2222-2222-2222-222222222222",
  customerId: "33333333-3333-3333-3333-333333333333",
  amount: "25.0000",
  currency: "USD",
};

describe("payment providers", () => {
  it("resolves MANUAL and records a local completed session", async () => {
    const provider = PaymentProviderFactory.resolve(PaymentProviderName.MANUAL);
    expect(provider.implemented).toBe(true);
    const session = await provider.createPaymentSession(sessionInput);
    expect(session.provider).toBe("MANUAL");
    expect(session.status).toBe("COMPLETED");
    expect(session.providerTransactionId.length).toBeGreaterThan(0);
  });

  it("does not pretend Stripe is implemented", async () => {
    const provider = PaymentProviderFactory.resolve(PaymentProviderName.STRIPE);
    expect(provider.implemented).toBe(false);
    await expect(provider.createPaymentSession(sessionInput)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(
      provider.verifyPayment({ providerTransactionId: "pi_x" }),
    ).rejects.toBeInstanceOf(NotImplementedError);
    await expect(
      provider.refundPayment({
        providerTransactionId: "pi_x",
        amount: "1.0000",
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
    await expect(provider.handleWebhook({ headers: {}, rawBody: "{}" })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("does not pretend PayPal is implemented", async () => {
    const provider = PaymentProviderFactory.resolve(PaymentProviderName.PAYPAL);
    expect(provider.implemented).toBe(false);
    await expect(provider.createPaymentSession(sessionInput)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(
      provider.verifyPayment({ providerTransactionId: "PAYID-X" }),
    ).rejects.toBeInstanceOf(NotImplementedError);
    await expect(provider.handleWebhook({ headers: {}, rawBody: "{}" })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});
