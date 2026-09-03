import { Prisma } from "@prisma/client";

export const MONEY_SCALE = 4;

Prisma.Decimal.set({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});

export type MoneyValue = Prisma.Decimal.Value;

export function money(value: MoneyValue): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function moneyString(value: MoneyValue): string {
  return roundMoney(money(value)).toFixed(MONEY_SCALE);
}

export function toMoneyNumber(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(moneyString(value.toString()));
}
