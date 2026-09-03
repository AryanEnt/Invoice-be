import type { NextFunction, Request, Response } from "express";
import { readSessionToken } from "../lib/cookies.js";
import { toAuthUser } from "../lib/public-user.js";
import { resolveSessionUser } from "../services/auth.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  void asyncHandler(async (request, _response, pass) => {
    const user = await resolveSessionUser(readSessionToken(request));
    request.authUser = toAuthUser(user);
    pass();
  })(req, res, next);
}
