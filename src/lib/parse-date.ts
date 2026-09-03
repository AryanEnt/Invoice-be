import { ValidationError } from "./errors.js";

export function parseDateValue(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} must be a valid date`);
  }
  return date;
}

export function assertDueDateNotBeforeInvoiceDate(invoiceDate: Date, dueDate: Date): void {
  if (dueDate.getTime() < invoiceDate.getTime()) {
    throw new ValidationError("Due date cannot be before invoice date");
  }
}
