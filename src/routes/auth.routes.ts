import { Router } from "express";
import {
  changePasswordController,
  confirmAvatarController,
  createAvatarUploadUrlController,
  loginController,
  logoutController,
  meController,
  removeAvatarController,
  updateProfileController,
} from "../controllers/auth.controller.js";
import { loginAccountRateLimit, loginIpRateLimit, authMutationRateLimit, uploadRateLimit } from "../middleware/app-rate-limits.js";
import { optionalAuth } from "../middleware/optional-auth.js";
import { requireAuth } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const authRouter = Router();

authRouter.post(
  "/login",
  loginIpRateLimit,
  loginAccountRateLimit,
  asyncHandler(loginController),
);
authRouter.post("/logout", optionalAuth, asyncHandler(logoutController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.patch(
  "/profile",
  requireAuth,
  authMutationRateLimit,
  asyncHandler(updateProfileController),
);
authRouter.post(
  "/password",
  requireAuth,
  authMutationRateLimit,
  asyncHandler(changePasswordController),
);
authRouter.post(
  "/avatar/upload-url",
  requireAuth,
  uploadRateLimit,
  asyncHandler(createAvatarUploadUrlController),
);
authRouter.post(
  "/avatar/confirm",
  requireAuth,
  uploadRateLimit,
  asyncHandler(confirmAvatarController),
);
authRouter.delete("/avatar", requireAuth, asyncHandler(removeAvatarController));

export { authRouter };
