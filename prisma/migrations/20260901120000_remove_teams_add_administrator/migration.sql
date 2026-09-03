-- Add administrator ownership to users and customers
ALTER TABLE "users" ADD COLUMN "administratorId" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_administratorId_fkey"
  FOREIGN KEY ("administratorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_administratorId_idx" ON "users"("administratorId");

ALTER TABLE "customers" ADD COLUMN "administratorId" TEXT;
ALTER TABLE "customers" ADD CONSTRAINT "customers_administratorId_fkey"
  FOREIGN KEY ("administratorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "customers_administratorId_idx" ON "customers"("administratorId");

-- Backfill member administratorId from team ownership
UPDATE "users" AS u
SET "administratorId" = t."createdById"
FROM "team_members" AS tm
JOIN "teams" AS t ON t.id = tm."teamId"
WHERE u.id = tm."userId"
  AND u.role = 'MEMBER'
  AND t."createdById" IS NOT NULL;

-- Backfill customer administratorId from the first admin in the organization
UPDATE "customers" AS c
SET "administratorId" = sub."adminId"
FROM (
  SELECT DISTINCT ON (c2.id)
    c2.id AS "customerId",
    u.id AS "adminId"
  FROM "customers" c2
  JOIN "users" u ON u."organizationId" = c2."organizationId" AND u.role = 'ADMIN'
  ORDER BY c2.id, u."createdAt" ASC
) AS sub
WHERE c.id = sub."customerId";

-- Remove team assignment from invoices
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_assignedTeamId_fkey";
DROP INDEX IF EXISTS "invoices_assignedTeamId_idx";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "assignedTeamId";

-- Drop team tables
DROP TABLE IF EXISTS "team_members";
DROP TABLE IF EXISTS "teams";
