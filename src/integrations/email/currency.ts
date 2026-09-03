const CURRENCY_SYMBOLS: Record<string, { symbol: string; spaced: boolean }> = {
  USD: { symbol: "$", spaced: false },
  EUR: { symbol: "€", spaced: false },
  GBP: { symbol: "£", spaced: false },
  NPR: { symbol: "रू", spaced: true },
  INR: { symbol: "₹", spaced: false },
  JPY: { symbol: "¥", spaced: false },
  CNY: { symbol: "¥", spaced: false },
  AUD: { symbol: "A$", spaced: false },
  CAD: { symbol: "C$", spaced: false },
  CHF: { symbol: "CHF", spaced: true },
  SGD: { symbol: "S$", spaced: false },
  HKD: { symbol: "HK$", spaced: false },
  NZD: { symbol: "NZ$", spaced: false },
  AED: { symbol: "د.إ", spaced: true },
  SAR: { symbol: "﷼", spaced: true },
};

export function getCurrencySymbol(currencyCode: string): string {
  const code = currencyCode.trim().toUpperCase();
  return CURRENCY_SYMBOLS[code]?.symbol ?? code;
}

export function formatInvoiceMoney(value: string, currencyCode: string): string {
  const amount = Number(value);
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  const code = currencyCode.trim().toUpperCase();
  const mapped = CURRENCY_SYMBOLS[code];
  if (!mapped) {
    return `${code} ${formatted}`;
  }
  return mapped.spaced ? `${mapped.symbol} ${formatted}` : `${mapped.symbol}${formatted}`;
}

export function formatInvoiceQuantity(value: string | number): number {
  const quantity = typeof value === "number" ? value : Number(value);
  return Number.isFinite(quantity) ? quantity : 0;
}
