import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";

vi.mock("../src/repositories/health.repository.js", () => ({
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe("GET /api/health", () => {
  it("returns a successful health payload", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.service).toBe("outinvoice-api");
    expect(response.body.data.database).toBe("connected");
    expect(typeof response.body.data.timestamp).toBe("string");
  });

  it("returns a structured error for unknown routes", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.body.error.message).toBeTruthy();
  });
});
