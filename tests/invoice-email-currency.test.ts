import { describe, expect, it } from "vitest";
import { formatInvoiceMoney, formatInvoiceQuantity, getCurrencySymbol } from "../src/integrations/email/currency.js";

describe("invoice email currency", () => {
  it("formats USD, NPR, and EUR with the invoice currency symbol", () => {
    expect(formatInvoiceMoney("1000", "USD")).toBe("$1,000.00");
    expect(formatInvoiceMoney("1000", "NPR")).toBe("रू 1,000.00");
    expect(formatInvoiceMoney("1000", "EUR")).toBe("€1,000.00");
  });

  it("falls back to the currency code when no symbol is mapped", () => {
    expect(getCurrencySymbol("XYZ")).toBe("XYZ");
    expect(formatInvoiceMoney("12.5", "XYZ")).toBe("XYZ 12.50");
  });

  it("normalizes invoice quantities", () => {
    expect(formatInvoiceQuantity("2.0000")).toBe(2);
    expect(formatInvoiceQuantity("1.5")).toBe(1.5);
  });
});
