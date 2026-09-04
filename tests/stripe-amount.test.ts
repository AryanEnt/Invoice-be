import { describe, expect, it } from "vitest";
import { formatStripeAmount } from "../src/integrations/payments/stripe/client.js";

describe("formatStripeAmount", () => {
  it("converts decimal currencies to cents", () => {
    expect(formatStripeAmount("10.00", "USD")).toBe(1000);
    expect(formatStripeAmount("19.99", "EUR")).toBe(1999);
  });

  it("keeps zero-decimal currencies as whole units", () => {
    expect(formatStripeAmount("1000", "JPY")).toBe(1000);
  });
});
