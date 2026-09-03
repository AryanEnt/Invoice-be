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

describe("invoices", () => {
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
    const teamA = seedTeam(db, { organizationId: orgA.id, name: "Sales", createdById: adminA.id });
    seedUser(db, {
      email: "admin-b@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgB.id,
    });
    const memberA = seedUser(db, {
      email: "member-a@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });
    const memberOther = seedUser(db, {
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

    const cookiesA = await loginAs("member-a@example.com");
    const customerA = await request(app)
      .post("/api/customers")
      .set("Cookie", cookiesA)
      .send({ name: "Acme Buyer", company: "Acme", email: "acme@example.com" });
    const customerBCookies = await loginAs("member-b@example.com");
    const customerB = await request(app)
      .post("/api/customers")
      .set("Cookie", customerBCookies)
      .send({ name: "Beta Buyer", email: "beta@example.com" });
    const productA = await request(app)
      .post("/api/products")
      .set("Cookie", cookiesA)
      .send({
        name: "Chair",
        kind: "PRODUCT",
        sku: "CHAIR-1",
        unit: "each",
        unitPrice: 100,
        taxRate: 13,
      });
    expect(customerA.status).toBe(201);
    expect(customerB.status).toBe(201);
    expect(productA.status).toBe(201);

    return {
      orgA,
      orgB,
      teamA,
      memberA,
      memberOther,
      cookiesA,
      customerA: customerA.body.data.customer,
      customerB: customerB.body.data.customer,
      productA: productA.body.data.product,
    };
  }

  it("creates an invoice, snapshots catalog data, and calculates totals on the server", async () => {
    const { cookiesA, customerA, productA } = await seedWorld();

    const created = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [
          { productId: productA.id, quantity: "2", discount: "10" },
          { description: "Delivery", quantity: "1", unitPrice: "25", taxRate: "0" },
        ],
      });

    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice;
    expect(invoice.invoiceNumber).toMatch(/^INV-2026-\d{4}$/);
    expect(invoice.items[0].sku).toBe("CHAIR-1");
    expect(invoice.items[0].description).toBe("Chair");
    expect(invoice.items[0].unitPrice).toBe("100.0000");
    expect(invoice.subtotal).toBe("225.0000");
    expect(invoice.discountAmount).toBe("10.0000");
    expect(invoice.taxAmount).toBe("24.7000");
    expect(invoice.total).toBe("239.7000");
    expect(invoice.paymentStatus).toBe("UNPAID");
    expect(invoice.status).toBe("DRAFT");

    const productUpdate = await request(app)
      .patch(`/api/products/${productA.id}`)
      .set("Cookie", cookiesA)
      .send({ unitPrice: 999, name: "Chair Deluxe" });
    expect(productUpdate.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/invoices/${invoice.id}`)
      .set("Cookie", cookiesA);
    expect(fetched.body.data.invoice.items[0].unitPrice).toBe("100.0000");
    expect(fetched.body.data.invoice.items[0].description).toBe("Chair");
  });

  it("rejects duplicate invoice numbers and invalid items", async () => {
    const { cookiesA, customerA } = await seedWorld();

    const first = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceNumber: "INV-FIXED-1",
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceNumber: "INV-FIXED-1",
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(duplicate.status).toBe(409);

    const invalid = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [],
      });
    expect(invalid.status).toBe(400);
  });

  it("enforces controlled status transitions and payment consistency", async () => {
    const { cookiesA, customerA } = await seedWorld();

    const created = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "100" }],
      });
    const id = created.body.data.invoice.id as string;

    const arbitrary = await request(app)
      .patch(`/api/invoices/${id}`)
      .set("Cookie", cookiesA)
      .send({ status: "PAID" });
    expect(arbitrary.status).toBe(400);

    const sent = await request(app).post(`/api/invoices/${id}/send`).set("Cookie", cookiesA);
    expect(sent.status).toBe(200);
    expect(sent.body.data.invoice.status).toBe("SENT");

    const editSent = await request(app)
      .patch(`/api/invoices/${id}`)
      .set("Cookie", cookiesA)
      .send({ notes: "nope" });
    expect(editSent.status).toBe(403);

    const partial = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set("Cookie", cookiesA)
      .send({ amount: "40" });
    expect(partial.status).toBe(200);
    expect(partial.body.data.invoice.status).toBe("PARTIALLY_PAID");
    expect(partial.body.data.invoice.paymentStatus).toBe("PARTIALLY_PAID");

    const overpay = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set("Cookie", cookiesA)
      .send({ amount: "80" });
    expect(overpay.status).toBe(400);

    const paid = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set("Cookie", cookiesA)
      .send({ amount: "60" });
    expect(paid.status).toBe(200);
    expect(paid.body.data.invoice.status).toBe("PAID");
    expect(paid.body.data.invoice.paymentStatus).toBe("PAID");

    const cancelPaid = await request(app)
      .post(`/api/invoices/${id}/cancel`)
      .set("Cookie", cookiesA);
    expect(cancelPaid.status).toBe(403);
  });

  it("keeps invoices isolated by organization and member assignment", async () => {
    const { cookiesA, customerA, customerB } = await seedWorld();
    const operatorB = await loginAs("member-b@example.com");
    const memberOtherCookies = await loginAs("member-other@example.com");

    const invoiceA = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "A work", quantity: "1", unitPrice: "10" }],
      });
    const invoiceB = await request(app)
      .post("/api/invoices")
      .set("Cookie", operatorB)
      .send({
        customerId: customerB.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "B work", quantity: "1", unitPrice: "10" }],
      });

    const idA = invoiceA.body.data.invoice.id as string;
    const idB = invoiceB.body.data.invoice.id as string;

    expect((await request(app).get(`/api/invoices/${idB}`).set("Cookie", cookiesA)).status).toBe(
      403,
    );
    expect(
      (await request(app).patch(`/api/invoices/${idB}`).set("Cookie", cookiesA).send({ notes: "x" }))
        .status,
    ).toBe(403);

    const listed = await request(app).get("/api/invoices").set("Cookie", cookiesA);
    expect(listed.body.data.items.some((item: { id: string }) => item.id === idB)).toBe(false);

    const memberList = await request(app).get("/api/invoices").set("Cookie", memberOtherCookies);
    expect(memberList.body.data.items.some((item: { id: string }) => item.id === idA)).toBe(false);

    const own = await request(app)
      .post("/api/invoices")
      .set("Cookie", memberOtherCookies)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Own work", quantity: "1", unitPrice: "15" }],
      });
    expect(own.status).toBe(201);
    const ownId = own.body.data.invoice.id as string;
    const memberGet = await request(app)
      .get(`/api/invoices/${ownId}`)
      .set("Cookie", memberOtherCookies);
    expect(memberGet.status).toBe(200);
  });

  it("generates a PDF for an authorized invoice", async () => {
    const { cookiesA, customerA } = await seedWorld();
    const created = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        notes: "Thank you",
        terms: "Net 14",
        items: [{ description: "Design", quantity: "1", unitPrice: "80" }],
      });

    const pdf = await request(app)
      .get(`/api/invoices/${created.body.data.invoice.id}/pdf`)
      .set("Cookie", cookiesA);

    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("prevents MEMBER from assigning a team they do not belong to", async () => {
    const { orgA, teamA, customerA } = await seedWorld();
    const db = getTestDb();
    const otherTeam = seedTeam(db, { organizationId: orgA.id, name: "Ops" });
    const memberCookies = await loginAs("member-a@example.com");

    const denied = await request(app)
      .post("/api/invoices")
      .set("Cookie", memberCookies)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        assignedTeamId: otherTeam.id,
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .post("/api/invoices")
      .set("Cookie", memberCookies)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        assignedTeamId: teamA.id,
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(allowed.status).toBe(201);
  });

  it("rejects due dates before invoice dates and invalid paidAt values", async () => {
    const { cookiesA, customerA } = await seedWorld();

    const invalidRange = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-10",
        dueDate: "2026-08-01",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(invalidRange.status).toBe(400);

    const created = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(created.status).toBe(201);
    const id = created.body.data.invoice.id as string;

    const invalidUpdate = await request(app)
      .patch(`/api/invoices/${id}`)
      .set("Cookie", cookiesA)
      .send({ invoiceDate: "not-a-date" });
    expect(invalidUpdate.status).toBe(400);

    await request(app).post(`/api/invoices/${id}/send`).set("Cookie", cookiesA);
    const invalidPaidAt = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set("Cookie", cookiesA)
      .send({ amount: "5", paidAt: "not-a-date" });
    expect(invalidPaidAt.status).toBe(400);
  });

  it("marks a zero-total sent invoice as paid and lists overdue partial invoices", async () => {
    const { cookiesA, customerA } = await seedWorld();

    const zero = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Complimentary", quantity: "1", unitPrice: "0" }],
      });
    expect(zero.status).toBe(201);
    const sentZero = await request(app)
      .post(`/api/invoices/${zero.body.data.invoice.id}/send`)
      .set("Cookie", cookiesA);
    expect(sentZero.status).toBe(200);
    expect(sentZero.body.data.invoice.status).toBe("PAID");
    expect(sentZero.body.data.invoice.paymentStatus).toBe("PAID");

    const overdue = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-01-01",
        dueDate: "2026-01-15",
        items: [{ description: "Past due", quantity: "1", unitPrice: "80" }],
      });
    const overdueId = overdue.body.data.invoice.id as string;
    await request(app).post(`/api/invoices/${overdueId}/send`).set("Cookie", cookiesA);
    await request(app)
      .post(`/api/invoices/${overdueId}/payments`)
      .set("Cookie", cookiesA)
      .send({ amount: "20" });

    const listed = await request(app)
      .get("/api/invoices")
      .query({ status: "OVERDUE" })
      .set("Cookie", cookiesA);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items.some((item: { id: string }) => item.id === overdueId)).toBe(true);
  });

  it("allocates invoice numbers using the numeric suffix, not string sort", async () => {
    const { cookiesA, customerA } = await seedWorld();

    const first = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceNumber: "INV-2026-9999",
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    const second = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceNumber: "INV-2026-10000",
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const next = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(next.status).toBe(201);
    expect(next.body.data.invoice.invoiceNumber).toBe("INV-2026-10001");
  });

  it("filters invoices by team and rejects unauthorized team or Super Admin tenant access", async () => {
    const { cookiesA, customerA, teamA, orgB } = await seedWorld();
    const db = getTestDb();
    const teamB = seedTeam(db, { organizationId: orgB.id, name: "Org B Sales" });
    const memberCookies = await loginAs("member-a@example.com");
    const superCookies = await loginAs("super@example.com");

    const assigned = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        assignedTeamId: teamA.id,
        items: [{ description: "Sales work", quantity: "1", unitPrice: "20" }],
      });
    const unassigned = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Org work", quantity: "1", unitPrice: "30" }],
      });
    expect(assigned.status).toBe(201);
    expect(unassigned.status).toBe(201);
    const assignedId = assigned.body.data.invoice.id as string;
    const unassignedId = unassigned.body.data.invoice.id as string;

    const allTeams = await request(app).get("/api/invoices").set("Cookie", cookiesA);
    expect(allTeams.status).toBe(200);
    expect(allTeams.body.data.items.some((item: { id: string }) => item.id === assignedId)).toBe(true);
    expect(allTeams.body.data.items.some((item: { id: string }) => item.id === unassignedId)).toBe(
      true,
    );

    const salesOnly = await request(app)
      .get(`/api/invoices?teamId=${teamA.id}`)
      .set("Cookie", cookiesA);
    expect(salesOnly.status).toBe(200);
    expect(salesOnly.body.data.items.some((item: { id: string }) => item.id === assignedId)).toBe(
      true,
    );
    expect(salesOnly.body.data.items.some((item: { id: string }) => item.id === unassignedId)).toBe(
      false,
    );

    const crossOrg = await request(app)
      .get(`/api/invoices?teamId=${teamB.id}`)
      .set("Cookie", cookiesA);
    expect(crossOrg.status).toBe(403);

    const memberCross = await request(app)
      .get(`/api/invoices?teamId=${teamB.id}`)
      .set("Cookie", memberCookies);
    expect(memberCross.status).toBe(403);

    const superList = await request(app).get("/api/invoices").set("Cookie", superCookies);
    expect(superList.status).toBe(200);

    const superGet = await request(app)
      .get(`/api/invoices/${assignedId}`)
      .set("Cookie", superCookies);
    expect(superGet.status).toBe(200);
  });

  it("does not allow an Organization Admin to create invoices", async () => {
    const { customerA } = await seedWorld();
    const adminCookies = await loginAs("admin-a@example.com");
    const created = await request(app)
      .post("/api/invoices")
      .set("Cookie", adminCookies)
      .send({
        customerId: customerA.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "10" }],
      });
    expect(created.status).toBe(201);
  });
});
