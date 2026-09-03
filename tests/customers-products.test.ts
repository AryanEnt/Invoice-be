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
vi.mock("../src/repositories/audit.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().audit;
});
vi.mock("../src/repositories/health.repository.js", () => ({
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

import { app } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { getTestDb, resetMemoryDb, seedOrganization, seedUser } from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("customers and products", () => {
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

  async function seedActors() {
    const db = getTestDb();
    const orgA = seedOrganization(db, { name: "Org A", slug: "org-a" });
    const orgB = seedOrganization(db, { name: "Org B", slug: "org-b" });
    const passwordHash = await hashPassword(password);

    seedUser(db, {
      email: "super@example.com",
      passwordHash,
      role: "SUPER_ADMIN",
    });
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

    return { orgA, orgB };
  }

  it("allows MEMBER to create, list, and update customers in their organization", async () => {
    await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const created = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({
        name: "Acme Buyer",
        company: "Acme Ltd",
        email: "buyer@acme.test",
        phone: "555-0100",
        taxNumber: "VAT-100",
        notes: "Preferred customer",
        billingAddress: {
          line1: "12 Market St",
          city: "Kathmandu",
          country: "NP",
        },
      });

    expect(created.status).toBe(201);
    expect(created.body.data.customer.company).toBe("Acme Ltd");
    expect(created.body.data.customer.taxNumber).toBe("VAT-100");
    expect(created.body.data.customer.billingAddress.city).toBe("Kathmandu");
    expect(getTestDb().auditLogs.some((log) => log.action === "CUSTOMER_CREATED")).toBe(true);

    const listed = await request(app).get("/api/customers?search=Acme").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/customers/${created.body.data.customer.id}`)
      .set("Cookie", cookies)
      .send({ phone: "555-0199", isActive: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.customer.phone).toBe("555-0199");
    expect(updated.body.data.customer.isActive).toBe(false);

    const removed = await request(app)
      .delete(`/api/customers/${created.body.data.customer.id}`)
      .set("Cookie", cookies);
    expect(removed.status).toBe(403);
  });

  it("allows MEMBER to manage products and services", async () => {
    await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const product = await request(app)
      .post("/api/products")
      .set("Cookie", cookies)
      .send({
        name: "Office Chair",
        kind: "PRODUCT",
        sku: "CHAIR-1",
        unit: "each",
        unitPrice: 120,
        taxRate: 13,
      });

    expect(product.status).toBe(201);
    expect(product.body.data.product.kind).toBe("PRODUCT");
    expect(product.body.data.product.unitPrice).toBe(120);
    expect(product.body.data.product.taxRate).toBe(13);

    const service = await request(app)
      .post("/api/products")
      .set("Cookie", cookies)
      .send({
        name: "On-site setup",
        kind: "SERVICE",
        unit: "hour",
        unitPrice: 45,
      });

    expect(service.status).toBe(201);
    expect(service.body.data.product.kind).toBe("SERVICE");

    const filtered = await request(app)
      .get("/api/products?kind=SERVICE")
      .set("Cookie", cookies);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].name).toBe("On-site setup");

    const updated = await request(app)
      .patch(`/api/products/${product.body.data.product.id}`)
      .set("Cookie", cookies)
      .send({ unitPrice: 99.5, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.product.unitPrice).toBe(99.5);

    const removed = await request(app)
      .delete(`/api/products/${service.body.data.product.id}`)
      .set("Cookie", cookies);
    expect(removed.status).toBe(403);
  });

  it("lets MEMBER create customers but not delete them", async () => {
    await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const created = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({ name: "Walk-in customer" });
    expect(created.status).toBe(201);

    const deleted = await request(app)
      .delete(`/api/customers/${created.body.data.customer.id}`)
      .set("Cookie", cookies);
    expect(deleted.status).toBe(403);
  });

  it("does not allow Organization Admin to create customers", async () => {
    await seedActors();
    const cookies = await loginAs("admin-a@example.com");
    const created = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({ name: "Admin should not create" });
    expect(created.status).toBe(403);
  });

  it("prevents Admin A from accessing Organization B customers and products by id", async () => {
    const { orgB } = await seedActors();
    const memberB = await loginAs("member-b@example.com");
    const adminA = await loginAs("admin-a@example.com");

    const foreignCustomer = await request(app)
      .post("/api/customers")
      .set("Cookie", memberB)
      .send({ name: "Org B Customer", organizationId: orgB.id });
    expect(foreignCustomer.status).toBe(201);

    const foreignProduct = await request(app)
      .post("/api/products")
      .set("Cookie", memberB)
      .send({
        name: "Org B Product",
        kind: "PRODUCT",
        unitPrice: 25,
      });
    expect(foreignProduct.status).toBe(201);

    const customerId = foreignCustomer.body.data.customer.id as string;
    const productId = foreignProduct.body.data.product.id as string;

    const customerGet = await request(app).get(`/api/customers/${customerId}`).set("Cookie", adminA);
    expect(customerGet.status).toBe(403);

    const customerPatch = await request(app)
      .patch(`/api/customers/${customerId}`)
      .set("Cookie", adminA)
      .send({ name: "Hijacked" });
    expect(customerPatch.status).toBe(403);

    const customerDelete = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set("Cookie", adminA);
    expect(customerDelete.status).toBe(403);

    const productGet = await request(app).get(`/api/products/${productId}`).set("Cookie", adminA);
    expect(productGet.status).toBe(403);

    const productPatch = await request(app)
      .patch(`/api/products/${productId}`)
      .set("Cookie", adminA)
      .send({ name: "Hijacked" });
    expect(productPatch.status).toBe(403);

    const productDelete = await request(app)
      .delete(`/api/products/${productId}`)
      .set("Cookie", adminA);
    expect(productDelete.status).toBe(403);

    const listedCustomers = await request(app).get("/api/customers").set("Cookie", adminA);
    expect(listedCustomers.body.data.items.some((item: { id: string }) => item.id === customerId)).toBe(
      false,
    );

    const listedProducts = await request(app).get("/api/products").set("Cookie", adminA);
    expect(listedProducts.body.data.items.some((item: { id: string }) => item.id === productId)).toBe(
      false,
    );

    const scoped = await request(app)
      .get(`/api/customers?organizationId=${orgB.id}`)
      .set("Cookie", adminA);
    expect(scoped.status).toBe(403);
  });

  it("allows SUPER_ADMIN to create catalog items in any organization", async () => {
    const { orgB } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const customer = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({ name: "Global customer", organizationId: orgB.id });
    expect(customer.status).toBe(201);
    expect(customer.body.data.customer.organizationId).toBe(orgB.id);

    const product = await request(app)
      .post("/api/products")
      .set("Cookie", cookies)
      .send({
        name: "Global service",
        kind: "SERVICE",
        unitPrice: 80,
        organizationId: orgB.id,
      });
    expect(product.status).toBe(201);
    expect(product.body.data.product.organizationId).toBe(orgB.id);
    expect(product.body.data.product.kind).toBe("SERVICE");
  });

  it("requires organizationId for SUPER_ADMIN catalog lists and blocks tenant record reads", async () => {
    const { orgB } = await seedActors();
    const cookies = await loginAs("super@example.com");

    expect((await request(app).get("/api/customers").set("Cookie", cookies)).status).toBe(400);
    expect((await request(app).get("/api/products").set("Cookie", cookies)).status).toBe(400);

    const created = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({ name: "Scoped", organizationId: orgB.id });
    expect(created.status).toBe(201);

    const listed = await request(app)
      .get(`/api/customers?organizationId=${orgB.id}`)
      .set("Cookie", cookies);
    expect(listed.status).toBe(200);

    const getOne = await request(app)
      .get(`/api/customers/${created.body.data.customer.id}`)
      .set("Cookie", cookies);
    expect(getOne.status).toBe(403);
  });
});
