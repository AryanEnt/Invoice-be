import type { CatalogKind, InvoiceStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { sendInvoiceEmail } from "../integrations/email/send-invoice-email.js";
import { assertInvoiceAccess } from "../lib/invoice-access.js";
import { generateInvoiceShareToken, invoiceShareUrl } from "../lib/invoice-share.js";
import { toPublicInvoiceView, type PublicInvoiceView } from "../lib/invoice-public-view.js";
import { assertCustomerScope, resolveInvoiceUserScope } from "../lib/admin-scope.js";
import { calculateInvoiceTotals } from "../lib/invoice-calc.js";
import {
  canCancelInvoice,
  canDeleteInvoice,
  canEditInvoice,
} from "../lib/invoice-status.js";
import { toInvoiceView } from "../lib/invoice-view.js";
import { moneyString } from "../lib/money.js";
import { assertDueDateNotBeforeInvoiceDate, parseDateValue } from "../lib/parse-date.js";
import { findCustomerById } from "../repositories/customer.repository.js";
import {
  createInvoice,
  countInvoiceSummary,
  deleteInvoice,
  findInvoiceById,
  findInvoiceByOrganizationAndNumber,
  findInvoiceByShareToken,
  findLatestInvoiceNumber,
  listInvoices,
  updateInvoice,
} from "../repositories/invoice.repository.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import { findProductById } from "../repositories/product.repository.js";
import { findMemberById, findAdminById, listMemberIdsByAdministrator } from "../repositories/user.repository.js";
import type { AddressInput, AuthUser } from "../types/auth.js";
import type { InvoiceView } from "../types/invoice.js";
import {
  resolveManagedOrganizationId,
  scopedTenantOrganizationId,
} from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";
import { getInvoiceCompanyName } from "./invoice-settings.service.js";
import { getOrganizationLogoUrl } from "./organization-logo.service.js";
import { recordManualPayment } from "./payment.service.js";

interface InvoiceItemInput {
  productId?: string;
  description?: string;
  quantity: string;
  unitPrice?: string;
  discount?: string;
  taxRate?: string;
}

async function withOrganizationLogo(
  view: InvoiceView,
  organizationId: string,
): Promise<InvoiceView> {
  if (!view.organization) {
    return view;
  }
  const logoUrl = await getOrganizationLogoUrl(organizationId, {
    expiresInSeconds: 60 * 30,
  });
  return {
    ...view,
    organization: {
      ...view.organization,
      logoUrl,
    },
  };
}

async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `INV-${year}-`;
  const latest = await findLatestInvoiceNumber(organizationId, prefix);
  const current = latest ? Number(latest.slice(prefix.length)) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function snapshotItems(
  organizationId: string,
  items: InvoiceItemInput[],
): Promise<{
  totals: ReturnType<typeof calculateInvoiceTotals>;
  records: Array<{
    productId: string | null;
    catalogKind: CatalogKind | null;
    sku: string | null;
    unit: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string | null;
    taxAmount: string;
    lineTotal: string;
    sortOrder: number;
  }>;
}> {
  const prepared = [];

  for (const [index, item] of items.entries()) {
    let description = item.description?.trim() ?? "";
    let unitPrice = item.unitPrice;
    let productId: string | null = null;
    let catalogKind: CatalogKind | null = null;
    let sku: string | null = null;
    let unit: string | null = null;

    if (item.productId) {
      const product = await findProductById(item.productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ForbiddenError("You cannot add a catalog item from another organization");
      }
      productId = product.id;
      catalogKind = product.kind;
      sku = product.sku;
      unit = product.unit;
      description = description || product.name;
      unitPrice = unitPrice ?? product.unitPrice.toString();
    }

    if (!description) {
      throw new ValidationError("Each invoice item needs a description");
    }
    if (!unitPrice) {
      throw new ValidationError("Each invoice item needs a unit price");
    }

    prepared.push({
      productId,
      catalogKind,
      sku,
      unit,
      description,
      quantity: item.quantity,
      unitPrice,
      discount: "0",
      taxRate: null,
      sortOrder: index,
    });
  }

  let totals: ReturnType<typeof calculateInvoiceTotals>;
  try {
    totals = calculateInvoiceTotals(
      prepared.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Invalid invoice amounts");
  }

  return {
    totals,
    records: prepared.map((item, index) => ({
      ...item,
      quantity: moneyString(item.quantity),
      unitPrice: moneyString(item.unitPrice),
      discount: totals.lines[index].discountAmount,
      taxRate: item.taxRate === null ? null : moneyString(item.taxRate),
      taxAmount: totals.lines[index].taxAmount,
      lineTotal: totals.lines[index].lineTotal,
    })),
  };
}

function addressFromCustomer(
  address: { line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; country: string } | null,
): AddressInput | undefined {
  if (!address) {
    return undefined;
  }
  return {
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    region: address.region ?? undefined,
    postalCode: address.postalCode ?? undefined,
    country: address.country,
  };
}

async function resolveMemberAssignment(
  actor: AuthUser,
  organizationId: string,
  assignedMemberId?: string,
): Promise<string | null> {
  const memberId = assignedMemberId ?? (actor.role === "MEMBER" ? actor.id : null);
  if (!memberId) {
    return null;
  }

  const member = await findMemberById(memberId);
  if (!member || member.organizationId !== organizationId) {
    throw new ForbiddenError("Assigned member must belong to the organization");
  }
  if (actor.role === "MEMBER" && memberId !== actor.id) {
    throw new ForbiddenError("You can only assign invoices to yourself");
  }
  if (actor.role === "ADMIN" && member.administratorId !== actor.id) {
    throw new ForbiddenError("You can only assign invoices to your members");
  }

  return memberId;
}

export async function listInvoiceAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: InvoiceStatus;
    boardColumn?: "new" | "sent" | "overdue" | "paid";
    customerId?: string;
    organizationId?: string;
    administratorId?: string;
    assignedMemberId?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: "invoiceDate" | "dueDate" | "total" | "invoiceNumber" | "createdAt";
    sortDir?: "asc" | "desc";
    page: number;
    pageSize: number;
  },
): Promise<{ items: InvoiceView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const organizationId = await scopedTenantOrganizationId(actor, query.organizationId);
  const userScope = await resolveInvoiceUserScope(actor);
  const now = new Date();

  let userIds = userScope?.userIds;

  if (query.administratorId) {
    if (actor.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("You cannot filter invoices by administrator");
    }
    const admin = await findAdminById(query.administratorId);
    if (!admin) {
      throw new NotFoundError("Administrator not found");
    }
    userIds = await listMemberIdsByAdministrator(admin.id);
  }

  if (query.assignedMemberId) {
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
      throw new ForbiddenError("You cannot filter invoices by member");
    }
    const member = await findMemberById(query.assignedMemberId);
    if (!member) {
      throw new NotFoundError("Member not found");
    }
    if (actor.role === "ADMIN" && member.administratorId !== actor.id) {
      throw new ForbiddenError("You do not have access to this member");
    }
    if (query.administratorId && member.administratorId !== query.administratorId) {
      throw new ForbiddenError("Member does not belong to this administrator");
    }
    if (userIds && !userIds.includes(member.id)) {
      userIds = [];
    } else {
      userIds = [member.id];
    }
  }

  const { items, total } = await listInvoices({
    search: query.search,
    status: query.boardColumn
      ? undefined
      : query.status === "OVERDUE"
        ? undefined
        : query.status,
    overdue: query.boardColumn ? false : query.status === "OVERDUE",
    boardColumn: query.boardColumn,
    customerId: query.customerId,
    organizationId,
    userIds,
    dateFrom: query.dateFrom ? parseDateValue(query.dateFrom, "dateFrom") : undefined,
    dateTo: query.dateTo ? parseDateValue(query.dateTo, "dateTo") : undefined,
    sort: query.sort,
    sortDir: query.sortDir,
    page: query.page,
    pageSize: query.pageSize,
    now,
  });

  return {
    items: items.map((invoice) => toInvoiceView(invoice, now)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getInvoiceSummaryCounts(actor: AuthUser) {
  const organizationId = await scopedTenantOrganizationId(actor);
  const userScope = await resolveInvoiceUserScope(actor);
  return countInvoiceSummary({
    organizationId,
    userIds: userScope?.userIds,
  });
}

export async function getInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);
  return withOrganizationLogo(toInvoiceView(invoice), invoice.organizationId);
}

