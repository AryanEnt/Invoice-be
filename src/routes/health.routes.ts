import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";
import { healthRateLimit } from "../middleware/app-rate-limits.js";
import { asyncHandler } from "../utils/async-handler.js";

const healthRouter = Router();

healthRouter.get("/", healthRateLimit, asyncHandler(getHealth));

export { healthRouter };
