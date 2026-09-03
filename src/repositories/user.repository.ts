import type { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { AdminRecord, OrganizationRecord, UserRecord } from "../types/auth.js";

const adminInclude = {
  organization: true,
  managedMembers: {
    select: { id: true, firstName: true, lastName: true, email: true, status: true },
  },
  _count: { select: { managedMembers: true } },
} as const;

const memberInclude = {
  organization: true,
  administrator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function findUserByIdWithProfile(id: string): Promise<
  | (UserRecord & {
      administrator: { id: string; firstName: string; lastName: string; email: string } | null;
    })
  | null
> {
  return prisma.user.findUnique({
    where: { id },
    include: {
      administrator: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

export async function findAdminById(id: string): Promise<AdminRecord | null> {
  return prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    include: adminInclude,
  });
}

export async function listAdmins(query: {
  search?: string;
  status?: AccountStatus;
  organizationId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminRecord[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    role: "ADMIN",
    ...(query.status ? { status: query.status } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: adminInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  status?: AccountStatus;
  organizationId: string | null;
  administratorId?: string | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
}): Promise<UserRecord> {
  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      role: data.role,
      status: data.status ?? "ACTIVE",
      organizationId: data.organizationId,
      administratorId: data.administratorId ?? null,
      passwordResetToken: data.passwordResetToken,
      passwordResetExpires: data.passwordResetExpires,
    },
  });
}

export async function updateUser(
  id: string,
  data: Partial<
    Pick<
      UserRecord,
      | "firstName"
      | "lastName"
      | "phone"
      | "email"
      | "status"
      | "lastLoginAt"
      | "organizationId"
      | "administratorId"
      | "passwordHash"
      | "passwordResetToken"
      | "passwordResetExpires"
      | "avatarObjectKey"
    >
  >,
): Promise<UserRecord> {
  return prisma.user.update({
    where: { id },
    data: {
      ...data,
      ...(data.email ? { email: data.email.toLowerCase() } : {}),
    },
  });
}

export async function countUsersByRole(role: UserRole): Promise<number> {
  return prisma.user.count({
    where: { role },
  });
}

export async function listMemberIdsByAdministrator(administratorId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: "MEMBER", administratorId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function findMemberById(id: string): Promise<
  | (UserRecord & {
      organization: OrganizationRecord | null;
      administrator: { id: string; firstName: string; lastName: string; email: string } | null;
    })
  | null
> {
  return prisma.user.findFirst({
    where: { id, role: "MEMBER" },
    include: memberInclude,
  });
}

export async function listMembers(query: {
  search?: string;
  status?: AccountStatus;
  organizationId?: string;
  administratorId?: string;
  page: number;
  pageSize: number;
}): Promise<{
  items: Array<
    UserRecord & {
      organization: OrganizationRecord | null;
      administrator: { id: string; firstName: string; lastName: string; email: string } | null;
    }
  >;
  total: number;
}> {
  const where: Prisma.UserWhereInput = {
    role: "MEMBER",
    ...(query.status ? { status: query.status } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.administratorId === "none"
      ? { administratorId: null }
      : query.administratorId
        ? { administratorId: query.administratorId }
        : {}),
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: memberInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

export async function listMemberAdministrators(query?: {
  organizationId?: string;
}): Promise<{
  items: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  unassignedCount: number;
}> {
  const memberWhere: Prisma.UserWhereInput = {
    role: "MEMBER",
    ...(query?.organizationId ? { organizationId: query.organizationId } : {}),
  };

  const [memberAdministrators, unassignedCount] = await prisma.$transaction([
    prisma.user.findMany({
      where: { ...memberWhere, administratorId: { not: null } },
      select: { administratorId: true },
      distinct: ["administratorId"],
    }),
    prisma.user.count({
      where: { ...memberWhere, administratorId: null },
    }),
  ]);

  const administratorIds = memberAdministrators
    .map((member) => member.administratorId)
    .filter((id): id is string => Boolean(id));

  if (administratorIds.length === 0) {
    return { items: [], unassignedCount };
  }

  const items = await prisma.user.findMany({
    where: { id: { in: administratorIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return { items, unassignedCount };
}
