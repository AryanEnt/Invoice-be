import type { CookieOptions } from "express";
import { env } from "./env.js";

export const AUTH_COOKIE = {
  name: env.SESSION_COOKIE_NAME,
  days: env.SESSION_DAYS,
} as const;

export function getSessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + AUTH_COOKIE.days * 24 * 60 * 60 * 1000);
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    path: "/",
    maxAge: AUTH_COOKIE.days * 24 * 60 * 60 * 1000,
  };
}
