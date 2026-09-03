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
  seedTeam,
  seedUser,
} from "./helpers/memory-db.js";

const password = "CorrectHorse1";

describe("RBAC", () => {
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
    const adminA = seedUser(db, {
      email: "admin-a@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgA.id,
    });
    const teamA = seedTeam(db, { organizationId: orgA.id, name: "Team A", createdById: adminA.id });
    const teamB = seedTeam(db, { organizationId: orgB.id, name: "Team B" });
    const memberA = seedUser(db, {
      email: "member-a@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });
    db.teamMembers.push({ teamId: teamA.id, userId: memberA.id });

    return { orgA, orgB, teamA, teamB, memberA };
  }

  it("allows SUPER_ADMIN to create an ADMIN", async () => {
    const { orgA } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "new-admin@example.com",
        password,
        firstName: "New",
        lastName: "Admin",
        organizationId: orgA.id,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("ADMIN");
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it("allows ADMIN to create a MEMBER in their organization", async () => {
    const { orgA, teamA } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const response = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "new-member@example.com",
        password,
        firstName: "New",
        lastName: "Member",
        organizationId: orgA.id,
        teamIds: [teamA.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("MEMBER");
    expect(response.body.data.user.organizationId).toBe(orgA.id);
  });

  it("allows MEMBER to access an assigned team and denies ADMIN-only actions", async () => {
    const { teamA } = await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const teamResponse = await request(app)
      .get(`/api/teams/${teamA.id}`)
      .set("Cookie", cookies);

    expect(teamResponse.status).toBe(200);
    expect(teamResponse.body.data.team.id).toBe(teamA.id);

    const createMemberResponse = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "escalated@example.com",
        password,
        firstName: "Nope",
        lastName: "Nope",
      });

    expect(createMemberResponse.status).toBe(403);
  });

  it("prevents MEMBER privilege escalation", async () => {
    const { memberA, orgA } = await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const createAdmin = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "evil-admin@example.com",
        password,
        firstName: "Evil",
        lastName: "Admin",
        organizationId: orgA.id,
      });

    expect(createAdmin.status).toBe(403);

    const changeRole = await request(app)
      .patch(`/api/members/${memberA.id}`)
      .set("Cookie", cookies)
      .send({ role: "ADMIN" });

    expect(changeRole.status).toBe(403);
    expect(getTestDb().users.find((user) => user.id === memberA.id)?.role).toBe("MEMBER");
  });

  it("prevents ADMIN from creating another ADMIN", async () => {
    const { orgA } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const response = await request(app)
      .post("/api/admins")
      .set("Cookie", cookies)
      .send({
        email: "peer-admin@example.com",
        password,
        firstName: "Peer",
        lastName: "Admin",
        organizationId: orgA.id,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents access to another team's records", async () => {
    const { teamB } = await seedActors();
    const adminCookies = await loginAs("admin-a@example.com");
    const memberCookies = await loginAs("member-a@example.com");

    const memberCreate = await request(app)
      .post("/api/members")
      .set("Cookie", adminCookies)
      .send({
        email: "other-org-member@example.com",
        password,
        firstName: "Other",
        lastName: "Org",
        organizationId: teamB.organizationId,
        teamIds: [teamB.id],
      });

    expect(memberCreate.status).toBe(403);

    const teamResponse = await request(app)
      .get(`/api/teams/${teamB.id}`)
      .set("Cookie", memberCookies);

    expect(teamResponse.status).toBe(403);
  });

  it("ignores a role sent by the browser when creating a member", async () => {
    await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const response = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "role-injection@example.com",
        password,
        firstName: "Role",
        lastName: "Injection",
        role: "ADMIN",
      });

    expect(response.status).toBe(400);
    expect(
      getTestDb().users.some((user) => user.email === "role-injection@example.com"),
    ).toBe(false);
  });
});
