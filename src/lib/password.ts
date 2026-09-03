import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

let dummyHashPromise: Promise<string> | undefined;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyPasswordTimingSafe(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  const hash = passwordHash ?? (await getDummyPasswordHash());
  const matches = await verifyPassword(password, hash);
  return passwordHash !== null && matches;
}

function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-safe-dummy-password");
  return dummyHashPromise;
}
