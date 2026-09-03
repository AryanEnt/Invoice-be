import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL:
        "postgresql://outinvoice:outinvoice@localhost:5432/outinvoice?schema=public",
      JWT_SECRET: "test-jwt-secret-must-be-long",
      CORS_ORIGIN: "http://localhost:3000",
      BCRYPT_ROUNDS: "4",
      SESSION_COOKIE_NAME: "sid",
      SESSION_DAYS: "7",
    },
  },
});
