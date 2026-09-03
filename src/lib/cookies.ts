import type { Request, Response } from "express";
import { AUTH_COOKIE, sessionCookieOptions } from "../config/auth.js";

export function readSessionToken(req: Request): string | undefined {
  const signed = req.signedCookies?.[AUTH_COOKIE.name];
  return typeof signed === "string" && signed.length > 0 ? signed : undefined;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE.name, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE.name, sessionCookieOptions());
}
