import { prisma } from "../lib/prisma.js";
import type { OrganizationRecord } from "../types/auth.js";

export async function findOrganizationById(
  id: string,
): Promise<OrganizationRecord | null> {
  return prisma.organization.findUnique({
    where: { id },
  });
}

export async function listOrganizations(): Promise<OrganizationRecord[]> {
  return prisma.organization.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getSoleOrganizationId(): Promise<string | null> {
  const active = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2,
  });
  if (active.length === 1) {
    return active[0].id;
  }
  const all = await prisma.organization.findMany({
    select: { id: true },
    take: 2,
  });
  return all.length === 1 ? all[0].id : null;
}

export async function getDefaultOrganizationId(): Promise<string | null> {
  const sole = await getSoleOrganizationId();
  if (sole) {
    return sole;
  }
  const firstActive = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (firstActive) {
    return firstActive.id;
  }
  const first = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function listOrganizationOverviews(): Promise<OrganizationOverviewRecord[]> {
  const organizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          customers: true,
          invoices: true,
        },
      },
      users: {
        where: { role: { in: ["ADMIN", "MEMBER"] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return organizations.map(toOverviewRecord);
}

export async function findOrganizationOverviewById(
  id: string,
): Promise<OrganizationOverviewRecord | null> {
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          customers: true,
          invoices: true,
        },
      },
      users: {
        where: { role: { in: ["ADMIN", "MEMBER"] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return organization ? toOverviewRecord(organization) : null;
}

export interface OrganizationOverviewRecord {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  admin: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  adminCount: number;
  memberCount: number;
  customerCount: number;
  invoiceCount: number;
}

function toOverviewRecord(organization: {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { users: number; customers: number; invoices: number };
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    createdAt: Date;
  }>;
}): OrganizationOverviewRecord {
  const admins = organization.users.filter((user) => user.role === "ADMIN");
  const admin = admins[0] ?? null;
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    isActive: organization.isActive,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
    admin: admin
      ? {
          id: admin.id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
        }
      : null,
    adminCount: admins.length,
    memberCount: organization.users.filter((user) => user.role === "MEMBER").length,
    customerCount: organization._count.customers,
    invoiceCount: organization._count.invoices,
  };
}

export async function findOrganizationBySlug(
  slug: string,
  excludeId?: string,
): Promise<OrganizationRecord | null> {
  return prisma.organization.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export async function createOrganization(data: {
  name: string;
  slug: string;
}): Promise<OrganizationRecord> {
  return prisma.organization.create({
    data: {
      name: data.name,
      slug: data.slug,
    },
  });
}

export async function updateOrganization(
  id: string,
  data: Partial<Pick<OrganizationRecord, "name" | "slug" | "isActive" | "logoObjectKey">>,
): Promise<OrganizationRecord> {
  return prisma.organization.update({
    where: { id },
    data,
  });
}
