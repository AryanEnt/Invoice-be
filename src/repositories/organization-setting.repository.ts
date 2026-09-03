import { prisma } from "../lib/prisma.js";

export async function getOrganizationSetting(
  organizationId: string,
  key: string,
): Promise<string | null> {
  const row = await prisma.organizationSetting.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  return row?.value ?? null;
}

export async function getOrganizationSettingsMap(
  organizationId: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  const rows = await prisma.organizationSetting.findMany({
    where: {
      organizationId,
      key: { in: keys },
    },
  });
  const map: Record<string, string | null> = {};
  for (const key of keys) {
    map[key] = null;
  }
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export async function upsertOrganizationSetting(
  organizationId: string,
  key: string,
  value: string,
): Promise<void> {
  await prisma.organizationSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value },
    update: { value },
  });
}

export async function upsertOrganizationSettings(
  organizationId: string,
  entries: Record<string, string>,
): Promise<void> {
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.organizationSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: { organizationId, key, value },
        update: { value },
      }),
    ),
  );
}
