/** PayPal Checkout supported currencies. NPR and others are not accepted. */
export const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  "AUD",
  "BRL",
  "CAD",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "HKD",
  "HUF",
  "ILS",
  "INR",
  "JPY",
  "MYR",
  "MXN",
  "TWD",
  "NZD",
  "NOK",
  "PHP",
  "PLN",
  "GBP",
  "SGD",
  "SEK",
  "CHF",
  "THB",
  "USD",
]);

const ZERO_DECIMAL_CURRENCIES = new Set(["HUF", "JPY", "TWD"]);

export const PAYPAL_UNSUPPORTED_CURRENCY_MESSAGE =
  "PayPal is not available for this invoice currency. Please contact the billing team for another payment method.";

export function isPayPalSupportedCurrency(currency: string): boolean {
  return PAYPAL_SUPPORTED_CURRENCIES.has(currency.trim().toUpperCase());
}

export function paypalAmountFractionDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.trim().toUpperCase()) ? 0 : 2;
}
