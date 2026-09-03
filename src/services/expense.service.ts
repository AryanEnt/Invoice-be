import { money, moneyString } from "../lib/money.js";
import { startOfUtcDay } from "../lib/date-range.js";
import { ValidationError } from "../lib/errors.js";
import {
  createExpense,
  findOrCreateExpenseCategory,
} from "../repositories/expense.repository.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import type { AuthUser } from "../types/auth.js";
import { resolveManagedOrganizationId } from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

export async function recordExpenseAccount(
  actor: AuthUser,
  input: {
    organizationId?: string;
    categoryName: string;
    amount: string;
    currency?: string;
    incurredOn: string;
    vendor?: string;
    notes?: string;
  },
) {
  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new ValidationError("Organization not found");
  }

  const amount = money(input.amount);
  if (!amount.gt(0)) {
    throw new ValidationError("Expense amount must be greater than zero");
  }

  const category = await findOrCreateExpenseCategory(organizationId, input.categoryName.trim());
  const expense = await createExpense({
    organizationId,
    categoryId: category.id,
    createdById: actor.id,
    amount: moneyString(amount),
    currency: input.currency ?? "USD",
    incurredOn: startOfUtcDay(new Date(input.incurredOn)),
    vendor: input.vendor,
    notes: input.notes,
  });

  await recordAudit({
    actorId: actor.id,
    action: "EXPENSE_RECORDED",
    entity: "Expense",
    entityId: expense.id,
    organizationId,
    metadata: { amount: moneyString(amount), category: category.name },
  });

  return {
    id: expense.id,
    organizationId: expense.organizationId,
    category: expense.category.name,
    amount: moneyString(expense.amount.toString()),
    currency: expense.currency,
    incurredOn: expense.incurredOn.toISOString(),
    vendor: expense.vendor,
    notes: expense.notes,
  };
}
