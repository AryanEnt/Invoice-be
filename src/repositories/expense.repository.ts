import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface ExpenseRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  createdById: string;
  amount: { toString(): string };
  currency: string;
  incurredOn: Date;
  vendor: string | null;
  notes: string | null;
  category: { id: string; name: string };
}

export async function findOrCreateExpenseCategory(
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const existing = await prisma.expenseCategory.findUnique({
    where: { organizationId_name: { organizationId, name } },
    select: { id: true, name: true },
  });
  if (existing) {
    return existing;
  }
  return prisma.expenseCategory.create({
    data: { organizationId, name },
    select: { id: true, name: true },
  });
}

export async function createExpense(data: {
  organizationId: string;
  categoryId: string;
  createdById: string;
  amount: string;
  currency: string;
  incurredOn: Date;
  vendor?: string | null;
  notes?: string | null;
}): Promise<ExpenseRecord> {
  return prisma.expense.create({
    data: {
      organizationId: data.organizationId,
      categoryId: data.categoryId,
      createdById: data.createdById,
      amount: data.amount,
      currency: data.currency,
      incurredOn: data.incurredOn,
      vendor: data.vendor ?? null,
      notes: data.notes ?? null,
    },
    include: { category: { select: { id: true, name: true } } },
  });
}

export async function listExpenses(query: {
  organizationId?: string;
  createdById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}): Promise<{ items: ExpenseRecord[]; total: number }> {
  const where: Prisma.ExpenseWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          incurredOn: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lt: query.dateTo } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { incurredOn: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return { items, total };
}
