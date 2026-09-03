import { money, moneyString, roundMoney } from "./money.js";

export interface InvoiceLineInput {
  quantity: string;
  unitPrice: string;
}

export interface InvoiceLineTotals {
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface InvoiceTotals {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  lines: InvoiceLineTotals[];
}

export function calculateInvoiceLine(input: InvoiceLineInput): InvoiceLineTotals {
  const quantity = money(input.quantity);
  const unitPrice = money(input.unitPrice);

  if (quantity.lte(0)) {
    throw new Error("Quantity must be greater than 0");
  }
  if (unitPrice.lt(0)) {
    throw new Error("Unit price cannot be negative");
  }

  const lineSubtotal = roundMoney(quantity.times(unitPrice));

  return {
    lineSubtotal: moneyString(lineSubtotal),
    discountAmount: "0.0000",
    taxAmount: "0.0000",
    lineTotal: moneyString(lineSubtotal),
  };
}

export function calculateInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  if (lines.length === 0) {
    throw new Error("An invoice must include at least one item");
  }

  const calculated = lines.map(calculateInvoiceLine);
  const subtotal = calculated.reduce((sum, line) => sum.plus(line.lineSubtotal), money(0));
  const subtotalValue = moneyString(subtotal);

  return {
    subtotal: subtotalValue,
    discountAmount: "0.0000",
    taxAmount: "0.0000",
    total: subtotalValue,
    lines: calculated,
  };
}
