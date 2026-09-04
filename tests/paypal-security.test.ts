import { describe, expect, it } from "vitest";
import { hashOAuthState, oauthStatesMatch } from "../src/integrations/payments/paypal/oauth-state.js";
import { isPaypalCertUrl } from "../src/integrations/payments/paypal/client.js";
import { isPayPalSupportedCurrency, PAYPAL_UNSUPPORTED_CURRENCY_MESSAGE } from "../src/integrations/payments/paypal/currencies.js";
import { decryptSecret, encryptSecret } from "../src/lib/secret-box.js";
import { ForbiddenError } from "../src/lib/errors.js";
import { startPayPalConnect } from "../src/services/paypal-connect.service.js";

describe("PayPal security helpers", () => {
  it("hashes OAuth state so the raw value is not stored", () => {
    const state = "abc123-state-value";
    const hashed = hashOAuthState(state);
    expect(hashed).not.toBe(state);
    expect(hashed).toHaveLength(64);
    expect(oauthStatesMatch(hashed, hashOAuthState(state))).toBe(true);
  });

  it("rejects non-PayPal certificate URLs", () => {
    expect(isPaypalCertUrl("https://api.sandbox.paypal.com/webcerts/foo")).toBe(true);
    expect(isPaypalCertUrl("https://evil.example/cert")).toBe(false);
    expect(isPaypalCertUrl("http://api.sandbox.paypal.com/webcerts/foo")).toBe(false);
  });

  it("does not treat NPR as a PayPal-supported currency", () => {
    expect(isPayPalSupportedCurrency("NPR")).toBe(false);
    expect(isPayPalSupportedCurrency("USD")).toBe(true);
    expect(PAYPAL_UNSUPPORTED_CURRENCY_MESSAGE).toContain("currency");
  });

  it("encrypts and decrypts secrets without exposing plaintext", () => {
    const secret = "refresh-token-value";
    const sealed = encryptSecret(secret);
    expect(sealed).not.toContain(secret);
    expect(decryptSecret(sealed)).toBe(secret);
  });

  it("rejects non-Super Admin PayPal connect", async () => {
    await expect(
      startPayPalConnect({
        id: "user-1",
        email: "admin@example.com",
        firstName: "A",
        lastName: "Dmin",
        role: "ADMIN",
        status: "ACTIVE",
        organizationId: "org-1",
        administratorId: null,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
