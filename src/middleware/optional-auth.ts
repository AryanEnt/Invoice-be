import type { NextFunction, Request, Response } from "express";
import { readSessionToken } from "../lib/cookies.js";
import { toAuthUser } from "../lib/public-user.js";
import { resolveSessionUser } from "../services/auth.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  void asyncHandler(async (request, _response, pass) => {
    const token = readSessionToken(request);
    if (!token) {
      pass();
      return;
    }
    try {
      const user = await resolveSessionUser(token);
      request.authUser = toAuthUser(user);
    } catch {
      /* unauthenticated callback still validates OAuth state */
    }
    pass();
  })(req, res, next);
}