export async function createInvoiceAccount(
  actor: AuthUser,
  input: {
    customerId: string;
    organizationId?: string;
    invoiceNumber?: string;
    invoiceDate: string;
    dueDate: string;
    currency?: string;
    notes?: string;
    terms?: string;
    assignedMemberId?: string;
    items: InvoiceItemInput[];
  },
): Promise<InvoiceView> {
  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const customer = await findCustomerById(input.customerId);
  if (!customer || customer.organizationId !== organizationId) {
    throw new ForbiddenError("Customer must belong to the organization");
  }
  await assertCustomerScope(actor, customer);

  const invoiceDate = parseDateValue(input.invoiceDate, "Invoice date");
  const dueDate = parseDateValue(input.dueDate, "Due date");
  assertDueDateNotBeforeInvoiceDate(invoiceDate, dueDate);

  const assignedMemberId = await resolveMemberAssignment(
    actor,
    organizationId,
    input.assignedMemberId ?? (actor.role === "MEMBER" ? actor.id : undefined),
  );

  const invoiceNumber = input.invoiceNumber?.trim() || (await nextInvoiceNumber(organizationId));
  const existing = await findInvoiceByOrganizationAndNumber(organizationId, invoiceNumber);
  if (existing) {
    throw new ConflictError("An invoice with this number already exists in the organization");
  }

  const { totals, records } = await snapshotItems(organizationId, input.items);

  const invoice = await createInvoice({
    organizationId,
    customerId: customer.id,
    createdById: actor.id,
    assignedMemberId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    currency: input.currency?.trim() || "USD",
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes: input.notes,
    terms: input.terms,
    billingAddress: addressFromCustomer(customer.billingAddress),
    shippingAddress: addressFromCustomer(customer.shippingAddress),
    items: records,
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_CREATED",
    entity: "Invoice",
    entityId: invoice.id,
    organizationId,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  return toInvoiceView(invoice);
}

export async function updateInvoiceAccount(
  actor: AuthUser,
  id: string,
  input: {
    customerId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    currency?: string;
    notes?: string | null;
    terms?: string | null;
    assignedMemberId?: string | null;
    items?: InvoiceItemInput[];
    status?: unknown;
  },
): Promise<InvoiceView> {
  if (input.status !== undefined) {
    throw new ForbiddenError("Invoice status cannot be changed through this endpoint");
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canEditInvoice(invoice.status)) {
    throw new ForbiddenError("Only draft invoices can be edited");
  }

  if (input.invoiceNumber && input.invoiceNumber !== invoice.invoiceNumber) {
    const duplicate = await findInvoiceByOrganizationAndNumber(
      invoice.organizationId,
      input.invoiceNumber,
    );
    if (duplicate) {
      throw new ConflictError("An invoice with this number already exists in the organization");
    }
  }

  if (input.customerId && input.customerId !== invoice.customerId) {
    const customer = await findCustomerById(input.customerId);
    if (!customer || customer.organizationId !== invoice.organizationId) {
      throw new ForbiddenError("Customer must belong to the organization");
    }
  }

  const nextAssignedMemberId =
    input.assignedMemberId === undefined
      ? invoice.assignedMemberId
      : input.assignedMemberId;
  const assignedMemberId = await resolveMemberAssignment(
    actor,
    invoice.organizationId,
    nextAssignedMemberId ?? undefined,
  );

  const invoiceDate = input.invoiceDate
    ? parseDateValue(input.invoiceDate, "Invoice date")
    : invoice.invoiceDate;
  const dueDate = input.dueDate ? parseDateValue(input.dueDate, "Due date") : invoice.dueDate;
  assertDueDateNotBeforeInvoiceDate(invoiceDate, dueDate);

  const snapshot = input.items
    ? await snapshotItems(invoice.organizationId, input.items)
    : null;

  const updated = await updateInvoice(invoice.id, {
    customerId: input.customerId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate ? invoiceDate : undefined,
    dueDate: input.dueDate ? dueDate : undefined,
    currency: input.currency,
    notes: input.notes,
    terms: input.terms,
    assignedMemberId,
    ...(snapshot
      ? {
          subtotal: snapshot.totals.subtotal,
          discountAmount: snapshot.totals.discountAmount,
          taxAmount: snapshot.totals.taxAmount,
          total: snapshot.totals.total,
          items: snapshot.records,
        }
      : {}),
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_UPDATED",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber },
  });

  return toInvoiceView(updated);
}

export async function deleteInvoiceAccount(actor: AuthUser, id: string): Promise<void> {
  if (actor.role === "MEMBER") {
    throw new ForbiddenError("You cannot delete invoices");
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canDeleteInvoice(invoice.status)) {
    throw new ForbiddenError("Only draft invoices can be deleted");
  }

  await deleteInvoice(invoice.id);

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_DELETED",
    entity: "Invoice",
    entityId: invoice.id,
    organizationId: invoice.organizationId,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });
}

