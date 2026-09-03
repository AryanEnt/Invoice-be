import type { Address, Customer, Organization, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { AddressInput, CustomerUnsentInvoiceSummary } from "../types/auth.js";

export type CustomerRecord = Customer & {
  billingAddress: Address | null;
  shippingAddress: Address | null;
  organization: Organization | null;
  _count: { invoices: number };
};

const customerInclude = {
  billingAddress: true,
  shippingAddress: true,
  organization: true,
  _count: {
    select: {
      invoices: {
        where: { emailStatus: "SENT" },
      },
    },
  },
} as const;

function addressData(input: AddressInput) {
  return {
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country,
  };
}

function buildCustomerWhere(query: {
  search?: string;
  isActive?: boolean;
  organizationId?: string;
  administratorId?: string;
  invoiceLifecycle?: "NEW" | "OLD";
}): Prisma.CustomerWhereInput {
  return {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.administratorId ? { administratorId: query.administratorId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.invoiceLifecycle === "OLD"
      ? { invoices: { some: { emailStatus: "SENT" } } }
      : query.invoiceLifecycle === "NEW"
        ? { invoices: { none: { emailStatus: "SENT" } } }
        : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { company: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
            { taxNumber: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function findCustomerById(id: string): Promise<CustomerRecord | null> {
  return prisma.customer.findUnique({
    where: { id },
    include: customerInclude,
  });
}

export async function listCustomers(query: {
  search?: string;
  isActive?: boolean;
  organizationId?: string;
  administratorId?: string;
  invoiceLifecycle?: "NEW" | "OLD";
  page: number;
  pageSize: number;
}): Promise<{
  items: CustomerRecord[];
  total: number;
  counts: { all: number; new: number; old: number };
}> {
  const baseWhere = buildCustomerWhere({
    search: query.search,
    isActive: query.isActive,
    organizationId: query.organizationId,
    administratorId: query.administratorId,
  });
  const where = buildCustomerWhere(query);

  const [items, total, all, old] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      include: customerInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: baseWhere }),
    prisma.customer.count({
      where: {
        ...baseWhere,
        invoices: { some: { emailStatus: "SENT" } },
      },
    }),
  ]);

  return {
    items,
    total,
    counts: {
      all,
      old,
      new: Math.max(0, all - old),
    },
  };
}

export async function findLatestUnsentInvoicesByCustomerIds(
  customerIds: string[],
): Promise<Map<string, CustomerUnsentInvoiceSummary>> {
  const map = new Map<string, CustomerUnsentInvoiceSummary>();
  if (customerIds.length === 0) {
    return map;
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: { in: customerIds },
      status: { not: "CANCELLED" },
      emailStatus: { in: ["NOT_SENT", "FAILED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customerId: true,
      invoiceNumber: true,
      emailStatus: true,
    },
  });

  for (const invoice of invoices) {
    if (map.has(invoice.customerId)) {
      continue;
    }
    if (invoice.emailStatus !== "NOT_SENT" && invoice.emailStatus !== "FAILED") {
      continue;
    }
    map.set(invoice.customerId, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      emailStatus: invoice.emailStatus,
    });
  }

  return map;
}

export async function createCustomer(data: {
  organizationId: string;
  administratorId?: string | null;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
  isActive?: boolean;
  billingAddress?: AddressInput;
  shippingAddress?: AddressInput;
}): Promise<CustomerRecord> {
  return prisma.$transaction(async (tx) => {
    const billingAddress = data.billingAddress
      ? await tx.address.create({ data: addressData(data.billingAddress) })
      : null;
    const shippingAddress = data.shippingAddress
      ? await tx.address.create({ data: addressData(data.shippingAddress) })
      : null;

    return tx.customer.create({
      data: {
        organizationId: data.organizationId,
        administratorId: data.administratorId ?? null,
        name: data.name,
        company: data.company ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        taxNumber: data.taxNumber ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
        billingAddressId: billingAddress?.id,
        shippingAddressId: shippingAddress?.id,
      },
      include: customerInclude,
    });
  });
}

export async function updateCustomer(
  id: string,
  data: {
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
): Promise<CustomerRecord> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({
      where: { id },
      include: customerInclude,
    });
    if (!current) {
      throw new Error("Customer not found");
    }

    const billingAddressId = await upsertAddress(
      tx,
      current.billingAddressId,
      data.billingAddress,
    );
    const shippingAddressId = await upsertAddress(
      tx,
      current.shippingAddressId,
      data.shippingAddress,
    );

    const updated = await tx.customer.update({
      where: { id },
      data: {
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        taxNumber: data.taxNumber,
        notes: data.notes,
        isActive: data.isActive,
        ...(data.billingAddress !== undefined ? { billingAddressId } : {}),
        ...(data.shippingAddress !== undefined ? { shippingAddressId } : {}),
      },
      include: customerInclude,
    });

    await deleteOrphanAddress(tx, current.billingAddressId, billingAddressId);
    await deleteOrphanAddress(tx, current.shippingAddressId, shippingAddressId);

    return updated;
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id } });
    if (!current) {
      return;
    }
    await tx.customer.delete({ where: { id } });
    if (current.billingAddressId) {
      await tx.address.deleteMany({ where: { id: current.billingAddressId } });
    }
    if (current.shippingAddressId && current.shippingAddressId !== current.billingAddressId) {
      await tx.address.deleteMany({ where: { id: current.shippingAddressId } });
    }
  });
}

export async function countCustomerDocuments(id: string): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      _count: { select: { invoices: true, quotes: true } },
    },
  });
  if (!customer) {
    return 0;
  }
  return customer._count.invoices + customer._count.quotes;
}

async function upsertAddress(
  tx: Prisma.TransactionClient,
  existingId: string | null,
  input: AddressInput | null | undefined,
): Promise<string | null> {
  if (input === undefined) {
    return existingId;
  }
  if (input === null) {
    return null;
  }
  if (existingId) {
    await tx.address.update({
      where: { id: existingId },
      data: addressData(input),
    });
    return existingId;
  }
  const created = await tx.address.create({ data: addressData(input) });
  return created.id;
}

async function deleteOrphanAddress(
  tx: Prisma.TransactionClient,
  previousId: string | null,
  nextId: string | null,
): Promise<void> {
  if (previousId && previousId !== nextId) {
    await tx.address.deleteMany({ where: { id: previousId } });
  }
}
