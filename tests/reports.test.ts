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
vi.mock("../src/repositories/expense.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().expense;
});
vi.mock("../src/repositories/report.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().report;
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

describe("reports", () => {
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
    db.teamMembers.push({ teamId: teamA.id, userId: memberA.id });
    db.teamMembers.push({ teamId: teamA.id, userId: adminA.id });
    seedUser(db, {
      email: "member-b@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgB.id,
    });

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
        items: [{ description: "A work", quantity: "1", unitPrice: "100", taxRate: "10" }],
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
        invoiceDate: "2026-01-10",
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

    const expense = await request(app)
      .post("/api/expenses")
      .set("Cookie", operatorA)
      .send({
        categoryName: "Travel",
        amount: "25",
        incurredOn: "2026-08-15",
      });
    expect(expense.status).toBe(201);

    return { orgA, orgB, cookiesA, cookiesB };
  }

  it("aggregates revenue and tax for Super Admin without leaking org-scoped admin views", async () => {
    const { orgA } = await seedWorld();
    const superCookies = await loginAs("super@example.com");

    const year = await request(app)
      .get("/api/reports/revenue?preset=this_year")
      .set("Cookie", superCookies);
    expect(year.status).toBe(200);
    expect(year.body.data.report.scope).toBe("SYSTEM");
    expect(year.body.data.report.overview.revenue).toBe("340.0000");
    expect(year.body.data.report.overview.taxCollected).toBe("10.0000");

    const month = await request(app)
      .get("/api/reports/revenue?preset=this_month")
      .set("Cookie", superCookies);
    expect(month.body.data.report.overview.revenue).toBe("340.0000");

    const lastMonth = await request(app)
      .get("/api/reports/paid?preset=last_month")
      .set("Cookie", superCookies);
    expect(lastMonth.body.data.report.overview.invoices).toBe(2);

    const scoped = await request(app)
      .get(`/api/reports/revenue?preset=this_year&organizationId=${orgA.id}`)
      .set("Cookie", superCookies);
    expect(scoped.body.data.report.scope).toBe("SYSTEM");
    expect(scoped.body.data.report.organizationId).toBe(orgA.id);
    expect(scoped.body.data.report.overview.revenue).toBe("40.0000");
    expect(scoped.body.data.report.overview.expenses).toBe("25.0000");
  });

  it("keeps Admin reports isolated by organization", async () => {
    const { cookiesA, cookiesB, orgB } = await seedWorld();

    const adminA = await request(app)
      .get("/api/reports/outstanding?preset=this_year")
      .set("Cookie", cookiesA);
    expect(adminA.status).toBe(200);
    expect(adminA.body.data.report.scope).toBe("ORGANIZATION");
    expect(adminA.body.data.report.overview.revenue).toBe("40.0000");
    expect(adminA.body.data.report.overview.overdueInvoices).toBe(1);
    expect(adminA.body.data.report.table.rows.length).toBeGreaterThan(0);

    const adminB = await request(app)
      .get("/api/reports/paid?preset=this_year")
      .set("Cookie", cookiesB);
    expect(adminB.body.data.report.overview.paidInvoices).toBe(1);
    expect(adminB.body.data.report.overview.revenue).toBe("300.0000");
    expect(adminB.body.data.report.overview.expenses).toBe("0.0000");

    const cross = await request(app)
      .get(`/api/reports/revenue?preset=this_year&organizationId=${orgB.id}`)
      .set("Cookie", cookiesA);
    expect(cross.status).toBe(403);
  });

  it("limits Member reports to authorized invoices and their own expenses", async () => {
    await seedWorld();
    const memberCookies = await loginAs("member-a@example.com");

    const report = await request(app)
      .get("/api/reports/customer-balances?preset=this_year")
      .set("Cookie", memberCookies);
    expect(report.status).toBe(200);
    expect(report.body.data.report.scope).toBe("MEMBER");
    expect(report.body.data.report.overview.revenue).toBe("40.0000");
    expect(report.body.data.report.overview.expenses).toBe("25.0000");
    expect(report.body.data.report.table.rows).toHaveLength(1);
  });

  it("exports CSV and rejects unauthenticated access", async () => {
    const { cookiesA } = await seedWorld();

    const csv = await request(app)
      .get("/api/reports/payments/csv?preset=this_year")
      .set("Cookie", cookiesA);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(String(csv.text)).toContain("Method");

    const custom = await request(app)
      .get("/api/reports/tax?preset=custom&dateFrom=2026-08-01&dateTo=2026-08-31")
      .set("Cookie", cookiesA);
    expect(custom.status).toBe(200);
    expect(Number(custom.body.data.report.overview.taxCollected)).toBeGreaterThan(0);

    expect((await request(app).get("/api/reports/revenue?preset=this_year")).status).toBe(401);
  });
});
