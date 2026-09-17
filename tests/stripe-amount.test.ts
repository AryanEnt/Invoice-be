import { describe, expect, it } from "vitest";
import { formatStripeAmount, parseStripeAmount } from "../src/integrations/payments/stripe/client.js";

describe("formatStripeAmount", () => {
  it("converts decimal currencies to cents", () => {
    expect(formatStripeAmount("10.00", "USD")).toBe(1000);
    expect(formatStripeAmount("19.99", "EUR")).toBe(1999);
  });

  it("keeps zero-decimal currencies as whole units", () => {
    expect(formatStripeAmount("1000", "JPY")).toBe(1000);
  });
});

describe("parseStripeAmount", () => {
  it("converts cents back to major units", () => {
    expect(parseStripeAmount(1000, "USD")).toBe("10.0000");
  });

  it("keeps zero-decimal currencies as whole units", () => {
    expect(parseStripeAmount(1000, "JPY")).toBe("1000.0000");
  });
});
