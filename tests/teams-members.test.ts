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

describe("teams and members", () => {
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
    const adminB = seedUser(db, {
      email: "admin-b@example.com",
      passwordHash,
      role: "ADMIN",
      organizationId: orgB.id,
    });
    const teamA = seedTeam(db, { organizationId: orgA.id, name: "Alpha", createdById: adminA.id });
    const teamB = seedTeam(db, { organizationId: orgB.id, name: "Bravo", createdById: adminB.id });
    const memberA = seedUser(db, {
      email: "member-a@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgA.id,
    });
    const memberB = seedUser(db, {
      email: "member-b@example.com",
      passwordHash,
      role: "MEMBER",
      organizationId: orgB.id,
    });
    db.teamMembers.push({ teamId: teamA.id, userId: memberA.id });
    db.teamMembers.push({ teamId: teamA.id, userId: adminA.id });
    db.teamMembers.push({ teamId: teamB.id, userId: adminB.id });

    return { orgA, orgB, teamA, teamB, memberA, memberB, adminA, adminB };
  }

  it("allows ADMIN to create and list teams in their organization", async () => {
    await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const created = await request(app)
      .post("/api/teams")
      .set("Cookie", cookies)
      .send({ name: "Delivery", description: "Field team" });

    expect(created.status).toBe(201);
    expect(created.body.data.team.name).toBe("Delivery");
    expect(getTestDb().auditLogs.some((log) => log.action === "TEAM_CREATED")).toBe(true);

    const listed = await request(app).get("/api/teams").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    expect(listed.body.data.items.every((team: { organizationId: string }) => team.organizationId)).toBe(
      true,
    );
    expect(
      listed.body.data.items.every(
        (team: { name: string }) => team.name === "Alpha" || team.name === "Delivery",
      ),
    ).toBe(true);
    expect(listed.body.data.items.some((team: { name: string }) => team.name === "Bravo")).toBe(
      false,
    );
  });

  it("prevents MEMBER from creating a team", async () => {
    await seedActors();
    const cookies = await loginAs("member-a@example.com");

    const response = await request(app)
      .post("/api/teams")
      .set("Cookie", cookies)
      .send({ name: "Unauthorized" });

    expect(response.status).toBe(403);
  });

  it("allows SUPER_ADMIN to view and update teams in any organization without creating them", async () => {
    const { teamA, teamB } = await seedActors();
    const cookies = await loginAs("super@example.com");

    const created = await request(app)
      .post("/api/teams")
      .set("Cookie", cookies)
      .send({ name: "Global" });
    expect(created.status).toBe(403);

    const listed = await request(app).get("/api/teams").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    const ids = listed.body.data.items.map((team: { id: string }) => team.id);
    expect(ids).toEqual(expect.arrayContaining([teamA.id, teamB.id]));

    const updated = await request(app)
      .patch(`/api/teams/${teamB.id}`)
      .set("Cookie", cookies)
      .send({ name: "Bravo Updated" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.team.name).toBe("Bravo Updated");
  });

  it("prevents Admin A from accessing Organization B teams, members, and users", async () => {
    const { orgB, teamB, memberB } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const teamList = await request(app).get("/api/teams").set("Cookie", cookies);
    expect(teamList.status).toBe(200);
    expect(
      teamList.body.data.items.some((team: { id: string }) => team.id === teamB.id),
    ).toBe(false);

    const memberList = await request(app).get("/api/members").set("Cookie", cookies);
    expect(memberList.status).toBe(200);
    expect(
      memberList.body.data.items.some((member: { id: string }) => member.id === memberB.id),
    ).toBe(false);

    const scopedList = await request(app)
      .get(`/api/members?organizationId=${orgB.id}`)
      .set("Cookie", cookies);
    expect(scopedList.status).toBe(403);

    const teamGet = await request(app).get(`/api/teams/${teamB.id}`).set("Cookie", cookies);
    expect(teamGet.status).toBe(403);

    const teamPatch = await request(app)
      .patch(`/api/teams/${teamB.id}`)
      .set("Cookie", cookies)
      .send({ name: "Hijacked" });
    expect(teamPatch.status).toBe(403);

    const memberGet = await request(app).get(`/api/members/${memberB.id}`).set("Cookie", cookies);
    expect(memberGet.status).toBe(403);

    const memberCreate = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "intruder@example.com",
        firstName: "Intruder",
        lastName: "User",
        organizationId: orgB.id,
        password,
        teamIds: [teamB.id],
      });
    expect(memberCreate.status).toBe(403);

    const assign = await request(app)
      .post(`/api/teams/${teamB.id}/members`)
      .set("Cookie", cookies)
      .send({ memberId: memberB.id });
    expect(assign.status).toBe(403);
  });

  it("prevents ADMIN from creating ADMIN or SUPER_ADMIN through members", async () => {
    await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const asAdmin = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "promoted@example.com",
        firstName: "Promo",
        lastName: "User",
        password,
        role: "ADMIN",
      });

    expect(asAdmin.status).toBe(400);
    expect(getTestDb().users.some((user) => user.email === "promoted@example.com")).toBe(false);
  });

  it("creates members, assigns them to teams, and prevents duplicates", async () => {
    const { teamA } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const created = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "  New.Member@Example.com ",
        firstName: "New",
        lastName: "Member",
        password,
        teamIds: [teamA.id],
      });

    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe("MEMBER");
    expect(created.body.data.user.email).toBe("new.member@example.com");
    expect(created.body.data.user.teams[0].id).toBe(teamA.id);
    expect(getTestDb().auditLogs.some((log) => log.action === "MEMBER_CREATED")).toBe(true);
    expect(getTestDb().auditLogs.some((log) => log.action === "MEMBER_ADDED_TO_TEAM")).toBe(true);

    const duplicate = await request(app)
      .post(`/api/teams/${teamA.id}/members`)
      .set("Cookie", cookies)
      .send({ memberId: created.body.data.user.id });

    expect(duplicate.status).toBe(409);

    const roster = await request(app)
      .get(`/api/teams/${teamA.id}/members`)
      .set("Cookie", cookies);
    expect(roster.status).toBe(200);
    expect(roster.body.data.members.length).toBeGreaterThanOrEqual(2);

    const removed = await request(app)
      .delete(`/api/teams/${teamA.id}/members/${created.body.data.user.id}`)
      .set("Cookie", cookies);
    expect(removed.status).toBe(200);
    expect(getTestDb().auditLogs.some((log) => log.action === "MEMBER_REMOVED_FROM_TEAM")).toBe(
      true,
    );
  });

  it("rejects assigning a member to an inactive team or another organization", async () => {
    const { teamA, memberB } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    await request(app)
      .patch(`/api/teams/${teamA.id}/status`)
      .set("Cookie", cookies)
      .send({ status: "INACTIVE" });

    const inactiveAssign = await request(app)
      .post(`/api/teams/${teamA.id}/members`)
      .set("Cookie", cookies)
      .send({ memberId: memberB.id });

    expect(inactiveAssign.status).toBe(403);

    const { teamA: stillA } = await (async () => {
      const dbTeam = getTestDb().teams.find((team) => team.id === teamA.id);
      return { teamA: dbTeam! };
    })();

    stillA.isActive = true;

    const crossOrg = await request(app)
      .post(`/api/teams/${teamA.id}/members`)
      .set("Cookie", cookies)
      .send({ memberId: memberB.id });

    expect(crossOrg.status).toBe(403);
  });

  it("deactivates a member and writes an audit record", async () => {
    const { memberA } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");

    const response = await request(app)
      .patch(`/api/members/${memberA.id}/status`)
      .set("Cookie", cookies)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe("INACTIVE");
    expect(getTestDb().auditLogs.some((log) => log.action === "MEMBER_DEACTIVATED")).toBe(true);
  });

  it("prevents a Member from reading a team they do not belong to", async () => {
    const { teamA } = await seedActors();
    const cookies = await loginAs("admin-a@example.com");
    const created = await request(app)
      .post("/api/teams")
      .set("Cookie", cookies)
      .send({ name: "Ops" });
    expect(created.status).toBe(201);

    const memberCookies = await loginAs("member-a@example.com");
    const allowed = await request(app).get(`/api/teams/${teamA.id}`).set("Cookie", memberCookies);
    expect(allowed.status).toBe(200);

    const denied = await request(app)
      .get(`/api/teams/${created.body.data.team.id}`)
      .set("Cookie", memberCookies);
    expect(denied.status).toBe(403);
  });

  it("lets an Administrator create multiple teams and hides another Administrator's teams", async () => {
    const { orgA } = await seedActors();
    const db = getTestDb();
    const otherAdmin = seedUser(db, {
      email: "admin-c@example.com",
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      organizationId: orgA.id,
    });
    const teamC = seedTeam(db, {
      organizationId: orgA.id,
      name: "Charlie",
      createdById: otherAdmin.id,
    });

    const superCookies = await loginAs("super@example.com");
    const forbiddenCreate = await request(app)
      .post("/api/teams")
      .set("Cookie", superCookies)
      .send({ name: "Platform" });
    expect(forbiddenCreate.status).toBe(403);

    const cookies = await loginAs("admin-a@example.com");
    const delta = await request(app).post("/api/teams").set("Cookie", cookies).send({ name: "Delta" });
    expect(delta.status).toBe(201);

    const listed = await request(app).get("/api/teams").set("Cookie", cookies);
    expect(listed.status).toBe(200);
    const names = listed.body.data.items.map((team: { name: string }) => team.name);
    expect(names).toEqual(expect.arrayContaining(["Alpha", "Delta"]));
    expect(names).not.toContain("Charlie");

    const deniedTeam = await request(app).get(`/api/teams/${teamC.id}`).set("Cookie", cookies);
    expect(deniedTeam.status).toBe(403);
  });

  it("rejects an Administrator assigning a member to an unauthorized team", async () => {
    const { orgA } = await seedActors();
    const db = getTestDb();
    const otherAdmin = seedUser(db, {
      email: "admin-c@example.com",
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      organizationId: orgA.id,
    });
    const teamC = seedTeam(db, {
      organizationId: orgA.id,
      name: "Charlie",
      createdById: otherAdmin.id,
    });
    const cookies = await loginAs("admin-a@example.com");

    const response = await request(app)
      .post("/api/members")
      .set("Cookie", cookies)
      .send({
        email: "outsider@example.com",
        firstName: "Out",
        lastName: "Sider",
        password,
        teamIds: [teamC.id],
      });

    expect(response.status).toBe(403);
    expect(response.body.error?.message ?? response.body.message).toMatch(
      /not authorized to add members to this team/i,
    );
  });
});
