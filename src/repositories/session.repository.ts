import { prisma } from "../lib/prisma.js";
import type { SessionRecord } from "../types/auth.js";

export async function createSession(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<SessionRecord> {
  return prisma.session.create({ data });
}

export async function findSessionByTokenHash(
  tokenHash: string,
): Promise<SessionRecord | null> {
  return prisma.session.findUnique({
    where: { tokenHash },
  });
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}

export async function deleteExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });
}
