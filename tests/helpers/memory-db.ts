import { randomUUID } from "node:crypto";
import type { AccountStatus, CatalogKind, InvoiceStatus, UserRole } from "@prisma/client";
import {
  periodKey,
  periodKeys,
  rangeDayCount,
  resolveDateRange,
  startOfUtcDay,
  type DateRange,
} from "../../src/lib/date-range.js";
import { ValidationError } from "../../src/lib/errors.js";
import { deriveInvoiceStatus, derivePaymentStatus } from "../../src/lib/invoice-status.js";
import { money, moneyString } from "../../src/lib/money.js";
import type { DashboardQueryScope } from "../../src/repositories/dashboard.repository.js";
import type { ReportKind, ReportQueryScope } from "../../src/types/report.js";
import type {
  AddressInput,
  OrganizationRecord,
  SessionRecord,
  TeamRecord,
  UserRecord,
} from "../../src/types/auth.js";

export interface MemoryAddress {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryCustomer {
  id: string;
  organizationId: string;
  administratorId: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  billingAddressId: string | null;
  shippingAddressId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryProduct {
  id: string;
  organizationId: string;
  kind: CatalogKind;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string | null;
  unitPrice: number;
  currency: string;
  taxRate: number | null;
  taxId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string | null;
  serviceId: string | null;
  taxId: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryInvoice {
  id: string;
  organizationId: string;
  customerId: string;
  createdById: string;
  assignedTeamId: string | null;
  assignedMemberId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  notes: string | null;
  terms: string | null;
  billingAddressId: string | null;
  shippingAddressId: string | null;
  shareToken: string | null;
  pdfObjectKey: string | null;
  emailStatus: "NOT_SENT" | "SENT" | "FAILED";
  emailSentAt: Date | null;
  emailLastError: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryDb {
  users: UserRecord[];
  sessions: SessionRecord[];
  organizations: OrganizationRecord[];
  teams: TeamRecord[];
  teamMembers: Array<{ teamId: string; userId: string }>;
  addresses: MemoryAddress[];
  customers: MemoryCustomer[];
  products: MemoryProduct[];
  invoices: MemoryInvoice[];
  invoiceItems: MemoryInvoiceItem[];
  payments: Array<Record<string, unknown>>;
  expenseCategories: Array<{ id: string; organizationId: string; name: string }>;
  expenses: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
}

export function createMemoryDb(): MemoryDb {
  return {
    users: [],
    sessions: [],
    organizations: [],
    teams: [],
    teamMembers: [],
    addresses: [],
    customers: [],
    products: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    expenseCategories: [],
    expenses: [],
    auditLogs: [],
  };
}

const sharedDb = createMemoryDb();

export function getTestDb(): MemoryDb {
  return sharedDb;
}

export function getTestRepos() {
  return createMemoryRepositories(sharedDb);
}

export function resetMemoryDb(db: MemoryDb): void {
  db.users.length = 0;
  db.sessions.length = 0;
  db.organizations.length = 0;
  db.teams.length = 0;
  db.teamMembers.length = 0;
  db.addresses.length = 0;
  db.customers.length = 0;
  db.products.length = 0;
  db.invoices.length = 0;
  db.invoiceItems.length = 0;
  db.payments.length = 0;
  db.expenseCategories.length = 0;
  db.expenses.length = 0;
  db.auditLogs.length = 0;
}

function now(): Date {
  return new Date();
}

function memoryOrganizationOverview(db: MemoryDb, organization: OrganizationRecord) {
  const users = db.users.filter((user) => user.organizationId === organization.id);
  const admins = users.filter((user) => user.role === "ADMIN");
  const admin = admins[0];
  return {
    ...organization,
    admin: admin
      ? {
          id: admin.id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
        }
      : null,
    adminCount: admins.length,
    memberCount: users.filter((user) => user.role === "MEMBER").length,
    teamCount: db.teams.filter((team) => team.organizationId === organization.id).length,
    customerCount: db.customers.filter((customer) => customer.organizationId === organization.id)
      .length,
    invoiceCount: db.invoices.filter((invoice) => invoice.organizationId === organization.id).length,
  };
}

export function createMemoryRepositories(db: MemoryDb) {
  return {
    user: {
      findUserByEmail: async (email: string) =>
        db.users.find((user) => user.email === email.toLowerCase()) ?? null,
      findUserById: async (id: string) => db.users.find((user) => user.id === id) ?? null,
      createUser: async (data: {
        email: string;
        passwordHash: string;
        firstName: string;
        lastName: string;
        phone?: string | null;
        role: UserRole;
        status?: AccountStatus;
        organizationId: string | null;
        passwordResetToken?: string | null;
        passwordResetExpires?: Date | null;
      }) => {
        const user: UserRecord = {
          id: randomUUID(),
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? null,
          avatarObjectKey: null,
          role: data.role,
          status: data.status ?? "ACTIVE",
          organizationId: data.organizationId,
          administratorId: null,
          lastLoginAt: null,
          passwordResetToken: data.passwordResetToken ?? null,
          passwordResetExpires: data.passwordResetExpires ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        db.users.push(user);
        return user;
      },
      updateUser: async (
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
            | "passwordHash"
          >
        >,
      ) => {
        const user = db.users.find((item) => item.id === id);
        if (!user) {
          throw new Error("User not found");
        }
        Object.assign(
          user,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          { updatedAt: now() },
        );
        if (typeof data.email === "string") {
          user.email = data.email.toLowerCase();
        }
        return user;
      },
      countUsersByRole: async (role: UserRole) =>
        db.users.filter((user) => user.role === role).length,
      findAdminById: async (id: string) => {
        const user = db.users.find((item) => item.id === id && item.role === "ADMIN");
        if (!user) {
          return null;
        }
        return {
          ...user,
          organization:
            db.organizations.find((organization) => organization.id === user.organizationId) ??
            null,
          createdTeams: db.teams.filter((team) => team.createdById === user.id),
          teamMemberships: db.teamMembers
            .filter((membership) => membership.userId === user.id)
            .map((membership) => ({
              team: db.teams.find((team) => team.id === membership.teamId)!,
            }))
            .filter((item) => item.team),
        };
      },
      listAdmins: async (query: {
        search?: string;
        status?: AccountStatus;
        organizationId?: string;
        page: number;
        pageSize: number;
      }) => {
        const search = query.search?.toLowerCase();
        const filtered = db.users.filter((user) => {
          if (user.role !== "ADMIN") {
            return false;
          }
          if (query.status && user.status !== query.status) {
            return false;
          }
          if (query.organizationId && user.organizationId !== query.organizationId) {
            return false;
          }
          if (search) {
            const haystack = `${user.email} ${user.firstName} ${user.lastName} ${user.phone ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          return true;
        });

        const start = (query.page - 1) * query.pageSize;
        const items = filtered.slice(start, start + query.pageSize).map((user) => ({
          ...user,
          organization:
            db.organizations.find((organization) => organization.id === user.organizationId) ??
            null,
          createdTeams: db.teams.filter((team) => team.createdById === user.id),
          teamMemberships: db.teamMembers
            .filter((membership) => membership.userId === user.id)
            .map((membership) => ({
              team: db.teams.find((team) => team.id === membership.teamId)!,
            }))
            .filter((item) => item.team),
        }));

        return { items, total: filtered.length };
      },
      findMemberById: async (id: string) => {
        const user = db.users.find((item) => item.id === id && item.role === "MEMBER");
        if (!user) {
          return null;
        }
        return {
          ...user,
          organization:
            db.organizations.find((organization) => organization.id === user.organizationId) ??
            null,
          teamMemberships: db.teamMembers
            .filter((membership) => membership.userId === user.id)
            .map((membership) => ({
              team: db.teams.find((team) => team.id === membership.teamId)!,
            }))
            .filter((item) => item.team),
        };
      },
      listMembers: async (query: {
        search?: string;
        status?: AccountStatus;
        organizationId?: string;
        teamId?: string;
        teamIds?: string[];
        page: number;
        pageSize: number;
      }) => {
        const search = query.search?.toLowerCase();
        const filtered = db.users.filter((user) => {
          if (user.role !== "MEMBER") {
            return false;
          }
          if (query.status && user.status !== query.status) {
            return false;
          }
          if (query.organizationId && user.organizationId !== query.organizationId) {
            return false;
          }
          if (
            query.teamIds &&
            query.teamIds.length > 0 &&
            !db.teamMembers.some(
              (membership) =>
                query.teamIds!.includes(membership.teamId) && membership.userId === user.id,
            )
          ) {
            return false;
          }
          if (
            query.teamId &&
            !query.teamIds?.length &&
            !db.teamMembers.some(
              (membership) => membership.teamId === query.teamId && membership.userId === user.id,
            )
          ) {
            return false;
          }
          if (search) {
            const haystack =
              `${user.email} ${user.firstName} ${user.lastName} ${user.phone ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          return true;
        });

        const start = (query.page - 1) * query.pageSize;
        const items = filtered.slice(start, start + query.pageSize).map((user) => ({
          ...user,
          organization:
            db.organizations.find((organization) => organization.id === user.organizationId) ??
            null,
          teamMemberships: db.teamMembers
            .filter((membership) => membership.userId === user.id)
            .map((membership) => ({
              team: db.teams.find((team) => team.id === membership.teamId)!,
            }))
            .filter((item) => item.team),
        }));

        return { items, total: filtered.length };
      },
    },
    session: {
      createSession: async (data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
        ipAddress: string | null;
        userAgent: string | null;
      }) => {
        const session: SessionRecord = {
          id: randomUUID(),
          ...data,
          createdAt: now(),
          updatedAt: now(),
        };
        db.sessions.push(session);
        return session;
      },
      findSessionByTokenHash: async (tokenHash: string) =>
        db.sessions.find((session) => session.tokenHash === tokenHash) ?? null,
      deleteSessionByTokenHash: async (tokenHash: string) => {
        db.sessions = db.sessions.filter((session) => session.tokenHash !== tokenHash);
      },
      deleteExpiredSessions: async () => {
        const current = now();
        db.sessions = db.sessions.filter((session) => session.expiresAt > current);
      },
      deleteSessionsByUserId: async (userId: string) => {
        db.sessions = db.sessions.filter((session) => session.userId !== userId);
      },
    },
    organization: {
      findOrganizationById: async (id: string) =>
        db.organizations.find((organization) => organization.id === id) ?? null,
      listOrganizations: async () =>
        [...db.organizations].sort((left, right) => left.name.localeCompare(right.name)),
      getSoleOrganizationId: async () => {
        const active = db.organizations.filter((organization) => organization.isActive);
        if (active.length === 1) {
          return active[0].id;
        }
        return db.organizations.length === 1 ? db.organizations[0].id : null;
      },
      getDefaultOrganizationId: async () => {
        const active = db.organizations.filter((organization) => organization.isActive);
        if (active.length === 1) {
          return active[0].id;
        }
        if (active.length > 1) {
          return [...active].sort(
            (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
          )[0].id;
        }
        if (db.organizations.length === 0) {
          return null;
        }
        return [...db.organizations].sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        )[0].id;
      },
      listOrganizationOverviews: async () =>
        [...db.organizations]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((organization) => memoryOrganizationOverview(db, organization)),
      findOrganizationOverviewById: async (id: string) => {
        const organization = db.organizations.find((item) => item.id === id);
        return organization ? memoryOrganizationOverview(db, organization) : null;
      },
      findOrganizationBySlug: async (slug: string, excludeId?: string) =>
        db.organizations.find(
          (organization) => organization.slug === slug && organization.id !== excludeId,
        ) ?? null,
      createOrganization: async (data: { name: string; slug: string }) => {
        const organization: OrganizationRecord = {
          id: randomUUID(),
          name: data.name,
          slug: data.slug,
          logoObjectKey: null,
          isActive: true,
          createdAt: now(),
          updatedAt: now(),
        };
        db.organizations.push(organization);
        return organization;
      },
      updateOrganization: async (
        id: string,
        data: Partial<Pick<OrganizationRecord, "name" | "slug" | "isActive" | "logoObjectKey">>,
      ) => {
        const organization = db.organizations.find((item) => item.id === id);
        if (!organization) {
          throw new Error("Organization not found");
        }
        Object.assign(organization, data, { updatedAt: now() });
        return organization;
      },
    },
    team: {
      findTeamById: async (id: string) => db.teams.find((team) => team.id === id) ?? null,
      findTeamByOrganizationAndName: async (organizationId: string, name: string) =>
        db.teams.find((team) => team.organizationId === organizationId && team.name === name) ??
        null,
      listTeams: async (query: {
        search?: string;
        isActive?: boolean;
        organizationId?: string;
        memberUserId?: string;
        createdById?: string;
        page: number;
        pageSize: number;
      }) => {
        const search = query.search?.toLowerCase();
        const filtered = db.teams.filter((team) => {
          if (query.organizationId && team.organizationId !== query.organizationId) {
            return false;
          }
          if (query.isActive !== undefined && team.isActive !== query.isActive) {
            return false;
          }
          if (query.createdById && team.createdById !== query.createdById) {
            return false;
          }
          if (
            query.memberUserId &&
            !query.createdById &&
            !db.teamMembers.some(
              (membership) =>
                membership.teamId === team.id && membership.userId === query.memberUserId,
            )
          ) {
            return false;
          }
          if (search && !team.name.toLowerCase().includes(search)) {
            return false;
          }
          return true;
        });

        const start = (query.page - 1) * query.pageSize;
        const items = filtered.slice(start, start + query.pageSize).map((team) => ({
          ...team,
          organization:
            db.organizations.find((organization) => organization.id === team.organizationId) ??
            null,
          _count: {
            members: db.teamMembers.filter((membership) => membership.teamId === team.id).length,
          },
        }));

        return { items, total: filtered.length };
      },
      countTeamMembers: async (teamId: string) =>
        db.teamMembers.filter((membership) => membership.teamId === teamId).length,
      countTeamAdmins: async (teamId: string) =>
        db.teamMembers.filter((membership) => {
          if (membership.teamId !== teamId) {
            return false;
          }
          return db.users.some((user) => user.id === membership.userId && user.role === "ADMIN");
        }).length,
      findTeamAdmin: async (teamId: string) => {
        const membership = db.teamMembers.find((item) => {
          if (item.teamId !== teamId) {
            return false;
          }
          return db.users.some((user) => user.id === item.userId && user.role === "ADMIN");
        });
        return membership
          ? (db.users.find((user) => user.id === membership.userId) ?? null)
          : null;
      },
      isTeamMember: async (teamId: string, userId: string) =>
        db.teamMembers.some((member) => member.teamId === teamId && member.userId === userId),
      createTeam: async (data: {
        organizationId: string;
        name: string;
        description?: string;
        createdById?: string;
      }) => {
        const team: TeamRecord = {
          id: randomUUID(),
          organizationId: data.organizationId,
          createdById: data.createdById ?? null,
          name: data.name,
          description: data.description ?? null,
          isActive: true,
          createdAt: now(),
          updatedAt: now(),
        };
        db.teams.push(team);
        return team;
      },
      updateTeam: async (
        id: string,
        data: Partial<Pick<TeamRecord, "name" | "description" | "isActive">>,
      ) => {
        const team = db.teams.find((item) => item.id === id);
        if (!team) {
          throw new Error("Team not found");
        }
        Object.assign(
          team,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          { updatedAt: now() },
        );
        return team;
      },
      addTeamMember: async (teamId: string, userId: string) => {
        if (db.teamMembers.some((membership) => membership.teamId === teamId && membership.userId === userId)) {
          return;
        }
        db.teamMembers.push({ teamId, userId });
      },
      removeTeamMember: async (teamId: string, userId: string) => {
        db.teamMembers = db.teamMembers.filter(
          (membership) => !(membership.teamId === teamId && membership.userId === userId),
        );
      },
      listTeamMembers: async (teamId: string) =>
        db.teamMembers
          .filter((membership) => membership.teamId === teamId)
          .map((membership) => db.users.find((user) => user.id === membership.userId))
          .filter((user): user is UserRecord => Boolean(user)),
      listTeamsForUser: async (userId: string) =>
        db.teamMembers
          .filter((membership) => membership.userId === userId)
          .map((membership) => db.teams.find((team) => team.id === membership.teamId))
          .filter((team): team is TeamRecord => Boolean(team)),
      listTeamsCreatedBy: async (userId: string) =>
        db.teams.filter((team) => team.createdById === userId),
    },
    customer: {
      findCustomerById: async (id: string) => {
        const customer = db.customers.find((item) => item.id === id);
        return customer ? hydrateCustomer(db, customer) : null;
      },
      listCustomers: async (query: {
        search?: string;
        isActive?: boolean;
        organizationId?: string;
        administratorId?: string;
        invoiceLifecycle?: "NEW" | "OLD";
        page: number;
        pageSize: number;
      }) => {
        const search = query.search?.toLowerCase();
        const filtered = db.customers.filter((customer) => {
          if (query.organizationId && customer.organizationId !== query.organizationId) {
            return false;
          }
          if (query.administratorId && customer.administratorId !== query.administratorId) {
            return false;
          }
          if (query.isActive !== undefined && customer.isActive !== query.isActive) {
            return false;
          }
          if (search) {
            const haystack =
              `${customer.name} ${customer.company ?? ""} ${customer.email ?? ""} ${customer.phone ?? ""} ${customer.taxNumber ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          const sentCount = db.invoices.filter(
            (invoice) => invoice.customerId === customer.id && invoice.emailStatus === "SENT",
          ).length;
          if (query.invoiceLifecycle === "OLD" && sentCount === 0) {
            return false;
          }
          if (query.invoiceLifecycle === "NEW" && sentCount > 0) {
            return false;
          }
          return true;
        });
        const baseFiltered = db.customers.filter((customer) => {
          if (query.organizationId && customer.organizationId !== query.organizationId) {
            return false;
          }
          if (query.administratorId && customer.administratorId !== query.administratorId) {
            return false;
          }
          if (query.isActive !== undefined && customer.isActive !== query.isActive) {
            return false;
          }
          if (search) {
            const haystack =
              `${customer.name} ${customer.company ?? ""} ${customer.email ?? ""} ${customer.phone ?? ""} ${customer.taxNumber ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          return true;
        });
        const old = baseFiltered.filter((customer) =>
          db.invoices.some(
            (invoice) => invoice.customerId === customer.id && invoice.emailStatus === "SENT",
          ),
        ).length;
        const start = (query.page - 1) * query.pageSize;
        return {
          items: filtered.slice(start, start + query.pageSize).map((customer) =>
            hydrateCustomer(db, customer),
          ),
          total: filtered.length,
          counts: {
            all: baseFiltered.length,
            old,
            new: Math.max(0, baseFiltered.length - old),
          },
        };
      },
      findLatestUnsentInvoicesByCustomerIds: async (customerIds: string[]) => {
        const map = new Map<
          string,
          { id: string; invoiceNumber: string; emailStatus: "NOT_SENT" | "FAILED" }
        >();
        for (const invoice of [...db.invoices].sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )) {
          if (!customerIds.includes(invoice.customerId)) {
            continue;
          }
          if (invoice.status === "CANCELLED") {
            continue;
          }
          if (invoice.emailStatus !== "NOT_SENT" && invoice.emailStatus !== "FAILED") {
            continue;
          }
          if (map.has(invoice.customerId)) {
            continue;
          }
          map.set(invoice.customerId, {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            emailStatus: invoice.emailStatus,
          });
        }
        return map;
      },
      createCustomer: async (data: {
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
      }) => {
        const billing = data.billingAddress ? createMemoryAddress(db, data.billingAddress) : null;
        const shipping = data.shippingAddress
          ? createMemoryAddress(db, data.shippingAddress)
          : null;
        const customer: MemoryCustomer = {
          id: randomUUID(),
          organizationId: data.organizationId,
          administratorId: data.administratorId ?? null,
          name: data.name,
          company: data.company ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          taxNumber: data.taxNumber ?? null,
          notes: data.notes ?? null,
          isActive: data.isActive ?? true,
          billingAddressId: billing?.id ?? null,
          shippingAddressId: shipping?.id ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        db.customers.push(customer);
        return hydrateCustomer(db, customer);
      },
      updateCustomer: async (
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
      ) => {
        const customer = db.customers.find((item) => item.id === id);
        if (!customer) {
          throw new Error("Customer not found");
        }
        if (data.billingAddress !== undefined) {
          customer.billingAddressId = applyAddressUpdate(
            db,
            customer.billingAddressId,
            data.billingAddress,
          );
        }
        if (data.shippingAddress !== undefined) {
          customer.shippingAddressId = applyAddressUpdate(
            db,
            customer.shippingAddressId,
            data.shippingAddress,
          );
        }
        Object.assign(
          customer,
          Object.fromEntries(
            Object.entries(data).filter(
              ([key, value]) =>
                value !== undefined && key !== "billingAddress" && key !== "shippingAddress",
            ),
          ),
          { updatedAt: now() },
        );
        return hydrateCustomer(db, customer);
      },
      deleteCustomer: async (id: string) => {
        const customer = db.customers.find((item) => item.id === id);
        db.customers = db.customers.filter((item) => item.id !== id);
        if (customer?.billingAddressId) {
          db.addresses = db.addresses.filter((address) => address.id !== customer.billingAddressId);
        }
        if (
          customer?.shippingAddressId &&
          customer.shippingAddressId !== customer.billingAddressId
        ) {
          db.addresses = db.addresses.filter(
            (address) => address.id !== customer.shippingAddressId,
          );
        }
      },
      countCustomerDocuments: async () => 0,
    },
    product: {
      findProductById: async (id: string) => {
        const product = db.products.find((item) => item.id === id);
        return product ? hydrateProduct(db, product) : null;
      },
      findProductByOrganizationAndSku: async (
        organizationId: string,
        sku: string,
        excludeId?: string,
      ) => {
        const product = db.products.find(
          (item) =>
            item.organizationId === organizationId &&
            item.sku === sku &&
            item.id !== excludeId,
        );
        return product ? hydrateProduct(db, product) : null;
      },
      listProducts: async (query: {
        search?: string;
        isActive?: boolean;
        kind?: CatalogKind;
        organizationId?: string;
        page: number;
        pageSize: number;
      }) => {
        const search = query.search?.toLowerCase();
        const filtered = db.products.filter((product) => {
          if (query.organizationId && product.organizationId !== query.organizationId) {
            return false;
          }
          if (query.isActive !== undefined && product.isActive !== query.isActive) {
            return false;
          }
          if (query.kind && product.kind !== query.kind) {
            return false;
          }
          if (search) {
            const haystack =
              `${product.name} ${product.description ?? ""} ${product.sku ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          return true;
        });
        const start = (query.page - 1) * query.pageSize;
        return {
          items: filtered.slice(start, start + query.pageSize).map((product) =>
            hydrateProduct(db, product),
          ),
          total: filtered.length,
        };
      },
      createProduct: async (data: {
        organizationId: string;
        kind: CatalogKind;
        name: string;
        description?: string | null;
        sku?: string | null;
        unit?: string | null;
        unitPrice: number;
        currency?: string;
        taxRate?: number | null;
        isActive?: boolean;
      }) => {
        const product: MemoryProduct = {
          id: randomUUID(),
          organizationId: data.organizationId,
          kind: data.kind,
          name: data.name,
          description: data.description ?? null,
          sku: data.sku ?? null,
          unit: data.unit ?? null,
          unitPrice: data.unitPrice,
          currency: data.currency ?? "USD",
          taxRate: data.taxRate ?? null,
          taxId: null,
          isActive: data.isActive ?? true,
          createdAt: now(),
          updatedAt: now(),
        };
        db.products.push(product);
        return hydrateProduct(db, product);
      },
      updateProduct: async (
        id: string,
        data: Partial<
          Pick<
            MemoryProduct,
            | "kind"
            | "name"
            | "description"
            | "sku"
            | "unit"
            | "unitPrice"
            | "currency"
            | "taxRate"
            | "isActive"
          >
        >,
      ) => {
        const product = db.products.find((item) => item.id === id);
        if (!product) {
          throw new Error("Product not found");
        }
        Object.assign(
          product,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          { updatedAt: now() },
        );
        return hydrateProduct(db, product);
      },
      deleteProduct: async (id: string) => {
        db.products = db.products.filter((item) => item.id !== id);
      },
      countProductDocuments: async () => 0,
    },
    invoice: createMemoryInvoiceRepos(db),
    payment: createMemoryPaymentRepos(db),
    dashboard: createMemoryDashboardRepos(db),
    expense: createMemoryExpenseRepos(db),
    report: createMemoryReportRepos(db),
    audit: {
      createAuditLog: async (data: Record<string, unknown>) => {
        db.auditLogs.push(data);
      },
    },
  };
}

function createMemoryAddress(db: MemoryDb, input: AddressInput): MemoryAddress {
  const address: MemoryAddress = {
    id: randomUUID(),
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country,
    createdAt: now(),
    updatedAt: now(),
  };
  db.addresses.push(address);
  return address;
}

function applyAddressUpdate(
  db: MemoryDb,
  existingId: string | null,
  input: AddressInput | null,
): string | null {
  if (input === null) {
    if (existingId) {
      db.addresses = db.addresses.filter((address) => address.id !== existingId);
    }
    return null;
  }
  if (existingId) {
    const existing = db.addresses.find((address) => address.id === existingId);
    if (existing) {
      existing.line1 = input.line1;
      existing.line2 = input.line2 ?? null;
      existing.city = input.city;
      existing.region = input.region ?? null;
      existing.postalCode = input.postalCode ?? null;
      existing.country = input.country;
      existing.updatedAt = now();
      return existing.id;
    }
  }
  return createMemoryAddress(db, input).id;
}

function hydrateCustomer(db: MemoryDb, customer: MemoryCustomer) {
  const sentCount = db.invoices.filter(
    (invoice) => invoice.customerId === customer.id && invoice.emailStatus === "SENT",
  ).length;
  return {
    ...customer,
    billingAddress:
      db.addresses.find((address) => address.id === customer.billingAddressId) ?? null,
    shippingAddress:
      db.addresses.find((address) => address.id === customer.shippingAddressId) ?? null,
    organization:
      db.organizations.find((organization) => organization.id === customer.organizationId) ??
      null,
    _count: { invoices: sentCount },
  };
}

function hydrateProduct(db: MemoryDb, product: MemoryProduct) {
  return {
    ...product,
    organization:
      db.organizations.find((organization) => organization.id === product.organizationId) ??
      null,
  };
}

export function seedUser(
  db: MemoryDb,
  data: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    role: UserRole;
    status?: AccountStatus;
    organizationId?: string | null;
  },
): UserRecord {
  const user: UserRecord = {
    id: randomUUID(),
    email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    firstName: data.firstName ?? "Test",
    lastName: data.lastName ?? "User",
    phone: data.phone ?? null,
    avatarObjectKey: null,
    role: data.role,
    status: data.status ?? "ACTIVE",
    organizationId: data.organizationId ?? null,
    administratorId: null,
    lastLoginAt: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: now(),
    updatedAt: now(),
  };
  db.users.push(user);
  return user;
}

export function seedOrganization(
  db: MemoryDb,
  data: { name: string; slug: string },
): OrganizationRecord {
  const organization: OrganizationRecord = {
    id: randomUUID(),
    name: data.name,
    slug: data.slug,
    logoObjectKey: null,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
  };
  db.organizations.push(organization);
  return organization;
}

export function seedTeam(
  db: MemoryDb,
  data: { organizationId: string; name: string; createdById?: string },
): TeamRecord {
  const team: TeamRecord = {
    id: randomUUID(),
    organizationId: data.organizationId,
    createdById: data.createdById ?? null,
    name: data.name,
    description: null,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
  };
  db.teams.push(team);
  return team;
}

function createMemoryInvoiceRepos(db: MemoryDb) {
  return {
    findInvoiceById: async (id: string) => {
      const invoice = db.invoices.find((item) => item.id === id);
      return invoice ? hydrateInvoice(db, invoice) : null;
    },
    findInvoiceByShareToken: async (token: string) => {
      const invoice = db.invoices.find((item) => item.shareToken === token);
      return invoice ? hydrateInvoice(db, invoice) : null;
    },
    findInvoiceByOrganizationAndNumber: async (organizationId: string, invoiceNumber: string) => {
      const invoice = db.invoices.find(
        (item) => item.organizationId === organizationId && item.invoiceNumber === invoiceNumber,
      );
      return invoice ? hydrateInvoice(db, invoice) : null;
    },
    findLatestInvoiceNumber: async (organizationId: string, prefix: string) => {
      let max = 0;
      let latest: string | null = null;
      for (const invoice of db.invoices) {
        if (invoice.organizationId !== organizationId || !invoice.invoiceNumber.startsWith(prefix)) {
          continue;
        }
        const value = Number(invoice.invoiceNumber.slice(prefix.length));
        if (Number.isFinite(value) && value >= max) {
          max = value;
          latest = invoice.invoiceNumber;
        }
      }
      return latest;
    },
    listInvoices: async (query: {
      search?: string;
      status?: InvoiceStatus;
      overdue?: boolean;
      customerId?: string;
      organizationId?: string;
      createdById?: string;
      assignedMemberId?: string;
      assignedTeamIds?: string[];
      includeUnassigned?: boolean;
      assignedTeamId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      sort?: "invoiceDate" | "dueDate" | "total" | "invoiceNumber" | "createdAt";
      sortDir?: "asc" | "desc";
      page: number;
      pageSize: number;
      now?: Date;
    }) => {
      const search = query.search?.toLowerCase();
      const now = query.now ?? new Date();
      const filtered = db.invoices.filter((invoice) => {
        if (query.organizationId && invoice.organizationId !== query.organizationId) {
          return false;
        }
        if (query.customerId && invoice.customerId !== query.customerId) {
          return false;
        }
        if (query.dateFrom && invoice.invoiceDate < query.dateFrom) {
          return false;
        }
        if (query.dateTo && invoice.invoiceDate > query.dateTo) {
          return false;
        }
        if (query.overdue) {
          const overdueCutoff = startOfUtcDay(now);
          if (
            ["DRAFT", "CANCELLED", "PAID"].includes(invoice.status) ||
            invoice.dueDate >= overdueCutoff
          ) {
            return false;
          }
        } else if (query.status && invoice.status !== query.status) {
          return false;
        }
        if (query.assignedTeamId && invoice.assignedTeamId !== query.assignedTeamId) {
          return false;
        }
        if (query.createdById || query.assignedMemberId || query.assignedTeamIds || query.includeUnassigned) {
          const allowed =
            invoice.createdById === query.createdById ||
            invoice.assignedMemberId === query.assignedMemberId ||
            (invoice.assignedTeamId && query.assignedTeamIds?.includes(invoice.assignedTeamId)) ||
            Boolean(query.includeUnassigned && invoice.assignedTeamId === null);
          if (!allowed) {
            return false;
          }
        }
        if (search) {
          const customer = db.customers.find((item) => item.id === invoice.customerId);
          const haystack =
            `${invoice.invoiceNumber} ${customer?.name ?? ""} ${customer?.company ?? ""}`.toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }
        return true;
      });

      const sort = query.sort ?? "createdAt";
      const direction = query.sortDir === "asc" ? 1 : -1;
      filtered.sort((left, right) => {
        const leftValue = left[sort];
        const rightValue = right[sort];
        if (leftValue < rightValue) return -1 * direction;
        if (leftValue > rightValue) return 1 * direction;
        return 0;
      });

      const start = (query.page - 1) * query.pageSize;
      return {
        items: filtered.slice(start, start + query.pageSize).map((invoice) =>
          hydrateInvoice(db, invoice),
        ),
        total: filtered.length,
      };
    },
    createInvoice: async (data: {
      organizationId: string;
      customerId: string;
      createdById: string;
      assignedTeamId?: string | null;
      assignedMemberId?: string | null;
      invoiceNumber: string;
      invoiceDate: Date;
      dueDate: Date;
      currency: string;
      subtotal: string;
      discountAmount: string;
      taxAmount: string;
      total: string;
      notes?: string | null;
      terms?: string | null;
      billingAddress?: AddressInput | null;
      shippingAddress?: AddressInput | null;
      items: Array<{
        productId?: string | null;
        catalogKind?: CatalogKind | null;
        sku?: string | null;
        unit?: string | null;
        description: string;
        quantity: string;
        unitPrice: string;
        discount: string;
        taxRate?: string | null;
        taxAmount: string;
        lineTotal: string;
        sortOrder: number;
      }>;
    }) => {
      const billing = data.billingAddress ? createMemoryAddress(db, data.billingAddress) : null;
      const shipping = data.shippingAddress ? createMemoryAddress(db, data.shippingAddress) : null;
      const invoice: MemoryInvoice = {
        id: randomUUID(),
        organizationId: data.organizationId,
        customerId: data.customerId,
        createdById: data.createdById,
        assignedTeamId: data.assignedTeamId ?? null,
        assignedMemberId: data.assignedMemberId ?? null,
        invoiceNumber: data.invoiceNumber,
        status: "DRAFT",
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        currency: data.currency,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
        amountPaid: "0.0000",
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        billingAddressId: billing?.id ?? null,
        shippingAddressId: shipping?.id ?? null,
        shareToken: null,
        pdfObjectKey: null,
        emailStatus: "NOT_SENT",
        emailSentAt: null,
        emailLastError: null,
        sentAt: null,
        viewedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.invoices.push(invoice);
      for (const item of data.items) {
        db.invoiceItems.push({
          id: randomUUID(),
          invoiceId: invoice.id,
          productId: item.productId ?? null,
          serviceId: null,
          taxId: null,
          catalogKind: item.catalogKind ?? null,
          sku: item.sku ?? null,
          unit: item.unit ?? null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxRate: item.taxRate ?? null,
          taxAmount: item.taxAmount,
          lineTotal: item.lineTotal,
          sortOrder: item.sortOrder,
          createdAt: now(),
          updatedAt: now(),
        });
      }
      return hydrateInvoice(db, invoice);
    },
    updateInvoice: async (
      id: string,
      data: Partial<MemoryInvoice> & {
        billingAddress?: AddressInput | null;
        shippingAddress?: AddressInput | null;
        items?: Array<{
          productId?: string | null;
          catalogKind?: CatalogKind | null;
          sku?: string | null;
          unit?: string | null;
          description: string;
          quantity: string;
          unitPrice: string;
          discount: string;
          taxRate?: string | null;
          taxAmount: string;
          lineTotal: string;
          sortOrder: number;
        }>;
      },
    ) => {
      const invoice = db.invoices.find((item) => item.id === id);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      if (data.billingAddress !== undefined) {
        invoice.billingAddressId = applyAddressUpdate(
          db,
          invoice.billingAddressId,
          data.billingAddress,
        );
      }
      if (data.shippingAddress !== undefined) {
        invoice.shippingAddressId = applyAddressUpdate(
          db,
          invoice.shippingAddressId,
          data.shippingAddress,
        );
      }
      if (data.items) {
        db.invoiceItems = db.invoiceItems.filter((item) => item.invoiceId !== id);
        for (const item of data.items) {
          db.invoiceItems.push({
            id: randomUUID(),
            invoiceId: id,
            productId: item.productId ?? null,
            serviceId: null,
            taxId: null,
            catalogKind: item.catalogKind ?? null,
            sku: item.sku ?? null,
            unit: item.unit ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxRate: item.taxRate ?? null,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
            createdAt: now(),
            updatedAt: now(),
          });
        }
      }
      Object.assign(
        invoice,
        Object.fromEntries(
          Object.entries(data).filter(
            ([key, value]) =>
              value !== undefined &&
              key !== "items" &&
              key !== "billingAddress" &&
              key !== "shippingAddress",
          ),
        ),
        { updatedAt: now() },
      );
      return hydrateInvoice(db, invoice);
    },
    deleteInvoice: async (id: string) => {
      db.invoices = db.invoices.filter((invoice) => invoice.id !== id);
      db.invoiceItems = db.invoiceItems.filter((item) => item.invoiceId !== id);
    },
  };
}

function createMemoryPaymentRepos(db: MemoryDb) {
  return {
    findPaymentById: async (id: string) => {
      const payment = db.payments.find((item) => item.id === id);
      return payment ? hydratePayment(db, payment) : null;
    },
    listPayments: async (query: {
      search?: string;
      status?: string;
      customerId?: string;
      invoiceId?: string;
      organizationId?: string;
      invoiceIds?: string[];
      assignedTeamId?: string;
      invoiceAccess?: {
        createdById?: string;
        assignedMemberId?: string;
        assignedTeamIds: string[];
        includeUnassigned?: boolean;
      };
      dateFrom?: Date;
      dateTo?: Date;
      page: number;
      pageSize: number;
    }) => {
      let items = db.payments.filter((payment) => {
        if (query.organizationId && payment.organizationId !== query.organizationId) {
          return false;
        }
        if (query.customerId && payment.customerId !== query.customerId) {
          return false;
        }
        if (query.invoiceId && payment.invoiceId !== query.invoiceId) {
          return false;
        }
        if (query.invoiceIds && !query.invoiceIds.includes(payment.invoiceId as string)) {
          return false;
        }
        if (query.assignedTeamId) {
          const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
          if (!invoice || invoice.assignedTeamId !== query.assignedTeamId) {
            return false;
          }
        }
        if (query.invoiceAccess) {
          const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
          if (!invoice) {
            return false;
          }
          const allowed =
            invoice.createdById === query.invoiceAccess.createdById ||
            invoice.assignedMemberId === query.invoiceAccess.assignedMemberId ||
            (invoice.assignedTeamId !== null &&
              query.invoiceAccess.assignedTeamIds.includes(invoice.assignedTeamId)) ||
            Boolean(query.invoiceAccess.includeUnassigned && invoice.assignedTeamId === null);
          if (!allowed) {
            return false;
          }
        }
        if (query.status && payment.status !== query.status) {
          return false;
        }
        if (query.dateFrom && payment.paidAt && (payment.paidAt as Date) < query.dateFrom) {
          return false;
        }
        if (query.dateTo && payment.paidAt && (payment.paidAt as Date) > query.dateTo) {
          return false;
        }
        return true;
      });
      if (query.search) {
        const term = query.search.toLowerCase();
        items = items.filter((payment) => {
          const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
          const customer = db.customers.find((item) => item.id === payment.customerId);
          return (
            String(payment.providerTransactionId ?? "").toLowerCase().includes(term) ||
            String(payment.notes ?? "").toLowerCase().includes(term) ||
            (invoice?.invoiceNumber ?? "").toLowerCase().includes(term) ||
            (customer?.name ?? "").toLowerCase().includes(term)
          );
        });
      }
      const total = items.length;
      const pageItems = items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
      return { items: pageItems.map((payment) => hydratePayment(db, payment)), total };
    },
    listInvoicePayments: async (invoiceId: string) =>
      db.payments
        .filter((payment) => payment.invoiceId === invoiceId)
        .map((payment) => hydratePayment(db, payment)),
    sumCompletedInvoicePayments: async (invoiceId: string) => {
      const total = db.payments
        .filter((payment) => payment.invoiceId === invoiceId && payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      return total.toFixed(4);
    },
    createCompletedPayment: async (data: Record<string, unknown>) => {
      const created = {
        id: randomUUID(),
        ...data,
        status: "COMPLETED",
        createdAt: now(),
        updatedAt: now(),
      };
      db.payments.push(created);
      return hydratePayment(db, created);
    },
    recordCompletedPaymentAndSettleInvoice: async (data: Record<string, unknown>) => {
      const invoice = db.invoices.find((item) => item.id === data.invoiceId);
      if (!invoice) {
        throw new ValidationError("Invoice not found");
      }
      const recordedPaid = db.payments
        .filter((payment) => payment.invoiceId === data.invoiceId && payment.status === "COMPLETED")
        .reduce((sum, payment) => sum.plus(String(payment.amount)), money(0));
      const nextPaid = recordedPaid.plus(String(data.amount));
      const total = money(invoice.total);
      if (nextPaid.gt(total)) {
        throw new ValidationError("Payment exceeds the invoice balance");
      }
      const created = {
        id: randomUUID(),
        ...data,
        status: "COMPLETED",
        createdAt: now(),
        updatedAt: now(),
      };
      db.payments.push(created);
      invoice.amountPaid = moneyString(nextPaid);
      invoice.status = nextPaid.gte(total) ? "PAID" : "PARTIALLY_PAID";
      invoice.updatedAt = now();
      return {
        payment: hydratePayment(db, created),
        amountPaid: invoice.amountPaid,
        status: invoice.status,
      };
    },
  };
}

function hydrateInvoice(db: MemoryDb, invoice: MemoryInvoice) {
  const customer = db.customers.find((item) => item.id === invoice.customerId);
  if (!customer) {
    throw new Error("Invoice customer not found");
  }
  const createdBy = db.users.find((user) => user.id === invoice.createdById);
  if (!createdBy) {
    throw new Error("Invoice creator not found");
  }
  return {
    ...invoice,
    organization:
      db.organizations.find((organization) => organization.id === invoice.organizationId) ??
      null,
    customer,
    createdBy,
    assignedTeam: invoice.assignedTeamId
      ? db.teams.find((team) => team.id === invoice.assignedTeamId) ?? null
      : null,
    assignedMember: invoice.assignedMemberId
      ? db.users.find((user) => user.id === invoice.assignedMemberId) ?? null
      : null,
    billingAddress:
      db.addresses.find((address) => address.id === invoice.billingAddressId) ?? null,
    shippingAddress:
      db.addresses.find((address) => address.id === invoice.shippingAddressId) ?? null,
    items: db.invoiceItems.filter((item) => item.invoiceId === invoice.id),
    payments: db.payments
      .filter((payment) => payment.invoiceId === invoice.id)
      .map((payment) => hydratePayment(db, payment)),
  };
}

function hydratePayment(db: MemoryDb, payment: Record<string, unknown>) {
  const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
  const customer = db.customers.find((item) => item.id === payment.customerId);
  const recordedBy = db.users.find((user) => user.id === payment.recordedById);
  if (!invoice || !customer || !recordedBy) {
    throw new Error("Payment relations not found");
  }
  return {
    ...payment,
    amount: {
      toString: () => String(payment.amount),
    },
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber },
    customer: { id: customer.id, name: customer.name, company: customer.company },
    recordedBy: {
      id: recordedBy.id,
      firstName: recordedBy.firstName,
      lastName: recordedBy.lastName,
      email: recordedBy.email,
    },
  };
}

function createMemoryDashboardRepos(db: MemoryDb) {
  return {
    loadDashboardSnapshot: async (scope: DashboardQueryScope, now = new Date()) => {
      const range = scope.range ?? resolveDateRange("this_year", undefined, undefined, now);
      const accessible = db.invoices.filter((invoice) => invoiceMatchesScope(invoice, scope));
      const invoices = accessible.filter(
        (invoice) => invoice.invoiceDate >= range.start && invoice.invoiceDate < range.end,
      );
      const invoiceIds = new Set(accessible.map((invoice) => invoice.id));
      const payments = db.payments.filter((payment) => {
        if (payment.status !== "COMPLETED") {
          return false;
        }
        const paidAt = payment.paidAt as Date | undefined;
        if (!paidAt || paidAt < range.start || paidAt >= range.end) {
          return false;
        }
        if (scope.organizationId && payment.organizationId !== scope.organizationId) {
          return false;
        }
        return !scope.invoiceAccess || invoiceIds.has(String(payment.invoiceId));
      });
      const expenses = db.expenses.filter((expense) => {
        const incurredOn = expense.incurredOn as Date | undefined;
        if (!incurredOn || incurredOn < range.start || incurredOn >= range.end) {
          return false;
        }
        return !scope.organizationId || expense.organizationId === scope.organizationId;
      });
      const today = startOfUtcDay(now);
      const overdue = invoices.filter(
        (invoice) =>
          !["DRAFT", "CANCELLED", "PAID"].includes(invoice.status) && invoice.dueDate < today,
      );
      const outstanding = invoices.filter(
        (invoice) => !["DRAFT", "CANCELLED"].includes(invoice.status),
      );
      const outstandingTotal = outstanding.reduce(
        (sum, invoice) => sum.plus(invoice.total),
        money(0),
      );
      const outstandingPaid = outstanding.reduce(
        (sum, invoice) => sum.plus(invoice.amountPaid),
        money(0),
      );
      const overdueTotal = overdue.reduce((sum, invoice) => sum.plus(invoice.total), money(0));
      const overduePaid = overdue.reduce((sum, invoice) => sum.plus(invoice.amountPaid), money(0));
      const revenue = payments.reduce((sum, payment) => sum.plus(String(payment.amount)), money(0));
      const currency = invoices[0]?.currency ?? accessible[0]?.currency ?? "USD";
      const daily = rangeDayCount(range) <= 31;
      const revenueSeries = buildMemoryMoneySeries(
        payments.map((payment) => ({
          amount: String(payment.amount),
          currency: String(payment.currency ?? currency),
          at: payment.paidAt as Date | undefined,
        })),
        range,
        daily,
        currency,
      );
      const expenseSeries = buildMemoryMoneySeries(
        expenses.map((expense) => ({
          amount: String(expense.amount),
          currency: String(expense.currency ?? currency),
          at: expense.incurredOn as Date | undefined,
        })),
        range,
        daily,
        currency,
      );

      const toSummary = (invoice: MemoryInvoice) => {
        const customer = db.customers.find((item) => item.id === invoice.customerId);
        const organization = db.organizations.find((item) => item.id === invoice.organizationId);
        const total = moneyString(invoice.total);
        const amountPaid = moneyString(invoice.amountPaid);
        const status = deriveInvoiceStatus({
          storedStatus: invoice.status,
          total,
          amountPaid,
          dueDate: invoice.dueDate,
          now,
        });
        const balance = money(total).minus(amountPaid);
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status,
          paymentStatus: derivePaymentStatus(total, amountPaid, status),
          total,
          amountPaid,
          balanceDue: moneyString(balance.lt(0) ? 0 : balance),
          dueDate: invoice.dueDate.toISOString(),
          currency: invoice.currency,
          customerName: customer?.name ?? "",
          organizationName: organization?.name ?? null,
        };
      };

      const customerGroups = new Map<
        string,
        { count: number; total: ReturnType<typeof money>; paid: ReturnType<typeof money> }
      >();
      const teamGroups = new Map<
        string | null,
        { count: number; total: ReturnType<typeof money>; paid: ReturnType<typeof money> }
      >();
      const organizationGroups = new Map<
        string,
        { count: number; paid: ReturnType<typeof money> }
      >();
      for (const invoice of invoices) {
        const customer = customerGroups.get(invoice.customerId) ?? {
          count: 0,
          total: money(0),
          paid: money(0),
        };
        customer.count += 1;
        customer.total = customer.total.plus(invoice.total);
        customer.paid = customer.paid.plus(invoice.amountPaid);
        customerGroups.set(invoice.customerId, customer);

        const team = teamGroups.get(invoice.assignedTeamId) ?? {
          count: 0,
          total: money(0),
          paid: money(0),
        };
        team.count += 1;
        team.total = team.total.plus(invoice.total);
        team.paid = team.paid.plus(invoice.amountPaid);
        teamGroups.set(invoice.assignedTeamId, team);

        const organization = organizationGroups.get(invoice.organizationId) ?? {
          count: 0,
          paid: money(0),
        };
        organization.count += 1;
        organization.paid = organization.paid.plus(invoice.amountPaid);
        organizationGroups.set(invoice.organizationId, organization);
      }

      return {
        organizationCount: scope.organizationId
          ? db.organizations.filter((organization) => organization.id === scope.organizationId).length
          : db.organizations.length,
        adminCount: db.users.filter(
          (user) =>
            user.role === "ADMIN" &&
            (!scope.organizationId || user.organizationId === scope.organizationId),
        ).length,
        memberCount: db.users.filter(
          (user) =>
            user.role === "MEMBER" &&
            (!scope.organizationId || user.organizationId === scope.organizationId),
        ).length,
        teamCount: db.teams.filter(
          (team) => !scope.organizationId || team.organizationId === scope.organizationId,
        ).length,
        customerCount: scope.invoiceAccess
          ? new Set(invoices.map((invoice) => invoice.customerId)).size
          : db.customers.filter(
              (customer) => !scope.organizationId || customer.organizationId === scope.organizationId,
            ).length,
        invoiceCount: invoices.length,
        paidInvoiceCount: invoices.filter((invoice) => invoice.status === "PAID").length,
        unpaidInvoiceCount: invoices.filter(
          (invoice) => invoice.status !== "PAID" && invoice.status !== "CANCELLED",
        ).length,
        overdueInvoiceCount: overdue.length,
        partiallyPaidInvoiceCount: invoices.filter((invoice) => invoice.status === "PARTIALLY_PAID")
          .length,
        expenseTotal: moneyString(
          expenses.reduce((sum, expense) => sum.plus(String(expense.amount)), money(0)),
        ),
        revenue: moneyString(revenue),
        paidAmount: moneyString(revenue),
        outstandingBalance: moneyString(outstandingTotal.minus(outstandingPaid)),
        overdueAmount: moneyString(overdueTotal.minus(overduePaid)),
        draftInvoiceCount: invoices.filter((invoice) => invoice.status === "DRAFT").length,
        sentInvoiceCount: invoices.filter((invoice) => invoice.status === "SENT").length,
        viewedInvoiceCount: invoices.filter(
          (invoice) => invoice.status === "VIEWED" && invoice.dueDate >= today,
        ).length,
        cancelledInvoiceCount: invoices.filter((invoice) => invoice.status === "CANCELLED").length,
        failedEmailCount: invoices.filter((invoice) => invoice.emailStatus === "FAILED").length,
        adminsWithoutMembers: db.users.filter(
          (user) =>
            user.role === "ADMIN" &&
            (!scope.organizationId || user.organizationId === scope.organizationId) &&
            !db.users.some((member) => member.role === "MEMBER" && member.administratorId === user.id),
        ).length,
        currency,
        currencies: [...new Set(invoices.map((invoice) => invoice.currency).filter(Boolean))],
        granularity: daily ? "day" : "month",
        statusCounts: [
          { status: "DRAFT", count: invoices.filter((invoice) => invoice.status === "DRAFT").length },
          { status: "SENT", count: invoices.filter((invoice) => invoice.status === "SENT").length },
          { status: "VIEWED", count: invoices.filter((invoice) => invoice.status === "VIEWED").length },
          { status: "PAID", count: invoices.filter((invoice) => invoice.status === "PAID").length },
          { status: "OVERDUE", count: overdue.length },
          {
            status: "CANCELLED",
            count: invoices.filter((invoice) => invoice.status === "CANCELLED").length,
          },
        ],
        revenueSeries,
        invoiceCountSeries: buildMemoryCountSeries(
          invoices.map((invoice) => invoice.invoiceDate),
          range,
          daily,
        ),
        invoiceCreatedSeries: buildMemoryCountSeries(
          invoices.map((invoice) => invoice.createdAt),
          range,
          daily,
        ),
        invoiceSentSeries: buildMemoryCountSeries(
          invoices
            .map((invoice) => invoice.sentAt)
            .filter((value): value is Date => value instanceof Date),
          range,
          daily,
        ),
        invoicePaidSeries: buildMemoryCountSeries(
          invoices.filter((invoice) => invoice.status === "PAID").map((invoice) => invoice.updatedAt),
          range,
          daily,
        ),
        paymentSeries: revenueSeries,
        expenseSeries,
        revenueByCurrency: [
          {
            currency,
            amount: moneyString(revenue),
          },
        ],
        outstandingByCurrency: [
          {
            currency,
            amount: moneyString(outstandingTotal.minus(outstandingPaid)),
          },
        ],
        overdueByCurrency: [
          {
            currency,
            amount: moneyString(overdueTotal.minus(overduePaid)),
          },
        ],
        emailDelivery: {
          sent: invoices.filter((invoice) => invoice.emailStatus === "SENT").length,
          failed: invoices.filter((invoice) => invoice.emailStatus === "FAILED").length,
          notSent: invoices.filter((invoice) => invoice.emailStatus === "NOT_SENT").length,
        },
        teamPerformance: [...teamGroups.entries()]
          .map(([teamId, group]) => ({
            teamId,
            teamName: teamId
              ? (db.teams.find((team) => team.id === teamId)?.name ?? "Team")
              : "Unassigned",
            invoiceCount: group.count,
            revenue: moneyString(group.paid),
            outstanding: moneyString(group.total.minus(group.paid)),
          }))
          .sort((left, right) => money(right.revenue).comparedTo(money(left.revenue))),
        topCustomers: [...customerGroups.entries()]
          .sort((left, right) => right[1].total.comparedTo(left[1].total))
          .slice(0, 8)
          .map(([customerId, group]) => ({
            customerId,
            customerName: db.customers.find((item) => item.id === customerId)?.name ?? "Customer",
            invoiceCount: group.count,
            total: moneyString(group.total),
            paid: moneyString(group.paid),
            outstanding: moneyString(group.total.minus(group.paid)),
          })),
        organizationActivity: [...organizationGroups.entries()]
          .sort((left, right) => right[1].paid.comparedTo(left[1].paid))
          .slice(0, 8)
          .map(([organizationId, group]) => ({
            organizationId,
            organizationName:
              db.organizations.find((item) => item.id === organizationId)?.name ?? "Organization",
            invoiceCount: group.count,
            revenue: moneyString(group.paid),
          })),
        administratorOverview: db.users
          .filter(
            (user) =>
              user.role === "ADMIN" &&
              (!scope.organizationId || user.organizationId === scope.organizationId),
          )
          .map((admin) => {
            const related = invoices.filter(
              (invoice) =>
                invoice.createdById === admin.id ||
                db.users.some(
                  (member) =>
                    member.administratorId === admin.id && member.id === invoice.assignedMemberId,
                ),
            );
            const paid = related.reduce((sum, invoice) => sum.plus(invoice.amountPaid), money(0));
            const total = related.reduce((sum, invoice) => sum.plus(invoice.total), money(0));
            return {
              administratorId: admin.id,
              administratorName: `${admin.firstName} ${admin.lastName}`.trim(),
              status: admin.status,
              memberCount: db.users.filter(
                (member) => member.role === "MEMBER" && member.administratorId === admin.id,
              ).length,
              customerCount: db.customers.filter((customer) => customer.administratorId === admin.id)
                .length,
              invoiceCount: related.length,
              paidInvoiceCount: related.filter((invoice) => invoice.status === "PAID").length,
              revenue: moneyString(paid),
              outstanding: moneyString(total.minus(paid)),
              currency,
            };
          }),
        recentCustomers: [...db.customers]
          .filter((customer) => !scope.organizationId || customer.organizationId === scope.organizationId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, 5)
          .map((customer) => {
            const related = invoices.filter((invoice) => invoice.customerId === customer.id);
            const paid = related.reduce((sum, invoice) => sum.plus(invoice.amountPaid), money(0));
            return {
              customerId: customer.id,
              customerName: customer.name,
              createdAt: customer.createdAt.toISOString(),
              invoiceCount: related.length,
              paid: moneyString(paid),
              currency,
            };
          }),
        recentInvoices: [...invoices]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, 5)
          .map(toSummary),
        recentPayments: [...payments]
          .sort((left, right) => {
            const leftDate = (left.paidAt as Date | undefined)?.getTime() ?? 0;
            const rightDate = (right.paidAt as Date | undefined)?.getTime() ?? 0;
            return rightDate - leftDate;
          })
          .slice(0, 5)
          .map((payment) => {
            const invoice = db.invoices.find((item) => item.id === payment.invoiceId);
            const customer = db.customers.find((item) => item.id === payment.customerId);
            const organization = db.organizations.find(
              (item) => item.id === payment.organizationId,
            );
            return {
              id: String(payment.id),
              amount: moneyString(String(payment.amount)),
              currency: String(payment.currency ?? currency),
              paidAt: (payment.paidAt as Date | undefined)?.toISOString() ?? null,
              invoiceId: String(payment.invoiceId),
              invoiceNumber: invoice?.invoiceNumber ?? "",
              customerName: customer?.name ?? "",
              organizationName: organization?.name ?? null,
            };
          }),
        overdueInvoices: [...overdue]
          .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
          .slice(0, 5)
          .map(toSummary),
        organizations: db.organizations
          .map((organization) => ({ id: organization.id, name: organization.name }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    },
  };
}

function buildMemoryMoneySeries(
  rows: Array<{ amount: string; currency: string; at?: Date }>,
  range: DateRange,
  daily: boolean,
  currency: string,
) {
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const key of periodKeys(range, daily)) {
    buckets.set(key, money(0));
  }
  for (const row of rows) {
    if (!row.at || row.currency !== currency) {
      continue;
    }
    const key = periodKey(row.at, daily);
    const current = buckets.get(key);
    if (current) {
      buckets.set(key, current.plus(row.amount));
    }
  }
  return [...buckets.entries()].map(([period, amount]) => ({
    period,
    amount: moneyString(amount),
  }));
}

function buildMemoryCountSeries(dates: Date[], range: DateRange, daily: boolean) {
  const buckets = new Map<string, number>();
  for (const key of periodKeys(range, daily)) {
    buckets.set(key, 0);
  }
  for (const at of dates) {
    const key = periodKey(at, daily);
    const current = buckets.get(key);
    if (current !== undefined) {
      buckets.set(key, current + 1);
    }
  }
  return [...buckets.entries()].map(([period, count]) => ({
    period,
    amount: String(count),
  }));
}

function invoiceMatchesScope(invoice: MemoryInvoice, scope: DashboardQueryScope): boolean {
  if (scope.organizationId && invoice.organizationId !== scope.organizationId) {
    return false;
  }
  if (scope.assignedTeamId && invoice.assignedTeamId !== scope.assignedTeamId) {
    return false;
  }
  if (!scope.invoiceAccess) {
    return true;
  }
  return (
    invoice.createdById === scope.invoiceAccess.createdById ||
    invoice.assignedMemberId === scope.invoiceAccess.assignedMemberId ||
    (invoice.assignedTeamId !== null &&
      scope.invoiceAccess.assignedTeamIds.includes(invoice.assignedTeamId)) ||
    Boolean(scope.invoiceAccess.includeUnassigned && invoice.assignedTeamId === null)
  );
}

function invoiceMatchesReportScope(invoice: MemoryInvoice, scope: ReportQueryScope): boolean {
  if (scope.organizationId && invoice.organizationId !== scope.organizationId) {
    return false;
  }
  if (scope.assignedTeamId && invoice.assignedTeamId !== scope.assignedTeamId) {
    return false;
  }
  if (!scope.createdById && !scope.assignedMemberId && !scope.assignedTeamIds) {
    return true;
  }
  return (
    invoice.createdById === scope.createdById ||
    invoice.assignedMemberId === scope.assignedMemberId ||
    (invoice.assignedTeamId !== null &&
      (scope.assignedTeamIds ?? []).includes(invoice.assignedTeamId)) ||
    Boolean(scope.includeUnassigned && invoice.assignedTeamId === null)
  );
}

function createMemoryExpenseRepos(db: MemoryDb) {
  return {
    findOrCreateExpenseCategory: async (organizationId: string, name: string) => {
      const existing = db.expenseCategories.find(
        (category) => category.organizationId === organizationId && category.name === name,
      );
      if (existing) {
        return existing;
      }
      const created = { id: randomUUID(), organizationId, name };
      db.expenseCategories.push(created);
      return created;
    },
    createExpense: async (data: Record<string, unknown>) => {
      const category = db.expenseCategories.find((item) => item.id === data.categoryId);
      const created = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now(),
      };
      db.expenses.push(created);
      return {
        ...created,
        amount: { toString: () => String(data.amount) },
        category: { id: category?.id ?? String(data.categoryId), name: category?.name ?? "General" },
      };
    },
    listExpenses: async () => ({ items: [], total: 0 }),
  };
}

function createMemoryReportRepos(db: MemoryDb) {
  return {
    loadReport: async (input: {
      kind: ReportKind;
      preset: ReportViewPreset;
      range: DateRange;
      scope: ReportQueryScope;
      page: number;
      pageSize: number;
      csv?: boolean;
    }) => {
      const invoices = db.invoices.filter((invoice) => invoiceMatchesReportScope(invoice, input.scope));
      const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
      const inRange = invoices.filter(
        (invoice) => invoice.invoiceDate >= input.range.start && invoice.invoiceDate < input.range.end,
      );
      const payments = db.payments.filter((payment) => {
        if (payment.status !== "COMPLETED") {
          return false;
        }
        const paidAt = payment.paidAt as Date | undefined;
        if (!paidAt || paidAt < input.range.start || paidAt >= input.range.end) {
          return false;
        }
        if (input.scope.organizationId && payment.organizationId !== input.scope.organizationId) {
          return false;
        }
        return invoiceIds.has(String(payment.invoiceId));
      });
      const expenses = db.expenses.filter((expense) => {
        const incurredOn = expense.incurredOn as Date;
        if (incurredOn < input.range.start || incurredOn >= input.range.end) {
          return false;
        }
        if (input.scope.organizationId && expense.organizationId !== input.scope.organizationId) {
          return false;
        }
        if (input.scope.expenseCreatedById && expense.createdById !== input.scope.expenseCreatedById) {
          return false;
        }
        return true;
      });
      const today = startOfUtcDay(new Date());
      const overdueEnd = input.range.end.getTime() < today.getTime() ? input.range.end : today;
      const overdue = invoices.filter(
        (invoice) =>
          !["DRAFT", "CANCELLED", "PAID"].includes(invoice.status) &&
          invoice.dueDate >= input.range.start &&
          invoice.dueDate < overdueEnd,
      );
      const outstanding = inRange.filter(
        (invoice) => !["DRAFT", "CANCELLED", "PAID"].includes(invoice.status),
      );
      const paid = inRange.filter((invoice) => invoice.status === "PAID");
      const taxInvoices = inRange.filter((invoice) => invoice.status !== "CANCELLED");
      const revenue = payments.reduce((sum, payment) => sum.plus(String(payment.amount)), money(0));
      const taxCollected = taxInvoices.reduce((sum, invoice) => sum.plus(invoice.taxAmount), money(0));
      const expenseTotal = expenses.reduce((sum, expense) => sum.plus(String(expense.amount)), money(0));
      const outstandingBalance = outstanding.reduce(
        (sum, invoice) => sum.plus(invoice.total).minus(invoice.amountPaid),
        money(0),
      );
      const currency = invoices[0]?.currency ?? "USD";
      const overview = {
        revenue: moneyString(revenue),
        taxCollected: moneyString(taxCollected),
        expenses: moneyString(expenseTotal),
        payments: moneyString(revenue),
        invoices: inRange.length,
        paidInvoices: paid.length,
        outstandingBalance: moneyString(outstandingBalance),
        overdueInvoices: overdue.length,
      };

      const daily = rangeDayCount(input.range) <= 45;
      const paymentSeries = bucketMemory(
        payments
          .filter((payment) => String(payment.currency ?? currency) === currency)
          .map((payment) => ({ at: payment.paidAt as Date, amount: String(payment.amount) })),
        daily,
      );

      if (input.kind === "revenue" || input.kind === "payments") {
        const methods = new Map<string, { count: number; amount: ReturnType<typeof money> }>();
        for (const payment of payments) {
          const method = String(payment.method ?? "OTHER");
          const current = methods.get(method) ?? { count: 0, amount: money(0) };
          methods.set(method, {
            count: current.count + 1,
            amount: current.amount.plus(String(payment.amount)),
          });
        }
        const rows = [...methods.entries()].map(([method, value]) => ({
          method: method.replaceAll("_", " "),
          count: String(value.count),
          amount: moneyString(value.amount),
        }));
        return {
          kind: input.kind,
          preset: input.preset,
          dateFrom: input.range.start.toISOString(),
          dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
          currency,
          overview,
          metrics: {
            revenue: overview.revenue,
            paymentCount: payments.length,
            averagePayment:
              payments.length > 0 ? moneyString(revenue.div(payments.length)) : moneyString(0),
          },
          series: paymentSeries,
          breakdown: rows.map((row) => ({ label: row.method, value: row.amount })),
          table: {
            columns: [
              { key: "method", label: "Method" },
              { key: "count", label: "Payments" },
              { key: "amount", label: "Amount" },
            ],
            rows,
            page: 1,
            pageSize: rows.length,
            total: rows.length,
          },
        };
      }

      if (input.kind === "expenses") {
        const byCategory = new Map<string, ReturnType<typeof money>>();
        for (const expense of expenses) {
          const category = db.expenseCategories.find((item) => item.id === expense.categoryId);
          const name = category?.name ?? "General";
          byCategory.set(name, (byCategory.get(name) ?? money(0)).plus(String(expense.amount)));
        }
        const rows = [...byCategory.entries()].map(([category, amount]) => ({
          category,
          amount: moneyString(amount),
        }));
        return {
          kind: input.kind,
          preset: input.preset,
          dateFrom: input.range.start.toISOString(),
          dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
          currency,
          overview,
          metrics: {
            expenses: overview.expenses,
            expenseCount: expenses.length,
            categories: rows.length,
          },
          series: rows.map((row) => ({ label: row.category, value: row.amount })),
          breakdown: rows.map((row) => ({ label: row.category, value: row.amount })),
          table: {
            columns: [
              { key: "category", label: "Category" },
              { key: "amount", label: "Amount" },
            ],
            rows,
            page: 1,
            pageSize: rows.length,
            total: rows.length,
          },
        };
      }

      if (input.kind === "tax") {
        const byRate = new Map<string, ReturnType<typeof money>>();
        let lines = 0;
        for (const invoice of taxInvoices) {
          for (const item of db.invoiceItems.filter((row) => row.invoiceId === invoice.id)) {
            const rate = item.taxRate ?? "0";
            byRate.set(rate, (byRate.get(rate) ?? money(0)).plus(item.taxAmount));
            lines += 1;
          }
        }
        const rows = [...byRate.entries()].map(([taxRate, taxAmount]) => ({
          taxRate,
          lines: String(lines),
          taxAmount: moneyString(taxAmount),
        }));
        return {
          kind: input.kind,
          preset: input.preset,
          dateFrom: input.range.start.toISOString(),
          dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
          currency,
          overview,
          metrics: { taxCollected: overview.taxCollected, rates: rows.length },
          series: rows.map((row) => ({ label: `${row.taxRate}%`, value: row.taxAmount })),
          breakdown: rows.map((row) => ({ label: `${row.taxRate}%`, value: row.taxAmount })),
          table: {
            columns: [
              { key: "taxRate", label: "Rate" },
              { key: "lines", label: "Lines" },
              { key: "taxAmount", label: "Tax" },
            ],
            rows,
            page: 1,
            pageSize: rows.length,
            total: rows.length,
          },
        };
      }

      if (input.kind === "customer-balances") {
        const byCustomer = new Map<string, { count: number; billed: ReturnType<typeof money>; paid: ReturnType<typeof money> }>();
        for (const invoice of outstanding) {
          const current = byCustomer.get(invoice.customerId) ?? {
            count: 0,
            billed: money(0),
            paid: money(0),
          };
          byCustomer.set(invoice.customerId, {
            count: current.count + 1,
            billed: current.billed.plus(invoice.total),
            paid: current.paid.plus(invoice.amountPaid),
          });
        }
        const rows = [...byCustomer.entries()].map(([customerId, value]) => {
          const customer = db.customers.find((item) => item.id === customerId);
          return {
            customer: customer?.name ?? "Customer",
            invoices: String(value.count),
            billed: moneyString(value.billed),
            paid: moneyString(value.paid),
            balance: moneyString(value.billed.minus(value.paid)),
          };
        });
        return {
          kind: input.kind,
          preset: input.preset,
          dateFrom: input.range.start.toISOString(),
          dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
          currency,
          overview,
          metrics: { customers: rows.length, outstandingBalance: overview.outstandingBalance },
          series: rows.map((row) => ({ label: row.customer, value: row.balance })),
          breakdown: rows.map((row) => ({ label: row.customer, value: row.balance })),
          table: {
            columns: [
              { key: "customer", label: "Customer" },
              { key: "invoices", label: "Invoices" },
              { key: "billed", label: "Billed" },
              { key: "paid", label: "Paid" },
              { key: "balance", label: "Balance" },
            ],
            rows,
            page: 1,
            pageSize: rows.length,
            total: rows.length,
          },
        };
      }

      const list =
        input.kind === "paid" ? paid : input.kind === "overdue" ? overdue : input.kind === "outstanding" ? outstanding : inRange;
      if (["paid", "outstanding", "overdue", "invoice-status"].includes(input.kind)) {
        const statusMap = new Map<string, number>();
        for (const invoice of list) {
          statusMap.set(invoice.status, (statusMap.get(invoice.status) ?? 0) + 1);
        }
        const billed = list.reduce((sum, invoice) => sum.plus(invoice.total), money(0));
        const collected = list.reduce((sum, invoice) => sum.plus(invoice.amountPaid), money(0));
        return {
          kind: input.kind,
          preset: input.preset,
          dateFrom: input.range.start.toISOString(),
          dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
          currency,
          overview,
          metrics:
            input.kind === "invoice-status"
              ? { statuses: statusMap.size, invoices: list.length }
              : {
                  billed: moneyString(billed),
                  collected: moneyString(collected),
                  outstanding: moneyString(billed.minus(collected)),
                  paidInvoices: paid.length,
                  outstandingInvoices: outstanding.length,
                  overdueInvoices: overdue.length,
                },
          series: [...statusMap.entries()].map(([status, count]) => ({
            label: status.replaceAll("_", " "),
            value: String(count),
          })),
          breakdown: [...statusMap.entries()].map(([status, count]) => ({
            label: status.replaceAll("_", " "),
            value: String(count),
          })),
          table: {
            columns: [
              { key: "invoiceNumber", label: "Invoice" },
              { key: "customer", label: "Customer" },
              { key: "status", label: "Status" },
              { key: "date", label: "Date" },
              { key: "total", label: "Total" },
              { key: "balance", label: "Balance" },
            ],
            rows: list.map((invoice) => {
              const customer = db.customers.find((item) => item.id === invoice.customerId);
              return {
                invoiceNumber: invoice.invoiceNumber,
                customer: customer?.name ?? "",
                status: invoice.status.replaceAll("_", " "),
                date: invoice.invoiceDate.toISOString().slice(0, 10),
                total: moneyString(invoice.total),
                balance: moneyString(money(invoice.total).minus(invoice.amountPaid)),
              };
            }),
            page: 1,
            pageSize: list.length,
            total: list.length,
          },
        };
      }

      return {
        kind: input.kind,
        preset: input.preset,
        dateFrom: input.range.start.toISOString(),
        dateTo: new Date(input.range.end.getTime() - 1).toISOString(),
        currency,
        overview,
        metrics: {
          revenue: overview.revenue,
          expenses: overview.expenses,
          outstandingBalance: overview.outstandingBalance,
          taxCollected: overview.taxCollected,
        },
        series: [
          { label: "Revenue", value: overview.revenue },
          { label: "Expenses", value: overview.expenses },
        ],
        breakdown: [
          { label: "Paid invoices", value: String(overview.paidInvoices) },
          { label: "Overdue invoices", value: String(overview.overdueInvoices) },
        ],
        table: {
          columns: [
            { key: "report", label: "Report" },
            { key: "value", label: "Value" },
          ],
          rows: [
            { report: "Revenue", value: overview.revenue },
            { report: "Expenses", value: overview.expenses },
            { report: "Tax collected", value: overview.taxCollected },
            { report: "Outstanding", value: overview.outstandingBalance },
          ],
          page: 1,
          pageSize: 4,
          total: 4,
        },
      };
    },
  };
}

type ReportViewPreset = import("../../src/lib/date-range.js").DatePreset;

function bucketMemory(items: Array<{ at: Date; amount: string }>, daily: boolean) {
  const buckets = new Map<string, ReturnType<typeof money>>();
  for (const item of items) {
    const key = periodKey(item.at, daily);
    buckets.set(key, (buckets.get(key) ?? money(0)).plus(item.amount));
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, amount]) => ({ label, value: moneyString(amount) }));
}
