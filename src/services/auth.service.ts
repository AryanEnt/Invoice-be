import { getSessionExpiry } from "../config/auth.js";
import {
  AccountInactiveError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../lib/errors.js";
import { hashPassword, verifyPassword, verifyPasswordTimingSafe } from "../lib/password.js";
import { toPublicUser } from "../lib/public-user.js";
import { createSessionToken, hashSessionToken } from "../lib/session-token.js";
import { isR2Configured } from "../integrations/storage/r2.client.js";
import {
  assertLogoUploadMeta,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  headObject,
} from "../integrations/storage/r2.service.js";
import { randomUUID } from "node:crypto";
import {
  createSession,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
} from "../repositories/session.repository.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  countUsersByRole,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByIdWithProfile,
  updateUser,
} from "../repositories/user.repository.js";
import type { PublicUser, UserRecord } from "../types/auth.js";
import { recordAudit } from "./audit.service.js";

const GENERIC_LOGIN_FAILURE = "Invalid email or password";

async function assertActiveOrganization(organizationId: string | null): Promise<void> {
  if (!organizationId) {
    return;
  }
  const organization = await findOrganizationById(organizationId);
  if (!organization || !organization.isActive) {
    throw new AccountInactiveError("This organization is inactive");
  }
}

async function withAvatar(
  user: UserRecord & {
    administrator?: { id: string; firstName: string; lastName: string; email: string } | null;
  },
): Promise<PublicUser> {
  let avatarUrl: string | null = null;
  if (user.avatarObjectKey && isR2Configured()) {
    try {
      avatarUrl = await createPresignedDownloadUrl({
        key: user.avatarObjectKey,
        expiresInSeconds: 60 * 30,
      });
    } catch {
      avatarUrl = null;
    }
  }
  return toPublicUser(user, avatarUrl);
}

async function loadActivePublicUser(userId: string): Promise<PublicUser> {
  const user = await findUserByIdWithProfile(userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UnauthorizedError("Authentication required");
  }

  await assertActiveOrganization(user.organizationId);

  return withAvatar(user);
}

function buildAvatarKey(userId: string, contentType: string): string {
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/svg+xml"
          ? "svg"
          : "jpg";
  return `users/${userId}/avatar/${randomUUID()}.${ext}`;
}

function isAvatarKey(userId: string, key: string): boolean {
  return key.startsWith(`users/${userId}/avatar/`);
}