export async function sendInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (invoice.status === "CANCELLED") {
    throw new ForbiddenError("Cancelled invoices cannot be emailed");
  }

  const recipient = invoice.customer.email?.trim();
  if (!recipient) {
    throw new ValidationError("This customer does not have an email address");
  }

  const shareable = await ensureInvoiceShareToken(invoice.id, invoice.shareToken);

  try {
    await sendInvoiceEmail(shareable);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed";
    await updateInvoice(invoice.id, {
      emailStatus: "FAILED",
      emailLastError: message.slice(0, 500),
    });
    throw error;
  }

  const issued = invoice.status === "DRAFT";
  const updated = await updateInvoice(invoice.id, {
    emailStatus: "SENT",
    emailSentAt: new Date(),
    emailLastError: null,
    ...(issued
      ? {
          status: "SENT" as const,
          sentAt: new Date(),
        }
      : {}),
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_SENT",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber, channel: "email" },
  });

  return toInvoiceView(updated);
}

async function ensureInvoiceShareToken(
  invoiceId: string,
  existingToken: string | null,
): Promise<NonNullable<Awaited<ReturnType<typeof findInvoiceById>>>> {
  if (existingToken) {
    const current = await findInvoiceById(invoiceId);
    if (!current) {
      throw new NotFoundError("Invoice not found");
    }
    return current;
  }

  const updated = await updateInvoice(invoiceId, {
    shareToken: generateInvoiceShareToken(),
  });
  return updated;
}

