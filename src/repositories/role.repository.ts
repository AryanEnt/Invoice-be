import type { UserRole } from "@prisma/client";
import { ALL_PERMISSION_CODES, ROLE_PERMISSIONS } from "../config/permissions.js";
import { prisma } from "../lib/prisma.js";

export async function seedRolesAndPermissions(): Promise<void> {
  for (const code of ALL_PERMISSION_CODES) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  const permissions = await prisma.permission.findMany();
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));

  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName as UserRole },
      update: {},
      create: {
        name: roleName as UserRole,
        description: `${roleName} role`,
      },
    });

    for (const code of codes) {
      const permission = permissionByCode.get(code);
      if (!permission) {
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}
