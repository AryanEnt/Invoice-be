import { getRolePermissions } from "../config/permissions.js";
import type { AdminRecord, AdminView, AuthUser, PublicUser, UserRecord, AdministratorSummary } from "../types/auth.js";

type UserProfileRecord = UserRecord & {
  administrator?: AdministratorSummary | null;
};

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    organizationId: user.organizationId,
    permissions: getRolePermissions(user.role),
  };
}

export function toPublicUser(user: UserProfileRecord, avatarUrl: string | null = null): PublicUser {
  const administrator = user.administrator
    ? {
        id: user.administrator.id,
        firstName: user.administrator.firstName,
        lastName: user.administrator.lastName,
        email: user.administrator.email,
      }
    : null;

  return {
    ...toAuthUser(user),
    phone: user.phone,
    avatarUrl,
    administrator,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toAdminView(user: AdminRecord, avatarUrl: string | null = null): AdminView {
  return {
    ...toPublicUser(user, avatarUrl),
    organization: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          isActive: user.organization.isActive,
        }
      : null,
    memberCount: user._count?.managedMembers ?? user.managedMembers?.length ?? 0,
  };
}