export async function getInvoiceShareLink(
  actor: AuthUser,
  id: string,
): Promise<{ url: string }> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  const shareable = await ensureInvoiceShareToken(invoice.id, invoice.shareToken);
  if (!shareable.shareToken) {
    throw new ValidationError("Unable to create an invoice link");
  }

  return { url: invoiceShareUrl(shareable.shareToken) };
}

export async function getPublicInvoiceByToken(token: string): Promise<PublicInvoiceView> {
  const invoice = await findInvoiceByShareToken(token);
  if (!invoice || invoice.status === "CANCELLED") {
    throw new NotFoundError("Invoice not found");
  }

  let record = invoice;
  if (invoice.status === "SENT" || invoice.status === "VIEWED") {
    await updateInvoice(invoice.id, {
      ...(invoice.status === "SENT" ? { status: "VIEWED" as const } : {}),
      viewedAt: new Date(),
    });
    const viewed = await findInvoiceById(invoice.id);
    if (viewed) {
      record = viewed;
    }
  }

  const [logoUrl, companyName] = await Promise.all([
    getOrganizationLogoUrl(record.organizationId, {
      expiresInSeconds: 60 * 60,
    }),
    getInvoiceCompanyName(record.organizationId),
  ]);
  return toPublicInvoiceView(record, undefined, logoUrl, companyName);
}

export async function duplicateInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  return createInvoiceAccount(actor, {
    customerId: invoice.customerId,
    organizationId: invoice.organizationId,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    currency: invoice.currency,
    notes: invoice.notes ?? undefined,
    terms: invoice.terms ?? undefined,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discount: item.discount.toString(),
      taxRate: item.taxRate?.toString(),
    })),
  });
}

export async function cancelInvoiceAccount(actor: AuthUser, id: string): Promise<InvoiceView> {
  const invoice = await findInvoiceById(id);
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }
  await assertInvoiceAccess(actor, invoice);

  if (!canCancelInvoice(invoice.status)) {
    throw new ForbiddenError("This invoice cannot be cancelled");
  }

  const updated = await updateInvoice(invoice.id, { status: "CANCELLED" });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_CANCELLED",
    entity: "Invoice",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { invoiceNumber: updated.invoiceNumber },
  });

  return toInvoiceView(updated);
}

export async function recordInvoicePayment(
  actor: AuthUser,
  id: string,
  input: {
    amount: string;
    method?: "CASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
    paidAt?: string;
    notes?: string;
    providerTransactionId?: string;
    reference?: string;
  },
): Promise<InvoiceView> {
  const result = await recordManualPayment(actor, {
    invoiceId: id,
    amount: input.amount,
    method: input.method,
    paidAt: input.paidAt,
    notes: input.notes,
    providerTransactionId: input.providerTransactionId ?? input.reference,
  });
  return result.invoice;
}

