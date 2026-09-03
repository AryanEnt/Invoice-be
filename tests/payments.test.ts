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
  seedUser,
} from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("payments", () => {
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
    seedUser(db, {
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
    seedUser(db, {
      email: "member-a@example.com",
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

    seedUser(db, {
      email: "member-other@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });

    const cookiesA = await loginAs("member-a@example.com");
    const customerA = await request(app)
      .post("/api/customers")
      .set("Cookie", cookiesA)
      .send({ name: "Acme Buyer", email: "acme@example.com" });
    const cookiesB = await loginAs("member-b@example.com");
    const customerB = await request(app)
      .post("/api/customers")
      .set("Cookie", cookiesB)
      .send({ name: "Beta Buyer", email: "beta@example.com" });

    const invoiceA = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesA)
      .send({
        customerId: customerA.body.data.customer.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Work", quantity: "1", unitPrice: "100" }],
      });
    await request(app)
      .post(`/api/invoices/${invoiceA.body.data.invoice.id}/send`)
      .set("Cookie", cookiesA);

    const invoiceB = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookiesB)
      .send({
        customerId: customerB.body.data.customer.id,
        invoiceDate: "2026-08-01",
        dueDate: "2026-12-31",
        items: [{ description: "Other work", quantity: "1", unitPrice: "80" }],
      });
    await request(app)
      .post(`/api/invoices/${invoiceB.body.data.invoice.id}/send`)
      .set("Cookie", cookiesB);

    return {
      cookiesA,
      cookiesB,
      invoiceA: invoiceA.body.data.invoice,
      invoiceB: invoiceB.body.data.invoice,
    };
  }

  it("records a manual payment and updates invoice balance from payment records", async () => {
    const { cookiesA, invoiceA } = await seedWorld();

    const created = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({
        invoiceId: invoiceA.id,
        amount: "40",
        method: "BANK_TRANSFER",
        notes: "First installment",
      });

    expect(created.status).toBe(201);
    expect(created.body.data.payment.provider).toBe("MANUAL");
    expect(created.body.data.payment.amount).toBe("40.0000");
    expect(created.body.data.invoice.amountPaid).toBe("40.0000");
    expect(created.body.data.invoice.balanceDue).toBe("60.0000");
    expect(created.body.data.invoice.paymentStatus).toBe("PARTIALLY_PAID");
    expect(created.body.data.invoice.status).toBe("PARTIALLY_PAID");

    const listed = await request(app).get("/api/payments").set("Cookie", cookiesA);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.items[0].id).toBe(created.body.data.payment.id);

    const fetched = await request(app)
      .get(`/api/payments/${created.body.data.payment.id}`)
      .set("Cookie", cookiesA);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.payment.notes).toBe("First installment");
  });

  it("marks an invoice paid when completed payments cover the total", async () => {
    const { cookiesA, invoiceA } = await seedWorld();

    const paid = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "100", method: "CASH" });

    expect(paid.status).toBe(201);
    expect(paid.body.data.invoice.status).toBe("PAID");
    expect(paid.body.data.invoice.paymentStatus).toBe("PAID");
    expect(paid.body.data.invoice.amountPaid).toBe("100.0000");
    expect(paid.body.data.invoice.balanceDue).toBe("0.0000");
  });

  it("rejects invalid amounts and overpayments", async () => {
    const { cookiesA, invoiceA } = await seedWorld();

    const zero = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "0" });
    expect(zero.status).toBe(400);

    const negative = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "-10" });
    expect(negative.status).toBe(400);

    await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "40" });

    const overpay = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "80" });
    expect(overpay.status).toBe(400);

    const currency = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "10", currency: "EUR" });
    expect(currency.status).toBe(400);
  });

  it("rejects unauthorized payment attempts", async () => {
    const { invoiceA } = await seedWorld();

    const anonymous = await request(app)
      .post("/api/payments")
      .send({ invoiceId: invoiceA.id, amount: "10" });
    expect(anonymous.status).toBe(401);

    const memberCookies = await loginAs("member-other@example.com");
    const memberPay = await request(app)
      .post("/api/payments")
      .set("Cookie", memberCookies)
      .send({ invoiceId: invoiceA.id, amount: "10" });
    expect(memberPay.status).toBe(403);

    const listed = await request(app).get("/api/payments").set("Cookie", memberCookies);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(0);
  });

  it("keeps payments isolated by organization", async () => {
    const { cookiesA, cookiesB, invoiceA, invoiceB } = await seedWorld();

    const paymentA = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceA.id, amount: "25" });
    expect(paymentA.status).toBe(201);

    const crossCreate = await request(app)
      .post("/api/payments")
      .set("Cookie", cookiesA)
      .send({ invoiceId: invoiceB.id, amount: "10" });
    expect(crossCreate.status).toBe(403);

    const crossGet = await request(app)
      .get(`/api/payments/${paymentA.body.data.payment.id}`)
      .set("Cookie", cookiesB);
    expect(crossGet.status).toBe(403);

    const listedB = await request(app).get("/api/payments").set("Cookie", cookiesB);
    expect(listedB.body.data.items.some((item: { invoiceId: string }) => item.invoiceId === invoiceA.id)).toBe(
      false,
    );
  });
});
