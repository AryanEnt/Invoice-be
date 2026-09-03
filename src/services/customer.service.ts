import { Permissions } from "../config/permissions.js";
import { assertCustomerScope, resolveAdministratorId } from "../lib/admin-scope.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { toCustomerView } from "../lib/customer-view.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  countCustomerDocuments,
  createCustomer,
  deleteCustomer,
  findCustomerById,
  findLatestUnsentInvoicesByCustomerIds,
  listCustomers,
  updateCustomer,
} from "../repositories/customer.repository.js";
import type { AddressInput, AuthUser, CustomerView } from "../types/auth.js";
import {
  assertOrganizationAccess,
  resolveManagedOrganizationId,
  scopedTenantOrganizationId,
} from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function canDeleteCustomers(actor: AuthUser): boolean {
  return actor.permissions.includes(Permissions.CUSTOMERS_DELETE);
}

async function mapCustomersWithLifecycle(
  records: Awaited<ReturnType<typeof listCustomers>>["items"],
): Promise<CustomerView[]> {
  const unsentMap = await findLatestUnsentInvoicesByCustomerIds(records.map((item) => item.id));
  return records.map((customer) => {
    const hasSuccessfullySentInvoice = customer._count.invoices > 0;
    return toCustomerView(customer, {
      // Only NEW customers get the unsent-invoice hint (never successfully emailed).
      unsentInvoice: hasSuccessfullySentInvoice ? null : (unsentMap.get(customer.id) ?? null),
    });
  });
}

export async function listCustomerAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: "ACTIVE" | "INACTIVE";
    organizationId?: string;
    invoiceLifecycle?: "NEW" | "OLD";
    page: number;
    pageSize: number;
  },
): Promise<{
  items: CustomerView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: { all: number; new: number; old: number };
}> {
  const organizationId = await scopedTenantOrganizationId(actor, query.organizationId);
  const administratorId = await resolveAdministratorId(actor);
  const { items, total, counts } = await listCustomers({
    search: query.search,
    isActive: query.status === undefined ? undefined : query.status === "ACTIVE",
    organizationId,
    administratorId: administratorId ?? undefined,
    invoiceLifecycle: query.invoiceLifecycle,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: await mapCustomersWithLifecycle(items),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    counts,
  };
}

export async function getCustomerAccount(actor: AuthUser, id: string): Promise<CustomerView> {
  const customer = await findCustomerById(id);
  if (!customer) {
    throw new NotFoundError("Customer not found");
  }
  assertOrganizationAccess(actor, customer.organizationId);
  await assertCustomerScope(actor, customer);
  const unsentMap = await findLatestUnsentInvoicesByCustomerIds([customer.id]);
  const hasSuccessfullySentInvoice = customer._count.invoices > 0;
  return toCustomerView(customer, {
    unsentInvoice: hasSuccessfullySentInvoice ? null : (unsentMap.get(customer.id) ?? null),
  });
}

export async function createCustomerAccount(
  actor: AuthUser,
  input: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    taxNumber?: string;
    notes?: string;
    organizationId?: string;
    isActive?: boolean;
    billingAddress?: AddressInput;
    shippingAddress?: AddressInput;
  },
): Promise<CustomerView> {
  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const administratorId = await resolveAdministratorId(actor);
  if (actor.role === "MEMBER" && !administratorId) {
    throw new ForbiddenError("Your account is not linked to an administrator");
  }

  const customer = await createCustomer({
    organizationId,
    administratorId,
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone,
    taxNumber: input.taxNumber,
    notes: input.notes,
    isActive: input.isActive,
    billingAddress: input.billingAddress,
    shippingAddress: input.shippingAddress,
  });

  await recordAudit({
    actorId: actor.id,
    action: "CUSTOMER_CREATED",
    entity: "Customer",
    entityId: customer.id,
    organizationId,
    metadata: { name: customer.name },
  });

  return toCustomerView(customer, { unsentInvoice: null });
}

export async function updateCustomerAccount(
  actor: AuthUser,
  id: string,
  input: {
    name?: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    taxNumber?: string | null;
    notes?: string | null;
    isActive?: boolean;
    billingAddress?: AddressInput | null;
    shippingAddress?: AddressInput | null;
  },
): Promise<CustomerView> {
  const customer = await findCustomerById(id);
  if (!customer) {
    throw new NotFoundError("Customer not found");
  }
  assertOrganizationAccess(actor, customer.organizationId);
  await assertCustomerScope(actor, customer);

  const updated = await updateCustomer(customer.id, input);
  const unsentMap = await findLatestUnsentInvoicesByCustomerIds([updated.id]);

  await recordAudit({
    actorId: actor.id,
    action: "CUSTOMER_UPDATED",
    entity: "Customer",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { name: updated.name },
  });

  return toCustomerView(updated, {
    unsentInvoice: updated._count.invoices > 0 ? null : (unsentMap.get(updated.id) ?? null),
  });
}

export async function deleteCustomerAccount(actor: AuthUser, id: string): Promise<void> {
  if (!canDeleteCustomers(actor)) {
    throw new ForbiddenError("You cannot delete customers");
  }

  const customer = await findCustomerById(id);
  if (!customer) {
    throw new NotFoundError("Customer not found");
  }
  assertOrganizationAccess(actor, customer.organizationId);
  await assertCustomerScope(actor, customer);

  const documents = await countCustomerDocuments(customer.id);
  if (documents > 0) {
    throw new ConflictError("Customer cannot be deleted because it is used on invoices or quotes");
  }

  await deleteCustomer(customer.id);

  await recordAudit({
    actorId: actor.id,
    action: "CUSTOMER_DELETED",
    entity: "Customer",
    entityId: customer.id,
    organizationId: customer.organizationId,
    metadata: { name: customer.name },
  });
}
