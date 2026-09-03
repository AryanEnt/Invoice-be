import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/user.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().user;
});
vi.mock("../src/repositories/session.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().session;
});
vi.mock("../src/repositories/organization.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().organization;
});
vi.mock("../src/repositories/team.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().team;
});
vi.mock("../src/repositories/customer.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().customer;
});
vi.mock("../src/repositories/product.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().product;
});
vi.mock("../src/repositories/invoice.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().invoice;
});
vi.mock("../src/repositories/payment.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().payment;
});
vi.mock("../src/repositories/dashboard.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().dashboard;
});
vi.mock("../src/repositories/audit.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().audit;
});
vi.mock("../src/repositories/health.repository.js", () => ({
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));
vi.mock("../src/integrations/email/provider.js", () => ({
  getEmailProvider: () => ({
    name: "test",
    isConfigured: () => true,
    sendInvoiceEmail: async () => ({ sent: true, provider: "test" }),
  }),
}));

import { app } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  getTestDb,
  resetMemoryDb,
  seedOrganization,
  seedTeam,
  seedUser,
} from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("dashboard", () => {
  beforeEach(() => {
    resetMemoryDb(getTestDb());
  });

  async function loginAs(email: string) {
    const response = await request(app).post("/api/auth/login").send({ email, password });
    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"];
    if (!cookies) {
      throw new Error("Expected session cookie");
    }
    return Array.isArray(cookies) ? cookies : [cookies];
  }

  async function seedWorld() {
    const db = getTestDb();
    const orgA = seedOrganization(db, { name: "Org A", slug: "org-a" });
    const orgB = seedOrganization(db, { name: "Org B", slug: "org-b" });
    const passwordHash = await hashPassword(password);

    seedUser(db, { email: "super@example.com", passwordHash, role: "SUPER_ADMIN" });
    const adminA = seedUser(db, {
      email: "admin-a@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgA.id,
    });
    seedUser(db, {
      email: "admin-b@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgB.id,
    });
    const teamA = seedTeam(db, { organizationId: orgA.id, name: "Sales", createdById: adminA.id });
    const memberA = seedUser(db, {
      email: "member-a@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });
    seedUser(db, {
      email: "member-other@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });
    seedUser(db, {
      email: "member-b@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgB.id,
    });
    db.teamMembers.push({ teamId: teamA.id, userId: memberA.id });
    db.teamMembers.push({ teamId: teamA.id, userId: adminA.id });

    const operatorA = await loginAs("member-a@example.com");
    const operatorB = await loginAs("member-b@example.com");
    const cookiesA = await loginAs("admin-a@example.com");
    const cookiesB = await loginAs("admin-b@example.com");
    const customerA = await request(app)
      .post("/api/customers")
      .set("Cookie", operatorA)
      .send({ name: "Acme Buyer", email: "acme@example.com" });
    const customerB = await request(app)
      .post("/api/customers")
      .set("Cookie", operatorB)
      .send({ name: "Beta Buyer", email: "beta@example.com" });

    const invoiceA = await request(app)
      .post("/api/invoices")
      .set("Cookie", operatorA)
      .send({
        customerId: customerA.body.data.customer.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        assignedMemberId: memberA.id,
        items: [{ description: "A work", quantity: "1", unitPrice: "100" }],
      });
    await request(app)
      .post(`/api/invoices/${invoiceA.body.data.invoice.id}/send`)
      .set("Cookie", operatorA);
    await request(app)
      .post("/api/payments")
      .set("Cookie", operatorA)
      .send({ invoiceId: invoiceA.body.data.invoice.id, amount: "40" });

    const overdueA = await request(app)
      .post("/api/invoices")
      .set("Cookie", operatorA)
      .send({
        customerId: customerA.body.data.customer.id,
        invoiceDate: "2026-01-01",
        dueDate: "2026-01-15",
        items: [{ description: "Late work", quantity: "1", unitPrice: "50" }],
      });
    await request(app)
      .post(`/api/invoices/${overdueA.body.data.invoice.id}/send`)
      .set("Cookie", operatorA);

    const invoiceB = await request(app)
      .post("/api/invoices")
      .set("Cookie", operatorB)
      .send({
        customerId: customerB.body.data.customer.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "B work", quantity: "1", unitPrice: "300" }],
      });
    await request(app)
      .post(`/api/invoices/${invoiceB.body.data.invoice.id}/send`)
      .set("Cookie", operatorB);
    await request(app)
      .post("/api/payments")
      .set("Cookie", operatorB)
      .send({ invoiceId: invoiceB.body.data.invoice.id, amount: "300" });

    return { orgA, orgB, teamA, cookiesA, cookiesB };
  }

  it("shows system metrics to Super Admin without other-organization leakage in scoped views", async () => {
    const { orgA } = await seedWorld();
    const superCookies = await loginAs("super@example.com");

    const system = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31")
      .set("Cookie", superCookies);
    expect(system.status).toBe(200);
    expect(system.body.data.dashboard.scope).toBe("SYSTEM");
    expect(system.body.data.dashboard.metrics.organizations).toBe(2);
    expect(system.body.data.dashboard.metrics.admins).toBe(2);
    expect(system.body.data.dashboard.metrics.members).toBe(3);
    expect(system.body.data.dashboard.metrics.invoices).toBe(3);
    expect(system.body.data.dashboard.metrics.revenue).toBe("340.0000");
    expect(system.body.data.dashboard.metrics.activeOrganizations).toBe(2);
    expect(system.body.data.dashboard.metrics.overdueInvoices).toBe(1);
    expect(system.body.data.dashboard.recentInvoices).toHaveLength(3);
    expect(system.body.data.dashboard.recentPayments).toHaveLength(2);
    expect(system.body.data.dashboard.overdueInvoices).toHaveLength(1);

    const scoped = await request(app)
      .get(`/api/dashboard?organizationId=${orgA.id}&preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31`)
      .set("Cookie", superCookies);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.dashboard.scope).toBe("ORGANIZATION");
    expect(scoped.body.data.dashboard.organizationId).toBe(orgA.id);
    expect(scoped.body.data.dashboard.metrics.invoices).toBe(2);
    expect(scoped.body.data.dashboard.metrics.revenue).toBe("40.0000");
  });

  it("keeps Admin dashboards isolated by organization", async () => {
    const { cookiesA, cookiesB, orgB } = await seedWorld();

    const adminA = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31")
      .set("Cookie", cookiesA);
    expect(adminA.status).toBe(200);
    expect(adminA.body.data.dashboard.scope).toBe("ORGANIZATION");
    expect(adminA.body.data.dashboard.metrics.invoices).toBe(2);
    expect(adminA.body.data.dashboard.metrics.paidInvoices).toBe(0);
    expect(adminA.body.data.dashboard.metrics.unpaidInvoices).toBe(2);
    expect(adminA.body.data.dashboard.metrics.overdueInvoices).toBe(1);
    expect(adminA.body.data.dashboard.metrics.revenue).toBe("40.0000");
    expect(adminA.body.data.dashboard.metrics.customers).toBe(1);
    expect(adminA.body.data.dashboard.metrics.admins).toBeNull();
    expect(
      adminA.body.data.dashboard.recentInvoices.every(
        (item: { organizationName: string }) => item.organizationName === "Org A",
      ),
    ).toBe(true);

    const adminB = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31")
      .set("Cookie", cookiesB);
    expect(adminB.body.data.dashboard.metrics.invoices).toBe(1);
    expect(adminB.body.data.dashboard.metrics.paidInvoices).toBe(1);
    expect(adminB.body.data.dashboard.metrics.revenue).toBe("300.0000");
    expect(adminB.body.data.dashboard.metrics.outstandingBalance).toBe("0.0000");
    expect(adminB.body.data.dashboard.recentPayments).toHaveLength(1);

    const crossUuid = await request(app)
      .get(`/api/dashboard?organizationId=${orgB.id}`)
      .set("Cookie", cookiesA);
    expect(crossUuid.status).toBe(403);
  });

  it("filters Admin dashboard metrics to a team in the same organization", async () => {
    const { cookiesA, teamA, orgB } = await seedWorld();
    const db = getTestDb();
    const teamB = seedTeam(db, { organizationId: orgB.id, name: "Org B Sales" });

    const scoped = await request(app)
      .get(`/api/dashboard?teamId=${teamA.id}&preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31`)
      .set("Cookie", cookiesA);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.dashboard.teamId).toBe(teamA.id);
    expect(scoped.body.data.dashboard.metrics.invoices).toBe(0);

    const leaked = await request(app)
      .get(`/api/dashboard?teamId=${teamB.id}`)
      .set("Cookie", cookiesA);
    expect(leaked.status).toBe(403);
  });

  it("shows a Member only invoices they are authorized to access", async () => {
    await seedWorld();
    const memberCookies = await loginAs("member-a@example.com");
    const otherCookies = await loginAs("member-other@example.com");

    const member = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31")
      .set("Cookie", memberCookies);
    expect(member.status).toBe(200);
    expect(member.body.data.dashboard.scope).toBe("MEMBER");
    expect(member.body.data.dashboard.metrics.invoices).toBe(2);
    expect(member.body.data.dashboard.metrics.revenue).toBe("40.0000");
    expect(member.body.data.dashboard.metrics.customers).toBe(1);
    expect(member.body.data.dashboard.metrics.members).toBeNull();
    expect(member.body.data.dashboard.metrics.organizations).toBeNull();
    expect(member.body.data.dashboard.recentInvoices).toHaveLength(2);
    expect(member.body.data.dashboard.expenseSeries).toEqual([]);
    expect(member.body.data.dashboard.teamPerformance).toEqual([]);
    expect(member.body.data.dashboard.organizationActivity).toEqual([]);

    const other = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-01-01&dateTo=2026-12-31")
      .set("Cookie", otherCookies);
    expect(other.body.data.dashboard.metrics.invoices).toBe(0);
    expect(other.body.data.dashboard.metrics.revenue).toBe("0.0000");
    expect(other.body.data.dashboard.recentInvoices).toHaveLength(0);
  });

  it("filters dashboard aggregations by the requested date range", async () => {
    await seedWorld();
    const superCookies = await loginAs("super@example.com");

    const august = await request(app)
      .get("/api/dashboard?preset=custom&dateFrom=2026-08-01&dateTo=2026-08-31")
      .set("Cookie", superCookies);
    expect(august.status).toBe(200);
    expect(august.body.data.dashboard.range.preset).toBe("custom");
    expect(august.body.data.dashboard.metrics.invoices).toBe(2);
    expect(august.body.data.dashboard.metrics.overdueInvoices).toBe(0);
    expect(august.body.data.dashboard.metrics.revenue).toBe("0.0000");
    expect(
      august.body.data.dashboard.expenseSeries.every((point: { amount: string }) => point.amount === "0.0000"),
    ).toBe(true);
    expect(august.body.data.dashboard.topCustomers).toHaveLength(2);
  });

  it("rejects unauthenticated dashboard access", async () => {
    const response = await request(app).get("/api/dashboard");
    expect(response.status).toBe(401);
  });
});
