import type { CookieOptions } from "express";
import { env } from "./env.js";

export const AUTH_COOKIE = {
  name: env.SESSION_COOKIE_NAME,
  days: env.SESSION_DAYS,
} as const;

export function getSessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + AUTH_COOKIE.days * 24 * 60 * 60 * 1000);
}

/**
 * Localhost FE (http://localhost:3000) calling an HTTPS API (ngrok) is cross-site.
 * Browsers only store/send those cookies with SameSite=None; Secure.
 * Driven by API_URL so local-only (http://localhost:4000) keeps SameSite=Lax.
 */
function useCrossSiteCookies(): boolean {
  const apiUrl = env.API_URL?.trim() ?? "";
  return apiUrl.startsWith("https://");
}

export function sessionCookieOptions(): CookieOptions {
  const crossSite = useCrossSiteCookies();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || crossSite,
    sameSite: crossSite ? "none" : "lax",
    signed: true,
    path: "/",
    maxAge: AUTH_COOKIE.days * 24 * 60 * 60 * 1000,
  };
}
