import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { failure } from "../utils/api-response.js";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json(
      failure("TOO_MANY_REQUESTS", "Too many login attempts. Try again later."),
    );
  },
});
