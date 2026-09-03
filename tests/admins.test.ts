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
vi.mock("../src/repositories/audit.repository.js", async () => {
  const { getTestRepos } = await import("./helpers/memory-db.js");
  return getTestRepos().audit;
});
vi.mock("../src/repositories/health.repository.js", () => ({
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
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

describe("admin management", () => {
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
    const org = seedOrganization(db, { name: "Northwind", slug: "northwind" });
    const passwordHash = await hashPassword(password);

    seedUser(db, {
      email: "super@example.com",
      passwordHash,
      role: "SUPER_ADMIN",
    });
    seedUser(db, {
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: org.id,
    });
    seedUser(db, {
      email: "member@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: org.id,
    });

    return { org };
  }

  it("allows Super Admin to create an Admin", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "  New.Admin@Example.com ",
        firstName: "New",
        lastName: "Admin",
        phone: "555-0100",
        organizationId: org.id,
        temporaryPassword: password,
        status: "ACTIVE",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("new.admin@example.com");
    expect(response.body.data.user.role).toBe("ADMIN");
    expect(response.body.data.user.phone).toBe("555-0100");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.invitationToken).toEqual(expect.any(String));
    expect(getTestDb().auditLogs.some((log) => log.action === "ADMIN_CREATED")).toBe(true);
  });

  it("rejects Admin creating another Admin", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("admin@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "peer@example.com",
        firstName: "Peer",
        lastName: "Admin",
        organizationId: org.id,
        password,
      });

    expect(response.status).toBe(403);
  });

  it("rejects Member creating an Admin", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("member@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "evil@example.com",
        firstName: "Evil",
        lastName: "Admin",
        organizationId: org.id,
        password,
      });

    expect(response.status).toBe(403);
  });

  it("rejects a duplicate admin email", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const first = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "dup@example.com",
        firstName: "First",
        lastName: "Admin",
        organizationId: org.id,
        password,
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "DUP@example.com",
        firstName: "Second",
        lastName: "Admin",
        organizationId: org.id,
        password,
      });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("rejects unauthorized access to admin management", async () => {
    await seedActors();

    const unauthenticated = await request(app).get("/api/admins");
    expect(unauthenticated.status).toBe(401);

    const cookies = await loginAs("admin@example.com");
    const forbidden = await request(app).get("/api/admins").set("Cookie", cookies);
    expect(forbidden.status).toBe(403);
  });

  it("prevents creating a SUPER_ADMIN through the admin API", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "root@example.com",
        firstName: "Root",
        lastName: "User",
        organizationId: org.id,
        password,
        role: "SUPER_ADMIN",
      });

    expect(response.status).toBe(400);
    expect(getTestDb().users.some((user) => user.email === "root@example.com")).toBe(false);
  });

  it("deactivates an Admin and prevents authentication", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const created = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "temp-admin@example.com",
        firstName: "Temp",
        lastName: "Admin",
        organizationId: org.id,
        temporaryPassword: password,
      });

    expect(created.status).toBe(201);
    const adminId = created.body.data.user.id as string;

    const adminCookies = await loginAs("temp-admin@example.com");
    const meBefore = await request(app).get("/api/auth/me").set("Cookie", adminCookies);
    expect(meBefore.status).toBe(200);

    const deactivated = await request(app)
      .patch(`/api/admins/${adminId}/status`)
      .set("Cookie", cookies)
      .send({ status: "INACTIVE" });

    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.user.status).toBe("INACTIVE");
    expect(getTestDb().auditLogs.some((log) => log.action === "ADMIN_DEACTIVATED")).toBe(true);

    const staleSession = await request(app).get("/api/auth/me").set("Cookie", adminCookies);
    expect(staleSession.status).toBe(401);

    const loginAfter = await request(app)
      .post("/api/auth/login")
      .send({ email: "temp-admin@example.com", password });

    expect(loginAfter.status).toBe(403);
    expect(loginAfter.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("lists, filters, and updates administrators", async () => {
    const { org } = await seedActors();
    const cookies = await loginAs("super@example.com");

    await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "searchable@example.com",
        firstName: "Search",
        lastName: "Able",
        organizationId: org.id,
        password,
      });

    const listed = await request(app)
      .get("/api/admins")
      .query({ search: "searchable", page: 1, pageSize: 10 })
      .set("Cookie", cookies);

    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.total).toBe(1);

    const adminId = listed.body.data.items[0].id as string;

    const updated = await request(app)
      .patch(`/api/admins/${adminId}`)
      .set("Cookie", cookies)
      .send({ firstName: "Updated", phone: "555-0199" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.user.firstName).toBe("Updated");
    expect(updated.body.data.user.phone).toBe("555-0199");
    expect(getTestDb().auditLogs.some((log) => log.action === "ADMIN_UPDATED")).toBe(true);
  });
});
