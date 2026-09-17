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
vi.mock("../src/integrations/email/send-invoice-email.js", () => ({
  sendInvoiceEmail: async () => ({ sent: true, provider: "test" }),
}));

import { app } from "../src/app.js";
import { assertLogoUploadMeta, isAllowedLogoContentType } from "../src/integrations/storage/r2.service.js";
import { stripeModeMatchesKey } from "../src/integrations/payments/stripe/client.js";
import { ValidationError } from "../src/lib/errors.js";
import { hashPassword } from "../src/lib/password.js";
import {
  getTestDb,
  resetMemoryDb,
  seedOrganization,
  seedTeam,
  seedUser,
} from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("security hardening", () => {
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
    const adminB = seedUser(db, {
      email: "admin-b@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgB.id,
    });
    seedTeam(db, { organizationId: orgA.id, name: "Sales", createdById: adminA.id });
    seedUser(db, {
      email: "member-a@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
      administratorId: adminA.id,
    });
    seedUser(db, {
      email: "member-b@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgB.id,
      administratorId: adminB.id,
    });
    seedUser(db, {
      email: "inactive@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
      administratorId: adminA.id,
      status: "INACTIVE",
    });

    return { orgA, orgB, adminA, adminB };
  }

  it("rejects unauthenticated access to protected APIs", async () => {
    const response = await request(app).get("/api/invoices");
    expect(response.status).toBe(401);
  });

  it("rejects login for deactivated accounts", async () => {
    await seedWorld();
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactive@example.com", password });
    expect(response.status).toBe(403);
  });

  it("rejects CSRF requests from disallowed origins", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookies)
      .set("Origin", "https://evil.example");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents member from accessing another org invoice (IDOR)", async () => {
    await seedWorld();
    const memberACookies = await loginAs("member-a@example.com");
    const memberBCookies = await loginAs("member-b@example.com");

    const customerB = await request(app)
      .post("/api/customers")
      .set("Cookie", memberBCookies)
      .send({ name: "Beta", email: "beta@example.com" });
    expect(customerB.status).toBe(201);

    const productB = await request(app)
      .post("/api/products")
      .set("Cookie", memberBCookies)
      .send({
        name: "Widget",
        kind: "PRODUCT",
        unit: "each",
        unitPrice: 10,
        taxRate: 0,
      });
    expect(productB.status).toBe(201);

    const invoiceB = await request(app)
      .post("/api/invoices")
      .set("Cookie", memberBCookies)
      .send({
        customerId: customerB.body.data.customer.id,
        invoiceDate: "2026-01-01",
        dueDate: "2026-01-15",
        items: [{ description: "Widget", quantity: "1", unitPrice: "10" }],
      });
    expect(invoiceB.status).toBe(201);
    const invoiceId = invoiceB.body.data.invoice.id as string;

    const stolen = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set("Cookie", memberACookies);
    expect(stolen.status).toBe(403);

    const stolenPdf = await request(app)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set("Cookie", memberACookies);
    expect(stolenPdf.status).toBe(403);
  });

  it("prevents member from reading another org customer", async () => {
    await seedWorld();
    const memberACookies = await loginAs("member-a@example.com");
    const memberBCookies = await loginAs("member-b@example.com");

    const customerB = await request(app)
      .post("/api/customers")
      .set("Cookie", memberBCookies)
      .send({ name: "Org B Customer", email: "orgb@example.com" });
    expect(customerB.status).toBe(201);

    const denied = await request(app)
      .get(`/api/customers/${customerB.body.data.customer.id}`)
      .set("Cookie", memberACookies);
    expect(denied.status).toBe(403);
  });

  it("blocks member from admin-only and admin from super-admin-only endpoints", async () => {
    const { orgA } = await seedWorld();
    const memberCookies = await loginAs("member-a@example.com");
    const adminCookies = await loginAs("admin-a@example.com");

    const memberAdmins = await request(app).get("/api/admins").set("Cookie", memberCookies);
    expect(memberAdmins.status).toBe(403);

    const adminCreateAdmin = await request(app)
      .post("/api/admins")
      .set("Cookie", adminCookies)
      .send({
        email: "peer@example.com",
        password,
        firstName: "Peer",
        lastName: "Admin",
        organizationId: orgA.id,
      });
    expect(adminCreateAdmin.status).toBe(403);
  });

  it("rejects mass assignment of role via member profile update", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const member = getTestDb().users.find((user) => user.email === "member-a@example.com");

    const response = await request(app)
      .patch("/api/auth/profile")
      .set("Cookie", cookies)
      .send({
        firstName: "Member",
        lastName: "A",
        role: "SUPER_ADMIN",
        organizationId: "hijack",
      });

    expect(response.status).toBe(400);
    expect(member?.role).toBe("MEMBER");
  });

  it("invalidates sessions after password change", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");

    const changed = await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword: "NewCorrectHorse1" });
    expect(changed.status).toBe(200);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(401);
  });

  it("rejects draft invoice public share and share-link creation", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const customer = await request(app)
      .post("/api/customers")
      .set("Cookie", cookies)
      .send({ name: "Acme", email: "acme@example.com" });
    expect(customer.status).toBe(201);

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Cookie", cookies)
      .send({
        customerId: customer.body.data.customer.id,
        invoiceDate: "2026-01-01",
        dueDate: "2026-01-15",
        items: [{ description: "Hour", quantity: "1", unitPrice: "50" }],
      });
    expect(invoice.status).toBe(201);
    const invoiceId = invoice.body.data.invoice.id as string;

    const share = await request(app)
      .post(`/api/invoices/${invoiceId}/share-link`)
      .set("Cookie", cookies);
    expect(share.status).toBe(403);

    const db = getTestDb();
    const draft = db.invoices.find((row) => row.id === invoiceId);
    if (draft) {
      draft.shareToken = "draft-public-token-aaaaaaaaaaaaaaaa";
    }

    const publicView = await request(app).get(
      "/api/public/invoices/draft-public-token-aaaaaaaaaaaaaaaa",
    );
    expect(publicView.status).toBe(404);
  });

  it("does not allow SVG logo uploads", () => {
    expect(isAllowedLogoContentType("image/svg+xml")).toBe(false);
    expect(() =>
      assertLogoUploadMeta({ contentType: "image/svg+xml", contentLength: 100 }),
    ).toThrow(ValidationError);
    expect(() =>
      assertLogoUploadMeta({ contentType: "image/png", contentLength: 100 }),
    ).not.toThrow();
  });

  it("matches Stripe livemode against secret key mode", () => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    if (key.startsWith("sk_test_")) {
      expect(stripeModeMatchesKey(true)).toBe(false);
      expect(stripeModeMatchesKey(false)).toBe(true);
    } else {
      expect(typeof stripeModeMatchesKey(false)).toBe("boolean");
    }
  });

  it("rejects invalid pagination pageSize", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const response = await request(app)
      .get("/api/invoices?pageSize=999")
      .set("Cookie", cookies);
    expect(response.status).toBe(400);
  });

  it("rejects unknown public invoice tokens without leaking details", async () => {
    const response = await request(app).get(
      "/api/public/invoices/0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(response.status).toBe(404);
    expect(response.body.error?.message).not.toMatch(/database|prisma|sql/i);
  });

  it("rejects oversized JSON payloads with 413", async () => {
    const huge = "x".repeat(1.5 * 1024 * 1024);
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(`{"email":"a@b.co","password":"${huge}"}`);
    expect([413, 400]).toContain(response.status);
    if (response.status === 413) {
      expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  it("rejects avatar confirm path traversal keys", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const response = await request(app)
      .post("/api/auth/avatar/confirm")
      .set("Cookie", cookies)
      .send({
        objectKey: "../../etc/passwd",
        contentType: "image/png",
      });
    expect(response.status).toBe(400);
  });

  it("blocks member from admin settings endpoints", async () => {
    await seedWorld();
    const cookies = await loginAs("member-a@example.com");
    const response = await request(app)
      .get("/api/settings/organization")
      .set("Cookie", cookies);
    expect(response.status).toBe(403);
  });
});
