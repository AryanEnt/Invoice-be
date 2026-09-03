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
// import { loginRateLimit } from "../middleware/login-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const authRouter = Router();

authRouter.post("/login", /* loginRateLimit, */ asyncHandler(loginController));
authRouter.post("/logout", requireAuth, asyncHandler(logoutController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.patch("/profile", requireAuth, asyncHandler(updateProfileController));
authRouter.post("/password", requireAuth, asyncHandler(changePasswordController));
authRouter.post("/avatar/upload-url", requireAuth, asyncHandler(createAvatarUploadUrlController));
authRouter.post("/avatar/confirm", requireAuth, asyncHandler(confirmAvatarController));
authRouter.delete("/avatar", requireAuth, asyncHandler(removeAvatarController));

export { authRouter };
