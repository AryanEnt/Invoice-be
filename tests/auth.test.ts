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
import { bootstrapSuperAdmin } from "../src/services/auth.service.js";
import { getTestDb, resetMemoryDb, seedUser } from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("authentication", () => {
  beforeEach(() => {
    resetMemoryDb(getTestDb());
  });

  async function createActiveUser() {
    return seedUser(getTestDb(), {
      email: "admin@example.com",
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      firstName: "Ada",
      lastName: "Admin",
    });
  }

  it("logs in with valid credentials and returns the current user", async () => {
    await createActiveUser();

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user.email).toBe("admin@example.com");
    expect(loginResponse.body.data.user.passwordHash).toBeUndefined();
    expect(loginResponse.headers["set-cookie"]).toBeDefined();

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Cookie", loginResponse.headers["set-cookie"]);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user.email).toBe("admin@example.com");
    expect(meResponse.body.data.user.role).toBe("ADMIN");
    expect(meResponse.body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects invalid login with a generic error", async () => {
    await createActiveUser();

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.body.error.message).toBe("Invalid email or password");
    expect(getTestDb().auditLogs.some((log) => log.action === "AUTH_LOGIN_FAILED")).toBe(true);
  });

  it("rejects an inactive account after a valid password", async () => {
    seedUser(getTestDb(), {
      email: "inactive@example.com",
      passwordHash: await hashPassword(password),
      role: "MEMBER",
      status: "INACTIVE",
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactive@example.com", password });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("rejects unauthenticated requests to protected routes", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("creates the first SUPER_ADMIN and refuses a duplicate", async () => {
    const first = await bootstrapSuperAdmin({
      email: "super@example.com",
      password,
      firstName: "Super",
      lastName: "Admin",
    });

    expect(first.role).toBe("SUPER_ADMIN");
    expect(first.organizationId).toBeNull();

    await expect(
      bootstrapSuperAdmin({
        email: "another-super@example.com",
        password,
        firstName: "Second",
        lastName: "Admin",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(getTestDb().users.filter((user) => user.role === "SUPER_ADMIN")).toHaveLength(1);
  });

  it("logs out and invalidates the session", async () => {
    await createActiveUser();

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password });

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", loginResponse.headers["set-cookie"]);

    expect(logoutResponse.status).toBe(200);

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Cookie", loginResponse.headers["set-cookie"]);

    expect(meResponse.status).toBe(401);
  });
});
