import type { NextFunction, Request, Response } from "express";
import { corsOrigins } from "../config/env.js";
import { failure } from "../utils/api-response.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Defense-in-depth for cookie-authenticated mutating requests when
 * session cookies may be SameSite=None (cross-site FE ↔ API).
 *
 * Browsers send Origin on cross-site POSTs. If Origin/Referer is present
 * and not in CORS_ORIGIN, reject. Requests with neither (webhooks, curl,
 * server tools) are allowed — those do not carry browser cookies from a
 * victim's session in the classic CSRF model.
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const refererOrigin = originFromReferer(
    typeof req.headers.referer === "string" ? req.headers.referer : undefined,
  );
  const candidate = origin ?? refererOrigin;

  if (!candidate) {
    next();
    return;
  }

  if (corsOrigins.includes(candidate)) {
    next();
    return;
  }

  res.status(403).json(failure("FORBIDDEN", "Request origin is not allowed"));
}