export async function login(input: {
  email: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ user: PublicUser; token: string }> {
  const user = await findUserByEmail(input.email);
  const passwordValid = await verifyPasswordTimingSafe(input.password, user?.passwordHash ?? null);

  if (!user || !passwordValid) {
    if (user) {
      await recordAudit({
        actorId: user.id,
        action: "AUTH_LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        organizationId: user.organizationId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    }
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE);
  }

  if (user.status !== "ACTIVE") {
    throw new AccountInactiveError();
  }

  await assertActiveOrganization(user.organizationId);

  const token = createSessionToken();
  await createSession({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: getSessionExpiry(),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const updated = await updateUser(user.id, { lastLoginAt: new Date() });

  await recordAudit({
    actorId: user.id,
    action: "AUTH_LOGIN",
    entity: "User",
    entityId: user.id,
    organizationId: user.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return { user: await loadActivePublicUser(updated.id), token };
}

export async function logout(input: {
  token: string | undefined;
  actorId: string;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  if (input.token) {
    await deleteSessionByTokenHash(hashSessionToken(input.token));
  }

  await recordAudit({
    actorId: input.actorId,
    action: "AUTH_LOGOUT",
    entity: "User",
    entityId: input.actorId,
    organizationId: input.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function getAuthenticatedUser(userId: string): Promise<PublicUser> {
  return loadActivePublicUser(userId);
}

export async function updateProfile(
  actorId: string,
  input: { firstName: string; lastName: string; phone?: string | null },
): Promise<PublicUser> {
  const user = await findUserById(actorId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const updated = await updateUser(actorId, {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone?.trim() || null,
  });

  await recordAudit({
    actorId,
    action: "PROFILE_UPDATED",
    entity: "User",
    entityId: actorId,
    organizationId: updated.organizationId,
  });

  return loadActivePublicUser(actorId);
}

export async function changePassword(
  actorId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await findUserById(actorId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ForbiddenError("Current password is incorrect");
  }

  if (input.newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters");
  }

  await updateUser(actorId, { passwordHash: await hashPassword(input.newPassword) });

  await recordAudit({
    actorId,
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: actorId,
    organizationId: user.organizationId,
  });
}

export async function createAvatarUploadUrl(
  actorId: string,
  input: { contentType: string; contentLength: number },
): Promise<{ uploadUrl: string; objectKey: string; expiresInSeconds: number }> {
  if (!isR2Configured()) {
    throw new ServiceUnavailableError("File storage is not configured yet.", "R2_NOT_CONFIGURED");
  }
  assertLogoUploadMeta(input);
  const objectKey = buildAvatarKey(actorId, input.contentType);
  const expiresInSeconds = 60 * 5;
  const uploadUrl = await createPresignedUploadUrl({
    key: objectKey,
    contentType: input.contentType,
    expiresInSeconds,
  });
  return { uploadUrl, objectKey, expiresInSeconds };
}

export async function confirmAvatarUpload(
  actorId: string,
  input: { objectKey: string; contentType: string },
): Promise<PublicUser> {
  if (!isR2Configured()) {
    throw new ServiceUnavailableError("File storage is not configured yet.", "R2_NOT_CONFIGURED");
  }
  const user = await findUserById(actorId);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  if (!isAvatarKey(actorId, input.objectKey)) {
    throw new ValidationError("Invalid avatar upload key");
  }
  assertLogoUploadMeta({ contentType: input.contentType, contentLength: 1 });
  const head = await headObject(input.objectKey);
  if (!head) {
    throw new ValidationError("Avatar upload was not found. Please try again.");
  }
  if (head.contentLength !== undefined) {
    assertLogoUploadMeta({
      contentType: input.contentType,
      contentLength: head.contentLength,
    });
  }

  const previous = user.avatarObjectKey;
  const updated = await updateUser(actorId, { avatarObjectKey: input.objectKey });
  if (previous && previous !== input.objectKey) {
    try {
      await deleteObject(previous);
    } catch {
      // best effort
    }
  }

  await recordAudit({
    actorId,
    action: "AVATAR_UPDATED",
    entity: "User",
    entityId: actorId,
    organizationId: updated.organizationId,
  });

  return loadActivePublicUser(actorId);
}

export async function removeAvatar(actorId: string): Promise<PublicUser> {
  const user = await findUserById(actorId);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  const previous = user.avatarObjectKey;
  await updateUser(actorId, { avatarObjectKey: null });
  if (previous && isR2Configured()) {
    try {
      await deleteObject(previous);
    } catch {
      // best effort
    }
  }
  return loadActivePublicUser(actorId);
}

export async function resolveSessionUser(token: string | undefined): Promise<UserRecord> {
  if (!token) {
    throw new UnauthorizedError();
  }

  const session = await findSessionByTokenHash(hashSessionToken(token));

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await deleteSessionByTokenHash(session.tokenHash);
    }
    throw new UnauthorizedError();
  }

  const user = await findUserById(session.userId);

  if (!user || user.status !== "ACTIVE") {
    throw new UnauthorizedError();
  }

  await assertActiveOrganization(user.organizationId);

  return user;
}

export async function bootstrapSuperAdmin(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<UserRecord> {
  const existing = await countUsersByRole("SUPER_ADMIN");

  if (existing > 0) {
    throw new ConflictError("A SUPER_ADMIN account already exists");
  }

  const duplicate = await findUserByEmail(input.email);
  if (duplicate) {
    throw new ConflictError("A user with this email already exists");
  }

  return createUser({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    firstName: input.firstName,
    lastName: input.lastName,
    role: "SUPER_ADMIN",
    organizationId: null,
  });
}
