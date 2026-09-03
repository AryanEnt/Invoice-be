import { toPublicUser } from "./public-user.js";
import type { MemberView, OrganizationRecord, UserRecord } from "../types/auth.js";

export interface AdministratorSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function toMemberView(
  user: UserRecord & {
    administrator?: AdministratorSummary | null;
  },
  organization: OrganizationRecord | null,
  administrator: AdministratorSummary | null,
): MemberView {
  return {
    ...toPublicUser({ ...user, administrator: administrator ?? user.administrator ?? null }),
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          isActive: organization.isActive,
        }
      : null,
    administrator: administrator
      ? {
          id: administrator.id,
          firstName: administrator.firstName,
          lastName: administrator.lastName,
          email: administrator.email,
        }
      : null,
  };
}
